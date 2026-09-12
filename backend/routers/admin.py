"""Platform administration — restricted to users flagged is_platform_admin.

Secrets are stored encrypted and NEVER returned: the API only reports whether a
key is configured.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from lib import ai, audit
from lib.db import db
from lib.deps import Principal, require_platform_admin
from lib.security import encrypt_secret
from models.schemas import (
    AdminCompanyOut,
    AdminCompanyUpdate,
    AdminOverviewOut,
    AiProviderConfigInput,
    AiProviderConfigOut,
    AuditLogOut,
    ConnectionTestOut,
    HealthItemOut,
    HealthOut,
    OkOut,
    PlatformSettingInput,
    PlatformSettingOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])

# Every configurable platform secret. `hint` is user-facing guidance, never a value.
SECRET_CATALOG = [
    ("AI_API_KEY", "Chave do serviço de IA", "IA", "Obtida no painel do provedor de IA escolhido"),
    ("SMTP_FROM", "Remetente de e-mail", "E-mail", "Ex.: atendimento@suaempresa.com"),
    ("SMTP_PORT", "Porta SMTP", "E-mail", "587 para STARTTLS ou 465 para TLS"),
    ("SMTP_HOST", "Servidor de e-mail", "E-mail", "Ex.: smtp.seuprovedor.com"),
    ("SMTP_USER", "Usuário de e-mail", "E-mail", "Usuário da conta SMTP"),
    ("SMTP_PASSWORD", "Senha de e-mail", "E-mail", "Senha ou token da conta SMTP"),
    ("GOOGLE_OAUTH_CLIENT_ID", "ID do cliente Google", "OAuth", "Google Cloud Console → Credenciais"),
    ("GOOGLE_OAUTH_CLIENT_SECRET", "Segredo do cliente Google", "OAuth", "Google Cloud Console → Credenciais"),
    ("STRIPE_SECRET_KEY", "Chave de pagamentos", "Pagamentos", "Painel do provedor de pagamentos"),
    ("STORAGE_BUCKET_KEY", "Chave do armazenamento", "Armazenamento", "Painel do provedor de storage"),
    ("WEBHOOK_SIGNING_SECRET", "Segredo de assinatura", "Webhooks", "Gerado por você, use um valor aleatório longo"),
]
SECRET_KEYS = {k for k, _, _, _ in SECRET_CATALOG}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


@router.get("/overview", response_model=AdminOverviewOut)
async def overview(_: Principal = Depends(require_platform_admin)):
    plans: dict[str, int] = {}
    for plan in ("FREE", "BASIC", "PRO", "PREMIUM"):
        plans[plan] = await db.companies.count_documents({"plan": plan})
    return AdminOverviewOut(
        companies=await db.companies.count_documents({}),
        users=await db.users.count_documents({}),
        conversations=await db.conversations.count_documents({}),
        messages=await db.messages.count_documents({}),
        ai_calls=await db.ai_usage.count_documents({}),
        plans=plans,
    )


@router.get("/companies", response_model=list[AdminCompanyOut])
async def list_companies(_: Principal = Depends(require_platform_admin),
                         limit: int = Query(50, ge=1, le=200), skip: int = Query(0, ge=0)):
    companies = await db.companies.find().sort("created_at", -1).skip(skip).to_list(limit)
    ids = [c["id"] for c in companies]

    # aggregated in three queries, not one per company (no N+1)
    async def counts(collection: str) -> dict[str, int]:
        pipeline = [{"$match": {"company_id": {"$in": ids}}},
                    {"$group": {"_id": "$company_id", "n": {"$sum": 1}}}]
        return {d["_id"]: d["n"] for d in await db[collection].aggregate(pipeline).to_list(500)}

    users, convs, calls = await counts("users"), await counts("conversations"), await counts("ai_usage")
    return [
        AdminCompanyOut(
            id=c["id"], name=c["name"], plan=c.get("plan", "FREE"), active=c.get("active", True),
            users=users.get(c["id"], 0), conversations=convs.get(c["id"], 0),
            ai_calls=calls.get(c["id"], 0), created_at=c["created_at"],
        )
        for c in companies
    ]


@router.patch("/companies/{company_id}", response_model=AdminCompanyOut)
async def update_company(company_id: str, payload: AdminCompanyUpdate, request: Request,
                         principal: Principal = Depends(require_platform_admin)):
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Nada para atualizar")
    res = await db.companies.update_one({"id": company_id}, {"$set": changes})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    if changes.get("active") is False:
        await db.sessions.delete_many({"company_id": company_id})  # suspension is immediate

    doc = await db.companies.find_one({"id": company_id})
    await audit.log("admin.company_updated", company_id=company_id, company_name=doc["name"],
                    user_email=principal.user["email"], detail=str(changes), request=request)
    return AdminCompanyOut(
        id=doc["id"], name=doc["name"], plan=doc.get("plan", "FREE"), active=doc.get("active", True),
        users=await db.users.count_documents({"company_id": company_id}),
        conversations=await db.conversations.count_documents({"company_id": company_id}),
        ai_calls=await db.ai_usage.count_documents({"company_id": company_id}),
        created_at=doc["created_at"],
    )


@router.get("/users", response_model=list[dict])
async def list_all_users(_: Principal = Depends(require_platform_admin),
                         limit: int = Query(100, ge=1, le=300)):
    users = await db.users.find().sort("created_at", -1).to_list(limit)
    company_names = {c["id"]: c["name"] for c in await db.companies.find().to_list(500)}
    return [
        {
            "id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"],
            "company": company_names.get(u["company_id"], ""), "active": u.get("active", True),
            "is_platform_admin": bool(u.get("is_platform_admin")),
            "created_at": _aware(u["created_at"]).isoformat(),
        }
        for u in users
    ]


# ---------- platform settings (secrets) ----------
@router.get("/settings", response_model=list[PlatformSettingOut])
async def list_settings(_: Principal = Depends(require_platform_admin)):
    stored = {d["key"]: d for d in await db.platform_settings.find({"key": {"$in": list(SECRET_KEYS)}}).to_list(50)}
    import os

    out = []
    for key, label, group, hint in SECRET_CATALOG:
        doc = stored.get(key)
        env_fallback = bool(os.environ.get(key)) or (key == "AI_API_KEY" and bool(
            os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("GEMINI_API_KEY")
        ))
        out.append(
            PlatformSettingOut(
                key=key, label=label, group=group,
                configured=bool(doc and doc.get("encrypted")) or env_fallback,
                hint=hint,
                updated_at=_aware(doc.get("updated_at")) if doc else None,
            )
        )
    return out


@router.put("/settings", response_model=PlatformSettingOut)
async def save_setting(payload: PlatformSettingInput, request: Request,
                       principal: Principal = Depends(require_platform_admin)):
    if payload.key not in SECRET_KEYS:
        raise HTTPException(status_code=422, detail="Chave não reconhecida")
    await db.platform_settings.update_one(
        {"key": payload.key},
        {"$set": {"encrypted": encrypt_secret(payload.value), "updated_at": _now()}},
        upsert=True,
    )
    # the VALUE never reaches the audit log
    await audit.log("admin.secret_saved", user_email=principal.user["email"],
                    detail=f"chave {payload.key} atualizada", request=request)
    meta = next(m for m in SECRET_CATALOG if m[0] == payload.key)
    return PlatformSettingOut(key=meta[0], label=meta[1], group=meta[2], configured=True,
                              hint=meta[3], updated_at=_now())


@router.delete("/settings/{key}", response_model=OkOut)
async def delete_setting(key: str, request: Request, principal: Principal = Depends(require_platform_admin)):
    if key not in SECRET_KEYS:
        raise HTTPException(status_code=422, detail="Chave não reconhecida")
    await db.platform_settings.update_one({"key": key}, {"$unset": {"encrypted": ""}})
    await audit.log("admin.secret_removed", user_email=principal.user["email"],
                    detail=f"chave {key} removida", request=request)
    return OkOut(message="Chave removida. Reinicie os processos para aplicar em todos os workers.")


# ---------- AI providers ----------
@router.get("/ai-provider", response_model=AiProviderConfigOut)
async def get_ai_provider(_: Principal = Depends(require_platform_admin)):
    cfg = await ai.get_provider_config()
    doc = await db.platform_settings.find_one({"key": "ai_provider_config"})
    return AiProviderConfigOut(
        default_provider=cfg["default_provider"], default_model=cfg["default_model"],
        fast_model=cfg["fast_model"], complex_model=cfg["complex_model"],
        max_tokens=int(cfg["max_tokens"]), temperature=float(cfg["temperature"]),
        monthly_call_limit=int(cfg["monthly_call_limit"]),
        fallback_provider=cfg.get("fallback_provider", ""), fallback_model=cfg.get("fallback_model", ""),
        key_configured=bool(await ai.get_api_key()),
        updated_at=_aware(doc.get("updated_at")) if doc else None,
    )


@router.put("/ai-provider", response_model=AiProviderConfigOut)
async def save_ai_provider(payload: AiProviderConfigInput, request: Request,
                           principal: Principal = Depends(require_platform_admin)):
    if payload.default_provider not in ai.SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=422, detail="Provedor não suportado")
    await db.platform_settings.update_one(
        {"key": "ai_provider_config"},
        {"$set": {"value": payload.model_dump(), "updated_at": _now()}},
        upsert=True,
    )
    await audit.log("admin.ai_provider_updated", user_email=principal.user["email"],
                    detail=f"{payload.default_provider}/{payload.default_model}", request=request)
    return await get_ai_provider(principal)


@router.post("/ai-provider/test", response_model=ConnectionTestOut)
async def test_ai_provider(request: Request, principal: Principal = Depends(require_platform_admin)):
    ok, checks, message = await ai.test_connection()
    await audit.log("admin.ai_provider_tested", user_email=principal.user["email"],
                    detail="sucesso" if ok else "falha", request=request)
    return ConnectionTestOut(ok=ok, checks=checks, message=message)


# ---------- AI credentials (multi-provider, multi-key with fallback) ----------
from pydantic import BaseModel, Field  # noqa: E402


class AiCredentialIn(BaseModel):
    id: str | None = None
    provider: str
    name: str = ""
    api_key: str = ""
    model: str | None = None
    active: bool = True
    priority: int = Field(default=100, ge=0, le=999)


class AiCredentialTest(BaseModel):
    provider: str
    api_key: str
    model: str | None = None


@router.get("/ai/credentials")
async def list_ai_credentials(_: Principal = Depends(require_platform_admin),
                              provider: str | None = None):
    return await ai.list_credentials(provider=provider)


@router.put("/ai/credentials")
async def upsert_ai_credential(payload: AiCredentialIn, request: Request,
                               principal: Principal = Depends(require_platform_admin)):
    try:
        doc = await ai.upsert_credential(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await audit.log("admin.ai_credential_saved", user_email=principal.user["email"],
                    detail=f"{payload.provider}/{doc.get('name', '')}", request=request)
    return doc


@router.delete("/ai/credentials/{cred_id}", response_model=OkOut)
async def delete_ai_credential(cred_id: str, request: Request,
                               principal: Principal = Depends(require_platform_admin)):
    ok = await ai.delete_credential(cred_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Credencial não encontrada")
    await audit.log("admin.ai_credential_removed", user_email=principal.user["email"],
                    detail=cred_id, request=request)
    return OkOut(message="Credencial removida.")


@router.post("/ai/credentials/test")
async def test_ai_credential(payload: AiCredentialTest,
                             _: Principal = Depends(require_platform_admin)):
    ok, msg, model = await ai.probe_key(payload.provider, payload.api_key, payload.model)
    return {"ok": ok, "message": msg, "model": model}


@router.post("/ai/credentials/{cred_id}/test")
async def test_stored_ai_credential(cred_id: str,
                                    _: Principal = Depends(require_platform_admin)):
    doc = await db.ai_credentials.find_one({"id": cred_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Credencial não encontrada")
    key = await ai._decrypt_key(doc)  # noqa: SLF001
    if not key:
        return {"ok": False, "message": "Chave ausente ou corrompida.", "model": doc.get("model", "")}
    ok, msg, model = await ai.probe_key(doc["provider"], key, doc.get("model"))
    await db.ai_credentials.update_one(
        {"id": cred_id},
        {"$set": {"model": model if ok else doc.get("model"),
                  "last_ok_at": _now() if ok else doc.get("last_ok_at"),
                  "last_error": "" if ok else msg}},
    )
    return {"ok": ok, "message": msg, "model": model}


@router.get("/ai/models")
async def list_ai_models(provider: str, cred_id: str | None = None,
                         _: Principal = Depends(require_platform_admin)):
    if provider not in ai.SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=422, detail="Provedor não suportado")
    key = None
    if cred_id:
        doc = await db.ai_credentials.find_one({"id": cred_id})
        if doc:
            key = await ai._decrypt_key(doc)  # noqa: SLF001
    if not key:
        # Try any active credential for that provider
        docs = await ai._active_credentials(provider=provider)  # noqa: SLF001
        for d in docs:
            key = await ai._decrypt_key(d)  # noqa: SLF001
            if key:
                break
    if not key:
        raise HTTPException(status_code=400, detail="Nenhuma chave ativa para este provedor")
    models = await ai.list_provider_models(provider, key)
    return {"provider": provider, "models": models, "default": ai.DEFAULT_MODELS.get(provider, "")}


@router.get("/ai/providers")
async def list_ai_providers(_: Principal = Depends(require_platform_admin)):
    return {"supported": list(ai.SUPPORTED_PROVIDERS),
            "defaults": dict(ai.DEFAULT_MODELS)}



# ---------- health ----------
@router.get("/health", response_model=HealthOut)
async def platform_health(_: Principal = Depends(require_platform_admin)):
    import os

    items: list[HealthItemOut] = []

    try:
        await db.command("ping")
        items.append(HealthItemOut(key="database", label="Banco de dados", status="ok", detail="Conectado"))
    except Exception as exc:
        items.append(HealthItemOut(key="database", label="Banco de dados", status="error",
                                   detail=f"Indisponível ({type(exc).__name__})"))

    ai_key = await ai.get_api_key()
    cfg = await ai.get_provider_config()
    items.append(
        HealthItemOut(key="ai", label="Inteligência Artificial",
                      status="ok" if ai_key else "not_configured",
                      detail=f"{cfg['default_provider']}/{cfg['default_model']}" if ai_key
                      else "Nenhuma chave configurada — a IA responde em modo teste")
    )

    connected = await db.integrations.count_documents({"kind": "whatsapp", "connected": True})
    official = await db.integrations.count_documents({"kind": "whatsapp", "mode": "official", "connected": True})
    items.append(
        HealthItemOut(key="whatsapp", label="WhatsApp",
                      status="ok" if official else "warn" if connected else "not_configured",
                      detail=f"{official} em API oficial, {connected - official} em modo teste"
                      if connected else "Nenhuma empresa conectada")
    )

    smtp = await db.platform_settings.find_one({"key": "SMTP_HOST"})
    items.append(HealthItemOut(key="email", label="E-mail",
                               status="ok" if (smtp and smtp.get("encrypted")) or os.environ.get("SMTP_HOST")
                               else "not_configured",
                               detail="Envio de e-mails" if smtp else "SMTP não configurado"))

    oauth = await db.platform_settings.find_one({"key": "GOOGLE_OAUTH_CLIENT_ID"})
    items.append(HealthItemOut(key="oauth", label="Login com Google",
                               status="ok" if (oauth and oauth.get("encrypted")) else "not_configured",
                               detail="Credenciais presentes" if oauth else "Não configurado"))

    since = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    inbound = await db.messages.count_documents({"role": "customer", "created_at": {"$gte": since}})
    meta_secret = bool(os.environ.get("META_APP_SECRET", "").strip())
    items.append(HealthItemOut(
        key="meta_webhook_security",
        label="Segurança do webhook Meta",
        status="ok" if meta_secret else "error" if official and os.environ.get("APP_ENV", "development").lower() == "production" else "not_configured",
        detail="X-Hub-Signature-256 ativo" if meta_secret else "Defina META_APP_SECRET antes de usar WhatsApp oficial em produção",
    ))

    items.append(HealthItemOut(key="webhooks", label="Conexão automática",
                               status="ok" if inbound else "warn" if official else "not_configured",
                               detail=f"{inbound} mensagem(ns) recebida(s) hoje"))

    items.append(HealthItemOut(key="queue", label="Processamentos",
                               status="ok", detail="Processamento síncrono no request (portátil, sem worker externo)"))

    storage = await db.platform_settings.find_one({"key": "STORAGE_BUCKET_KEY"})
    items.append(HealthItemOut(key="storage", label="Armazenamento de arquivos",
                               status="ok" if (storage and storage.get("encrypted")) else "not_configured",
                               detail="Bucket configurado" if storage else "Somente URLs externas por enquanto"))
    return HealthOut(items=items)


@router.get("/audit-logs", response_model=list[AuditLogOut])
async def all_audit_logs(_: Principal = Depends(require_platform_admin),
                         limit: int = Query(100, ge=1, le=300), skip: int = Query(0, ge=0)):
    docs = await db.audit_logs.find().sort("created_at", -1).skip(skip).to_list(limit)
    return [
        AuditLogOut(
            id=d.get("id", ""), company_id=d.get("company_id"), company_name=d.get("company_name", ""),
            user_email=d.get("user_email", ""), action=d.get("action", ""), detail=d.get("detail", ""),
            ip=d.get("ip", ""), created_at=_aware(d["created_at"]),
        )
        for d in docs
    ]
