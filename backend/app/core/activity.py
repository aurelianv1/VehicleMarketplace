"""Jurnalul de activitate: acțiunile utilizatorilor, scrise în backend/logs/activity.log.

Exemplu de rând:
    2026-10-22 14:05:01 | INFO    | ip=127.0.0.1 user=2 | listing.create id=42 title="Dacia Logan"

Fișierul se rotește la 1 MB (se păstrează 5 fișiere vechi), ca să nu crească la
nesfârșit. Adminul îl poate citi din aplicație (GET /admin/activity-log) sau direct
de pe disc. Parolele și token-urile nu se scriu niciodată în jurnal.
"""

import logging
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler
from typing import Any

from app.core.config import settings

LOG_FILE = settings.log_path / "activity.log"

# IP-ul cererii curente, setat de RequestContextMiddleware; ContextVar e sigur și când
# mai multe cereri rulează în paralel (fiecare cerere își vede propria valoare)
client_ip: ContextVar[str] = ContextVar("client_ip", default="-")

_logger = logging.getLogger("activity")
_logger.setLevel(logging.INFO)
_logger.propagate = False  # nu se amestecă cu log-urile uvicorn din consolă
if not _logger.handlers:
    handler = RotatingFileHandler(LOG_FILE, maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s", "%Y-%m-%d %H:%M:%S"))
    _logger.addHandler(handler)


def _format_value(value: Any) -> str:
    text = str(value).replace("\n", " ")  # un rând per acțiune, chiar dacă textul are Enter
    return f'"{text[:80]}"' if " " in text or not text else text[:80]


def log_action(action: str, user_id: int | None = None, level: int = logging.INFO, **details: Any) -> None:
    """Scrie o acțiune în jurnal. `details` sunt perechi cheie=valoare (fără date sensibile)."""
    extra = " ".join(f"{k}={_format_value(v)}" for k, v in details.items())
    _logger.log(level, f"ip={client_ip.get()} user={user_id if user_id is not None else '-'} | {action} {extra}".rstrip())


def read_last_lines(limit: int = 200) -> list[str]:
    """Ultimele `limit` rânduri din jurnal (cele mai noi la final)."""
    if not LOG_FILE.exists():
        return []
    with LOG_FILE.open(encoding="utf-8") as f:
        return [line.rstrip("\n") for line in f.readlines()[-limit:]]
