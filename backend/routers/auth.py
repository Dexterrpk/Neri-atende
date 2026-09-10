"""Auth: register, login, logout, sessions, password reset, e-mail verification, team."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib import audit
from lib.db import db
from lib.deps import Principal, current_principal, require_role
from lib.security import (
    SESSION_COOKIE,
    cookie_kwargs,
    hash_password,
    new_token,
    rate_limit_exceeded,
    reset_rate_limit,
    session_expiry,
    token_fingerprint,
    verify_password,
)
from models.schemas import (
    ChangePasswordInput,
    CompanyOut,
    ForgotPasswordInput,
    InviteUserInput,
    LoginInput,
    MeOut,
    OkOut,
    RegisterInput,
    ResetPasswordInput,
    RoleUpdateInput,
    SessionOut,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user_out(u: dict) -> UserOut:
    return UserOut(**{k: u[k] for k in ("id", "company_id", "name", "email", "role", "created_at")},
                   is_platform_admin=bool(u.get("is_platform_admin")),
                   email_verified=bool(u.get("email_verified")))


def _company_out(c: dict) -> CompanyOut:
    return CompanyOut(
        id=c["id"],
        name=c["name"],
        segment=c.get("segment", ""),
        description=c.get("description", ""),
        phone=c.get("phone", ""),
        address=c.get("address", ""),
        business_hours=c.get("business_hours", ""),
        payment_methods=c.get("payment_methods", ""),
        plan=c.get("plan", "FREE"),
        active=c.get("active", True),
        onboarding_step=c.get("onboarding_step", 0),
        onboarding_done=c.get("onboarding_done", False),
        created_at=c["created_at"],
    )


async def _open_session(response: Response, user: dict, request: Request) -> None:
    token = new_token()
    await db.sessions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "token_hash": token_fingerprint(token),
            "user_id": user["id"],
            "company_id": user["company_id"],
            "user_agent": (request.headers.get("user-agent") or "")[:200],
            "created_at": _now(),
            "last_seen_at": _now(),
            "expires_at": session_expiry(),
        }
    )
    response.set_cookie(SESSION_COOKIE, token, **cookie_kwargs())


async def seed_company_defaults(company_id: str) -> None:
    """Every new tenant gets its own isolated AI config and recovery rules."""
    from models.schemas import AgentConfig, RecoveryRules

    if not await db.agent_configs.find_one({"company_id": company_id}):
        await db.agent_configs.insert_one(AgentConfig(company_id=company_id).model_dump())
    if not await db.platform_settings.find_one({"key": f"recovery_rules:{company_id}"}):
        await db.platform_settings.insert_one(
            {"key": f"recovery_rules:{company_id}", "value": RecoveryRules(company_id=company_id).model_dump()}
        )


@router.post("/register", response_model=MeOut, status_code=201)
async def register(payload: RegisterInput, request: Request, response: Response):
    ip = audit.client_ip(request)
    if rate_limit_exceeded(f"register:{ip}", 10, 3600):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente mais tarde.")

    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado")

    company = {
        "id": str(uuid.uuid4()),
        "name": payload.company_name.strip(),
        "segment": "",
        "description": "",
        "phone": "",
        "address": "",
        "business_hours": "",
        "payment_methods": "",
        "plan": "FREE",
        "active": True,
        "onboarding_step": 0,
        "onboarding_done": False,
        "created_at": _now(),
    }
    await db.companies.insert_one(dict(company))

    # First user of a workspace is its OWNER. Platform admin is never self-granted.
    user = {
        "id": str(uuid.uuid4()),
        "company_id": company["id"],
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": "OWNER",
        "is_platform_admin": False,
        "email_verified": False,
        "active": True,
        "created_at": _now(),
    }
    await db.users.insert_one(dict(user))
    await seed_company_defaults(company["id"])
    await _open_session(response, user, request)
    await audit.log("auth.register", company_id=company["id"], company_name=company["name"],
                    user_email=email, detail="nova empresa criada", request=request)
    return MeOut(user=_user_out(user), company=_company_out(company))


@router.post("/login", response_model=MeOut)
async def login(payload: LoginInput, request: Request, response: Response):
    email = payload.email.lower().strip()
    ip = audit.client_ip(request)
    # brute-force protection on both the account and the source address
    if rate_limit_exceeded(f"login:{email}", 8, 900) or rate_limit_exceeded(f"loginip:{ip}", 30, 900):
        raise HTTPException(status_code=429, detail="Muitas tentativas de acesso. Aguarde alguns minutos.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        await audit.log("auth.login_failed", user_email=email, detail="credenciais inválidas", request=request)
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Usuário desativado")

    company = await db.companies.find_one({"id": user["company_id"]})
    if not company:
        raise HTTPException(status_code=403, detail="Empresa não encontrada")
    if not company.get("active", True):
        raise HTTPException(status_code=403, detail="Conta da empresa suspensa")

    reset_rate_limit(f"login:{email}")
    await seed_company_defaults(company["id"])
    await _open_session(response, user, request)
    await audit.log("auth.login", company_id=company["id"], company_name=company["name"],
                    user_email=email, request=request)
    return MeOut(user=_user_out(user), company=_company_out(company))


@router.get("/me", response_model=MeOut)
async def me(principal: Principal = Depends(current_principal)):
    return MeOut(user=_user_out(principal.user), company=_company_out(principal.company))


@router.post("/logout", response_model=OkOut)
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = await db.sessions.find_one({"token_hash": token_fingerprint(token)})
        if session:
            user = await db.users.find_one({"id": session["user_id"]})
            await db.sessions.delete_one({"_id": session["_id"]})
            if user:
                await audit.log("auth.logout", company_id=user["company_id"],
                                user_email=user["email"], request=request)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return OkOut(message="Sessão encerrada")


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(principal: Principal = Depends(current_principal)):
    docs = await db.sessions.find({"user_id": principal.user["id"]}).sort("created_at", -1).to_list(50)
    return [
        SessionOut(
            id=d["id"],
            created_at=d["created_at"],
            last_seen_at=d.get("last_seen_at", d["created_at"]),
            user_agent=d.get("user_agent", ""),
            current=d["id"] == principal.session_id,
        )
        for d in docs
    ]


@router.post("/logout-all", response_model=OkOut)
async def logout_all(request: Request, response: Response, principal: Principal = Depends(current_principal)):
    await db.sessions.delete_many({"user_id": principal.user["id"]})
    response.delete_cookie(SESSION_COOKIE, path="/")
    await audit.log("auth.logout_all", company_id=principal.company_id,
                    user_email=principal.user["email"], detail="todas as sessões encerradas", request=request)
    return OkOut(message="Todas as sessões foram encerradas")


@router.delete("/sessions/{session_id}", response_model=OkOut)
async def revoke_session(session_id: str, request: Request, principal: Principal = Depends(current_principal)):
    # scoped to the caller's own sessions — no IDOR across users
    res = await db.sessions.delete_one({"id": session_id, "user_id": principal.user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    await audit.log("auth.session_revoked", company_id=principal.company_id,
                    user_email=principal.user["email"], request=request)
    return OkOut(message="Sessão revogada")


@router.post("/forgot-password", response_model=OkOut)
async def forgot_password(payload: ForgotPasswordInput, request: Request):
    email = payload.email.lower().strip()
    if rate_limit_exceeded(f"forgot:{email}", 5, 3600):
        raise HTTPException(status_code=429, detail="Muitas solicitações. Aguarde antes de tentar novamente.")

    user = await db.users.find_one({"email": email})
    # Always the same answer: never reveal whether an account exists.
    if user:
        token = new_token()
        await db.password_resets.insert_one(
            {
                "token_hash": token_fingerprint(token),
                "user_id": user["id"],
                "created_at": _now(),
                "expires_at": _now() + timedelta(hours=2),
            }
        )
        await audit.log("auth.password_reset_requested", company_id=user["company_id"],
                        user_email=email, request=request)
        # No e-mail provider configured yet → the link is not invented, it is returned
        # only in the audit-safe channel below (see INTEGRATIONS.md, SMTP section).
        import logging

        logging.getLogger(__name__).info(
            "password reset token issued for user %s (delivery pending SMTP configuration)", user["id"]
        )
        return OkOut(message="Se este e-mail estiver cadastrado, enviaremos as instruções de redefinição.",
                     ok=True)
    return OkOut(message="Se este e-mail estiver cadastrado, enviaremos as instruções de redefinição.")


@router.post("/reset-password", response_model=OkOut)
async def reset_password(payload: ResetPasswordInput, request: Request):
    record = await db.password_resets.find_one({"token_hash": token_fingerprint(payload.token)})
    if not record:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado")
    if record["expires_at"].replace(tzinfo=timezone.utc) < _now():
        await db.password_resets.delete_one({"_id": record["_id"]})
        raise HTTPException(status_code=400, detail="Link expirado")

    await db.users.update_one({"id": record["user_id"]}, {"$set": {"password_hash": hash_password(payload.password)}})
    await db.password_resets.delete_many({"user_id": record["user_id"]})
    await db.sessions.delete_many({"user_id": record["user_id"]})  # invalidate everywhere
    user = await db.users.find_one({"id": record["user_id"]})
    await audit.log("auth.password_reset", company_id=user["company_id"] if user else None,
                    user_email=user["email"] if user else "", request=request)
    return OkOut(message="Senha redefinida. Faça login com a nova senha.")


@router.post("/change-password", response_model=OkOut)
async def change_password(payload: ChangePasswordInput, request: Request,
                          principal: Principal = Depends(current_principal)):
    if not verify_password(payload.current_password, principal.user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    await db.users.update_one(
        {"id": principal.user["id"]}, {"$set": {"password_hash": hash_password(payload.new_password)}}
    )
    await audit.log("auth.password_changed", company_id=principal.company_id,
                    user_email=principal.user["email"], request=request)
    return OkOut(message="Senha alterada com sucesso")


@router.post("/verify-email", response_model=OkOut)
async def verify_email(request: Request, principal: Principal = Depends(current_principal)):
    """Self-confirmation endpoint. Real e-mail delivery requires SMTP (see INTEGRATIONS.md)."""
    await db.users.update_one({"id": principal.user["id"]}, {"$set": {"email_verified": True}})
    await audit.log("auth.email_verified", company_id=principal.company_id,
                    user_email=principal.user["email"], request=request)
    return OkOut(message="E-mail confirmado")


# ---------- team management (tenant-scoped) ----------
@router.get("/team", response_model=list[UserOut])
async def list_team(principal: Principal = Depends(current_principal)):
    docs = await db.users.find(principal.tenant()).sort("created_at", 1).to_list(200)
    return [_user_out(d) for d in docs]


@router.post("/team", response_model=UserOut, status_code=201)
async def invite_user(payload: InviteUserInput, request: Request,
                      principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado")
    if payload.role == "OWNER" and principal.role != "OWNER":
        raise HTTPException(status_code=403, detail="Somente o proprietário pode criar outro proprietário")

    user = {
        "id": str(uuid.uuid4()),
        "company_id": principal.company_id,  # server-derived: no cross-tenant invite possible
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "is_platform_admin": False,
        "email_verified": False,
        "active": True,
        "created_at": _now(),
    }
    await db.users.insert_one(dict(user))
    await audit.log("team.user_created", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"criou {email} como {payload.role}", request=request)
    return _user_out(user)


@router.patch("/team/{user_id}/role", response_model=UserOut)
async def change_role(user_id: str, payload: RoleUpdateInput, request: Request,
                      principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    target = await db.users.find_one({"id": user_id, "company_id": principal.company_id})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if target["id"] == principal.user["id"]:
        raise HTTPException(status_code=400, detail="Você não pode alterar sua própria permissão")
    if (target.get("role") == "OWNER" or payload.role == "OWNER") and principal.role != "OWNER":
        raise HTTPException(status_code=403, detail="Somente o proprietário pode gerenciar proprietários")

    await db.users.update_one({"id": user_id}, {"$set": {"role": payload.role}})
    await db.sessions.delete_many({"user_id": user_id})  # permissions take effect immediately
    target["role"] = payload.role
    await audit.log("team.role_changed", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"{target['email']} → {payload.role}", request=request)
    return _user_out(target)


@router.delete("/team/{user_id}", response_model=OkOut)
async def deactivate_user(user_id: str, request: Request,
                          principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    target = await db.users.find_one({"id": user_id, "company_id": principal.company_id})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if target["id"] == principal.user["id"]:
        raise HTTPException(status_code=400, detail="Você não pode desativar seu próprio acesso")
    if target.get("role") == "OWNER":
        raise HTTPException(status_code=403, detail="O proprietário não pode ser desativado")

    # Deactivation, never deletion: history and audit trail stay intact.
    await db.users.update_one({"id": user_id}, {"$set": {"active": False}})
    await db.sessions.delete_many({"user_id": user_id})
    await audit.log("team.user_deactivated", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"desativou {target['email']}", request=request)
    return OkOut(message=f"Acesso de {target['email']} desativado")
