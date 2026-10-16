"""Conexiunile WebSocket deschise și trimiterea de notificări către utilizatori.

WebSocket-ul e doar un canal de notificare: mesajele se scriu prin REST
(POST /conversations/...), cu aceeași validare și verificare de drepturi ca
restul API-ului, iar după salvare serverul anunță participanții pe aici.

Limitare: conexiunile stau în memoria procesului, deci merge cu un singur
worker uvicorn. Cu mai multe procese ar fi nevoie de un canal comun între ele
(ex. Redis pub/sub) — de menționat ca dezvoltare viitoare.
"""

import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # Un utilizator poate avea mai multe tab-uri deschise → mai multe conexiuni
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)

    def add(self, user_id: int, ws: WebSocket) -> None:
        self._connections[user_id].add(ws)

    def remove(self, user_id: int, ws: WebSocket) -> None:
        self._connections[user_id].discard(ws)
        if not self._connections[user_id]:
            del self._connections[user_id]

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections

    async def send_to_users(self, user_ids: list[int], payload: dict[str, Any]) -> None:
        for user_id in set(user_ids):
            # Copie a setului: o conexiune moartă e scoasă în timpul iterației
            for ws in list(self._connections.get(user_id, ())):
                try:
                    await ws.send_json(payload)
                except Exception:  # noqa: BLE001 — tab închis între timp
                    log.info("Conexiune WebSocket închisă pentru utilizatorul %s", user_id)
                    self.remove(user_id, ws)


manager = ConnectionManager()
