import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool

from app.core.security import ACCESS_TOKEN, decode_token
from app.db.session import SessionLocal
from app.models.user import User
from app.services.realtime import manager

router = APIRouter(tags=["messages"])

AUTH_TIMEOUT_SECONDS = 10
# Coduri de închidere proprii (4000–4999 sunt rezervate aplicațiilor)
CLOSE_UNAUTHORIZED = 4401


def _active_user_id(token: str) -> int | None:
    user_id = decode_token(token, ACCESS_TOKEN)
    if user_id is None:
        return None
    with SessionLocal() as db:
        user = db.get(User, user_id)
        return user.id if user and user.is_active else None


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Canal de notificări în timp real (mesaje noi, mesaje citite).

    Autentificarea se face cu PRIMUL mesaj, {"type": "auth", "token": "<access token>"},
    nu prin URL: browserul nu poate pune header-ul Authorization pe un WebSocket,
    iar un token în URL ar ajunge în log-urile serverului.
    """
    await ws.accept()

    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=AUTH_TIMEOUT_SECONDS)
    except (asyncio.TimeoutError, WebSocketDisconnect, ValueError):
        await _close(ws, CLOSE_UNAUTHORIZED, "Autentificare lipsă")
        return

    token = first.get("token") if isinstance(first, dict) and first.get("type") == "auth" else None
    # Interogarea e sincronă (SQLAlchemy clasic): o rulăm în thread pool ca să nu blocăm bucla
    user_id = await run_in_threadpool(_active_user_id, token) if isinstance(token, str) else None
    if user_id is None:
        await _close(ws, CLOSE_UNAUTHORIZED, "Token invalid sau expirat")
        return

    manager.add(user_id, ws)
    try:
        await ws.send_json({"type": "ready", "user_id": user_id})
        # Clientul trimite "ping" periodic; răspundem ca să știe că legătura e vie
        while True:
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(user_id, ws)


async def _close(ws: WebSocket, code: int, reason: str) -> None:
    try:
        await ws.close(code=code, reason=reason)
    except RuntimeError:
        pass  # conexiunea era deja închisă

