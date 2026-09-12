"""Tenant + role guards. EVERY data route resolves its tenant here — never from a
client-supplied company_id — which is what makes cross-tenant access impossible.
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from lib.db import db
from lib.security import SESSION_COOKIE, token_fingerprint

ROLE_RANK = {"VIEWER": 0, "AGENT": 1, "MANAGER": 2, "ADMIN": 3, "OWNER": 4}


class Principal:
    """The authenticated caller. `company_id` is authoritative and server-derived."""

    user: dict
    company: dict
    session_id: str

    def __init__(self, user: dict, company: dict, session_id: str):
        self.user = user
        self.company = company
        self.session_id = session_id

    @property
    def company_id(self) -> str:
        return self.company["id"]

    @property
    def role(self) -> str:
        return self.user.get("role", "VIEWER")

    def tenant(self, extra: dict | None = None) -> dict:
        """Mongo filter scoped to this tenant. Use it for every query."""
        q = {"company_id": self.company_id}
        if extra:
            q.update(extra)
        q["company_id"] = self.company_id
        return q


async def current_principal(request: Request) -> Principal:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Sessão não encontrada")

    session = await db.sessions.find_one({"token_hash": token_fingerprint(token)})
    if not session:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")

    expires = session.get("expires_at")
    if expires and expires.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        await db.sessions.delete_one({"_id": session["_id"]})
        raise HTTPException(status_code=401, detail="Sessão expirada")

    user = await db.users.find_one({"id": session["user_id"]})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Usuário indisponível")

    company = await db.companies.find_one({"id": user["company_id"]})
    if not company:
        raise HTTPException(status_code=401, detail="Empresa não encontrada")
    if not company.get("active", True):
        raise HTTPException(status_code=403, detail="Conta da empresa suspensa")

    await db.sessions.update_one(
        {"_id": session["_id"]}, {"$set": {"last_seen_at": datetime.now(timezone.utc)}}
    )
    return Principal(user, company, session["id"])


def require_role(*allowed: str):
    """Backend-enforced authorization. The frontend is never trusted for this."""
    minimum = min(ROLE_RANK[r] for r in allowed)

    async def guard(principal: Principal = Depends(current_principal)) -> Principal:
        if ROLE_RANK.get(principal.role, -1) < minimum:
            raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
        return principal

    return guard


async def require_platform_admin(principal: Principal = Depends(current_principal)) -> Principal:
    if not principal.user.get("is_platform_admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador da plataforma")
    return principal


# Convenience guards
CanWrite = Depends(require_role("MANAGER", "ADMIN", "OWNER"))
CanConfigure = Depends(require_role("ADMIN", "OWNER"))
CanOwn = Depends(require_role("OWNER"))
CanRead = Depends(current_principal)
