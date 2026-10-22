from typing import Annotated

from fastapi import APIRouter, Query

from app.core.activity import read_last_lines
from app.core.deps import AdminUser

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/activity-log")
def activity_log(
    _admin: AdminUser, limit: Annotated[int, Query(ge=1, le=1000)] = 200
) -> dict[str, list[str]]:
    """Ultimele rânduri din jurnalul de activitate (cele mai noi primele). Doar pentru admini."""
    return {"lines": list(reversed(read_last_lines(limit)))}
