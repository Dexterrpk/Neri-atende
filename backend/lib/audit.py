"""Audit trail. Never writes a secret value — only the name of what changed."""

import re
import uuid
from datetime import datetime, timezone

from fastapi import Request

from lib.db import db

_SECRET_PATTERN = re.compile(
    r"(sk-[A-Za-z0-9_\-]{8,}|EAA[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9._\-]{10,})"
)


def scrub(text: str) -> str:
    return _SECRET_PATTERN.sub("[REDACTED]", str(text or ""))[:1000]


def client_ip(request: Request | None) -> str:
    if not request:
        return ""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:60]
    return request.client.host if request.client else ""


async def log(
    action: str,
    *,
    company_id: str | None = None,
    company_name: str = "",
    user_email: str = "",
    detail: str = "",
    request: Request | None = None,
) -> None:
    await db.audit_logs.insert_one(
        {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "company_name": company_name,
            "user_email": user_email,
            "action": action,
            "detail": scrub(detail),
            "ip": client_ip(request),
            "created_at": datetime.now(timezone.utc),
        }
    )
