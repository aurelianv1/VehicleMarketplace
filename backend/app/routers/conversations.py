from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.deps import CurrentUser, DbSession
from app.models.enums import ListingStatus
from app.models.listing import Listing
from app.models.message import Conversation, Message
from app.models.user import User
from app.schemas.message import (
    ConversationDetail,
    ConversationListing,
    ConversationRead,
    ConversationStart,
    ConversationUser,
    MessageCreate,
    MessageRead,
)
from app.services import listing_service as svc
from app.services.realtime import manager

router = APIRouter(prefix="/conversations", tags=["messages"])


def _get_for_participant(db: Session, conversation_id: int, user: User) -> Conversation:
    conversation = db.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(
            selectinload(Conversation.listing).selectinload(Listing.images),
            selectinload(Conversation.buyer),
            selectinload(Conversation.seller),
        )
    )
    # Același 404 și pentru „nu există” și pentru „nu e a ta”: nu dezvăluim ce id-uri există.
    # Nici adminii nu citesc conversațiile altora.
    if conversation is None or user.id not in (conversation.buyer_id, conversation.seller_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversația nu există")
    return conversation


def _to_read(c: Conversation, user: User, last: Message | None, unread: int) -> ConversationRead:
    other = c.seller if user.id == c.buyer_id else c.buyer
    return ConversationRead(
        id=c.id,
        listing=ConversationListing(
            id=c.listing.id,
            title=c.listing.title,
            price=c.listing.price,
            currency=c.listing.currency,
            status=c.listing.status,
            main_image=svc.main_image_url(c.listing),
        ),
        other_user=ConversationUser(id=other.id, full_name=other.full_name),
        role="buyer" if user.id == c.buyer_id else "seller",
        last_message=MessageRead.model_validate(last) if last else None,
        unread_count=unread,
        last_message_at=c.last_message_at,
    )


def _mark_read(db: Session, conversation: Conversation, reader: User) -> list[int]:
    """Marchează ca citite mesajele primite de `reader`. Întoarce id-urile atinse."""
    ids = db.scalars(
        update(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.sender_id != reader.id,
            Message.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
        .returning(Message.id)
    ).all()
    db.commit()
    return list(ids)


def _add_message(db: Session, conversation: Conversation, sender: User, body: str) -> Message:
    message = Message(conversation_id=conversation.id, sender_id=sender.id, body=body)
    db.add(message)
    db.flush()  # avem nevoie de created_at generat de baza de date
    db.refresh(message)
    conversation.last_message_at = message.created_at
    db.commit()
    db.refresh(message)
    return message


def _notify_message(background: BackgroundTasks, conversation: Conversation, message: Message) -> None:
    # Ambii participanți primesc evenimentul: destinatarul pentru notificare,
    # expeditorul ca să-și vadă mesajul și în celelalte tab-uri deschise.
    # BackgroundTasks rulează după trimiterea răspunsului HTTP, în bucla async.
    background.add_task(
        manager.send_to_users,
        [conversation.buyer_id, conversation.seller_id],
        {"type": "message", "message": jsonable_encoder(MessageRead.model_validate(message))},
    )


def _notify_read(background: BackgroundTasks, conversation: Conversation, reader: User, ids: list[int]) -> None:
    if ids:
        background.add_task(
            manager.send_to_users,
            [conversation.other_user_id(reader.id), reader.id],
            {"type": "read", "conversation_id": conversation.id, "reader_id": reader.id, "message_ids": ids},
        )


@router.get("", response_model=list[ConversationRead])
def list_conversations(db: DbSession, user: CurrentUser) -> list[ConversationRead]:
    conversations = db.scalars(
        select(Conversation)
        .where(or_(Conversation.buyer_id == user.id, Conversation.seller_id == user.id))
        .options(
            selectinload(Conversation.listing).selectinload(Listing.images),
            selectinload(Conversation.buyer),
            selectinload(Conversation.seller),
        )
        .order_by(Conversation.last_message_at.desc(), Conversation.id.desc())
    ).all()
    ids = [c.id for c in conversations]
    if not ids:
        return []

    # Două interogări pentru toate conversațiile (nu câte două per conversație):
    # ultimul mesaj al fiecăreia (DISTINCT ON e specific PostgreSQL) …
    last_messages = {
        m.conversation_id: m
        for m in db.scalars(
            select(Message)
            .where(Message.conversation_id.in_(ids))
            .distinct(Message.conversation_id)
            .order_by(Message.conversation_id, Message.id.desc())
        )
    }
    # … și numărul de mesaje necitite primite
    unread = dict(
        db.execute(
            select(Message.conversation_id, func.count())
            .where(
                Message.conversation_id.in_(ids),
                Message.sender_id != user.id,
                Message.read_at.is_(None),
            )
            .group_by(Message.conversation_id)
        ).all()
    )
    return [_to_read(c, user, last_messages.get(c.id), unread.get(c.id, 0)) for c in conversations]


@router.get("/unread-count")
def unread_count(db: DbSession, user: CurrentUser) -> dict[str, int]:
    """Pentru bulina din meniu: câte mesaje necitite am primit în total."""
    count = db.scalar(
        select(func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            or_(Conversation.buyer_id == user.id, Conversation.seller_id == user.id),
            Message.sender_id != user.id,
            Message.read_at.is_(None),
        )
    )
    return {"count": count or 0}


@router.post("", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
def start_conversation(
    payload: ConversationStart, db: DbSession, user: CurrentUser, background: BackgroundTasks
) -> ConversationDetail:
    """Trimite un mesaj vânzătorului. Dacă există deja o conversație despre anunț, o continuă."""
    listing = db.get(Listing, payload.listing_id)
    if listing is None or listing.status == ListingStatus.draft:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anunțul nu există")
    if listing.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nu îți poți trimite mesaj la propriul anunț")

    conversation = db.scalar(
        select(Conversation).where(
            Conversation.listing_id == listing.id, Conversation.buyer_id == user.id
        )
    )
    if conversation is None:
        if listing.status != ListingStatus.active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anunțul nu mai este activ")
        conversation = Conversation(listing_id=listing.id, buyer_id=user.id, seller_id=listing.user_id)
        db.add(conversation)
        try:
            db.commit()
        except IntegrityError:
            # Două cereri simultane (dublu-click): constrângerea unică a oprit-o pe a doua
            db.rollback()
            conversation = db.scalar(
                select(Conversation).where(
                    Conversation.listing_id == listing.id, Conversation.buyer_id == user.id
                )
            )

    message = _add_message(db, conversation, user, payload.body)
    _notify_message(background, conversation, message)
    return _detail(db, conversation.id, user)


def _detail(db: Session, conversation_id: int, user: User) -> ConversationDetail:
    db.expire_all()
    c = _get_for_participant(db, conversation_id, user)
    messages = list(c.messages)
    unread = sum(1 for m in messages if m.sender_id != user.id and m.read_at is None)
    base = _to_read(c, user, messages[-1] if messages else None, unread)
    return ConversationDetail(**base.model_dump(), messages=[MessageRead.model_validate(m) for m in messages])


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int, db: DbSession, user: CurrentUser, background: BackgroundTasks
) -> ConversationDetail:
    """Firul complet. Deschiderea lui marchează ca citite mesajele primite."""
    conversation = _get_for_participant(db, conversation_id, user)
    _notify_read(background, conversation, user, _mark_read(db, conversation, user))
    return _detail(db, conversation_id, user)


@router.post("/{conversation_id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def send_message(
    conversation_id: int,
    payload: MessageCreate,
    db: DbSession,
    user: CurrentUser,
    background: BackgroundTasks,
) -> Message:
    conversation = _get_for_participant(db, conversation_id, user)
    message = _add_message(db, conversation, user, payload.body)
    _notify_message(background, conversation, message)
    return message


@router.post("/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    conversation_id: int, db: DbSession, user: CurrentUser, background: BackgroundTasks
) -> None:
    """Apelat de frontend când sosește un mesaj nou într-o conversație deja deschisă."""
    conversation = _get_for_participant(db, conversation_id, user)
    _notify_read(background, conversation, user, _mark_read(db, conversation, user))
