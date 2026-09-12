"""WhatsApp connection + inbound webhook. Tokens are never returned to the client."""

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from lib import ai, audit, whatsapp
from lib.db import db
from lib.deps import Principal, current_principal, require_role
from lib.security import rate_limit_exceeded
from models.schemas import Customer, OkOut, WhatsAppConnectInput, WhatsAppStatusOut
from routers.inbox import _append_message, deliver_message, ensure_conversation, run_ai_reply
from routers.workspace import load_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.get("/status", response_model=WhatsAppStatusOut)
async def status(principal: Principal = Depends(current_principal)):
    doc = await whatsapp.get_integration(principal.company_id)
    payload = whatsapp.status_payload(doc)
    if doc and doc.get("mode") == "web":
        try:
            web = await whatsapp.web_status(principal.company_id)
            await db.integrations.update_one({"company_id": principal.company_id, "kind": "whatsapp", "mode": "web"},
                {"$set": {"connected": bool(web.get("connected")), "web_status": web.get("status", "disconnected"),
                          "phone_number": web.get("phone_number") or "", "display_name": web.get("display_name") or "",
                          "last_error": web.get("last_error") or "", "last_sync_at": datetime.now(timezone.utc)}})
            payload.update({
                "connected": bool(web.get("connected")),
                "phone_number": web.get("phone_number") or payload.get("phone_number", ""),
                "display_name": web.get("display_name") or payload.get("display_name", ""),
                "web_status": web.get("status", "disconnected"),
                "web_qr": web.get("qr") or "",
                "web_pairing_code": web.get("pairing_code") or "",
                "web_last_error": web.get("last_error") or "",
                "last_error": web.get("last_error") or "",
                "missing": [],
            })
        except Exception as exc:
            payload.update({"connected": False, "web_status": "unavailable", "web_last_error": str(exc)})
    if principal.role not in ("OWNER", "ADMIN"):
        payload["web_qr"] = ""
        payload["web_pairing_code"] = ""
    return WhatsAppStatusOut(**payload)


@router.put("/connect", response_model=WhatsAppStatusOut)
async def connect(payload: WhatsAppConnectInput, request: Request,
                  principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    if payload.mode not in ("test", "official"):
        raise HTTPException(status_code=422, detail="Modo inválido")
    if payload.mode == "official":
        if not payload.phone_number_id:
            raise HTTPException(status_code=422, detail="Informe o ID do número da API oficial")
        occupied = await db.integrations.find_one({"kind": "whatsapp", "mode": "official",
            "phone_number_id": payload.phone_number_id.strip(), "company_id": {"$ne": principal.company_id}})
        if occupied:
            raise HTTPException(status_code=409, detail="Este número já está vinculado a outra empresa")
        access_token = payload.access_token.strip()
        if not access_token:
            existing = await whatsapp.get_integration(principal.company_id) or {}
            access_token = whatsapp.decrypt_secret(existing.get("access_token_encrypted", "")) if existing.get("access_token_encrypted") else None
        if not access_token:
            raise HTTPException(status_code=422, detail="Informe o token de acesso da Meta")
        existing = await whatsapp.get_integration(principal.company_id) or {}
        verify_token = payload.verify_token.strip() or (
            whatsapp.decrypt_secret(existing.get("verify_token_encrypted", ""))
            if existing.get("verify_token_encrypted") else ""
        )
        if not verify_token:
            raise HTTPException(status_code=422, detail="Crie um Verify Token para o webhook da Meta")
        ok, detail, meta_data = await whatsapp.validate_official_credentials(payload.phone_number_id.strip(), access_token)
        if not ok:
            raise HTTPException(status_code=400, detail=detail)
        payload.display_name = payload.display_name.strip() or meta_data.get("verified_name", "")
        payload.phone_number = payload.phone_number.strip() or meta_data.get("display_phone_number", "")

    existing = await whatsapp.get_integration(principal.company_id)
    if existing and existing.get("mode") == "web":
        try:
            await whatsapp.web_disconnect(principal.company_id)
        except whatsapp.WebServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc))
    try:
        doc = await whatsapp.save_integration(principal.company_id, payload.model_dump())
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Este número já está vinculado a outra empresa")
    # audit records WHICH fields changed, never their values
    changed = [f for f in ("phone_number", "phone_number_id", "access_token", "verify_token")
               if (payload.model_dump().get(f) or "").strip()]
    await audit.log("whatsapp.connected", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"modo {payload.mode} | campos atualizados: {', '.join(changed) or 'nenhum'}",
                    request=request)
    return WhatsAppStatusOut(**whatsapp.status_payload(doc))


@router.delete("/connect", response_model=OkOut)
async def disconnect(request: Request, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    """Disconnects either the Web session or revokes official credentials."""
    existing = await whatsapp.get_integration(principal.company_id)
    if existing and existing.get("mode") == "web":
        try:
            await whatsapp.web_disconnect(principal.company_id)
        except Exception as exc:
            raise HTTPException(status_code=getattr(exc, "status_code", 503), detail=str(exc))
    await db.integrations.update_one(
        {"company_id": principal.company_id, "kind": "whatsapp"},
        {"$set": {"connected": False},
         "$unset": {"access_token_encrypted": "", "verify_token_encrypted": ""}},
    )
    await audit.log("whatsapp.disconnected", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail="credenciais revogadas", request=request)
    return OkOut(message="WhatsApp desconectado e credenciais removidas")


@router.post("/web/qr", response_model=WhatsAppStatusOut)
async def web_qr(request: Request, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    try:
        web = await whatsapp.web_start_qr(principal.company_id)
    except Exception as exc:
        raise HTTPException(status_code=getattr(exc, "status_code", 503), detail=str(exc))
    await db.integrations.update_one(
        {"company_id": principal.company_id, "kind": "whatsapp"},
        {"$set": {"mode": "web", "connected": bool(web.get("connected")), "phone_number": web.get("phone_number", ""),
                  "display_name": web.get("display_name", ""), "web_status": web.get("status", "disconnected"),
                  "web_last_error": web.get("last_error", ""), "last_sync_at": datetime.now(timezone.utc)}}, upsert=True)
    doc = await whatsapp.get_integration(principal.company_id)
    payload = whatsapp.status_payload(doc)
    payload.update({"connected": bool(web.get("connected")), "phone_number": web.get("phone_number", ""),
                    "display_name": web.get("display_name", ""), "web_status": web.get("status", "disconnected"),
                    "web_qr": (web.get("qr") or ""), "web_pairing_code": (web.get("pairing_code") or ""),
                    "web_last_error": web.get("last_error", ""), "missing": []})
    await audit.log("whatsapp.web_qr_started", company_id=principal.company_id, user_email=principal.user["email"],
                    detail="sessão WhatsApp Web iniciada por QR", request=request)
    return WhatsAppStatusOut(**payload)


@router.post("/web/pairing", response_model=WhatsAppStatusOut)
async def web_pairing(request: Request, payload: dict, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    phone = str(payload.get("phone_number", "")).strip()
    if not phone or len("".join(ch for ch in phone if ch.isdigit())) < 10:
        raise HTTPException(status_code=422, detail="Informe um número válido com código do país")
    try:
        web = await whatsapp.web_start_pairing(principal.company_id, phone)
    except Exception as exc:
        raise HTTPException(status_code=getattr(exc, "status_code", 503), detail=str(exc))
    await db.integrations.update_one(
        {"company_id": principal.company_id, "kind": "whatsapp"},
        {"$set": {"mode": "web", "connected": bool(web.get("connected")), "phone_number": web.get("phone_number") or phone,
                  "display_name": web.get("display_name", ""), "web_status": web.get("status", "disconnected"),
                  "web_last_error": web.get("last_error", ""), "last_sync_at": datetime.now(timezone.utc)}}, upsert=True)
    doc = await whatsapp.get_integration(principal.company_id)
    out = whatsapp.status_payload(doc)
    out.update({"connected": bool(web.get("connected")), "phone_number": web.get("phone_number") or phone,
               "display_name": web.get("display_name", ""), "web_status": web.get("status", "disconnected"),
               "web_qr": (web.get("qr") or ""), "web_pairing_code": (web.get("pairing_code") or ""),
               "web_last_error": web.get("last_error", ""), "missing": []})
    await audit.log("whatsapp.web_pairing_started", company_id=principal.company_id, user_email=principal.user["email"],
                    detail="sessão WhatsApp Web iniciada por código", request=request)
    return WhatsAppStatusOut(**out)


@router.delete("/web", response_model=OkOut)
async def web_disconnect(request: Request, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    try:
        await whatsapp.web_disconnect(principal.company_id)
    except Exception as exc:
        raise HTTPException(status_code=getattr(exc, "status_code", 503), detail=str(exc))
    await db.integrations.update_one(
        {"company_id": principal.company_id, "kind": "whatsapp"},
        {"$set": {"connected": False, "web_status": "disconnected"}, "$unset": {"phone_number": "", "display_name": ""}},
    )
    await audit.log("whatsapp.web_disconnected", company_id=principal.company_id, user_email=principal.user["email"], detail="sessão WhatsApp Web encerrada", request=request)
    return OkOut(message="WhatsApp Web desconectado")


@router.get("/web/status", response_model=WhatsAppStatusOut)
async def web_status(principal: Principal = Depends(current_principal)):
    return await status(principal)



@router.post("/test-send", response_model=OkOut)
async def test_send(request: Request, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    doc = await whatsapp.get_integration(principal.company_id)
    if doc and doc.get("mode") == "web":
        try:
            st = await whatsapp.web_status(principal.company_id)
        except whatsapp.WebServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc))
        if not st.get("connected"):
            raise HTTPException(status_code=409, detail=st.get("last_error") or "WhatsApp não está conectado.")
    else:
        st = whatsapp.status_payload(doc)
        if not st["connected"]:
            raise HTTPException(status_code=409, detail="WhatsApp não está conectado.")
    target = st.get("phone_number") or ""
    if not target:
        raise HTTPException(status_code=422, detail="Número conectado indisponível")
    sent, detail = await whatsapp.send_message(principal.company_id, target, "Teste de conexão do Atende IA.")
    await audit.log("whatsapp.test_send", company_id=principal.company_id,
                    user_email=principal.user["email"], detail=detail, request=request)
    if not sent:
        raise HTTPException(status_code=409 if "conectado" in detail or "440" in detail else 502, detail=detail)
    return OkOut(message=detail)



async def _process_web_message(body: dict, mode: str = "web") -> int:
    company_id = body.get("company_id", "")
    external_id = body.get("external_id", "")
    raw_text = body.get("text")
    if not isinstance(raw_text, str) or len(raw_text) > 65536:
        raise HTTPException(status_code=422, detail="Texto inválido")
    text = raw_text.strip()
    if not isinstance(company_id, str) or not isinstance(external_id, str) or not external_id or not text:
        raise HTTPException(status_code=422, detail="Mensagem inválida")
    try:
        phone = whatsapp.normalize_phone(body.get("phone", ""))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    company = await db.companies.find_one({"id": company_id, "active": {"$ne": False}})
    integration = await whatsapp.get_integration(company_id)
    if not company or not integration or integration.get("mode") != mode:
        return 0
    if await db.messages.find_one({"company_id": company_id, "external_id": external_id}):
        return 0
    now = datetime.now(timezone.utc)
    name = str(body.get("name") or phone)[:160]
    customer = Customer(company_id=company_id, name=name, phone=phone, origin="whatsapp").model_dump()
    query = {"company_id": company_id, "phone": phone}
    customer.pop("last_interaction_at", None)
    try:
        customer = await db.customers.find_one_and_update(query,
            {"$setOnInsert": customer, "$set": {"last_interaction_at": now}},
            upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        customer = await db.customers.find_one(query)
        if not customer:
            raise
    conv = await ensure_conversation(company_id, customer)
    timestamp = now
    if body.get("timestamp"):
        try:
            timestamp = datetime.fromtimestamp(float(body["timestamp"]), tz=timezone.utc)
        except (ValueError, TypeError, OverflowError, OSError):
            raise HTTPException(status_code=422, detail="Timestamp inválido")
    try:
        await _append_message(company_id, conv["id"], "customer", text,
                              author=name, external_id=external_id, created_at=timestamp)
    except DuplicateKeyError:
        return 0
    if conv.get("ai_paused") or conv.get("status") == "resolvido":
        return 1
    config = await load_config(company_id)
    try:
        reply, needs_human = await run_ai_reply(company, config, conv, text)
        # A takeover during generation invalidates this automatic reply.
        current = await db.conversations.find_one({"id": conv["id"], "company_id": company_id})
        if not current or current.get("ai_paused") or current.get("status") == "resolvido":
            return 1
        await deliver_message(company_id, conv, "ai", reply, config.get("ai_name", "IA"))
        await db.conversations.update_one({"id": conv["id"], "company_id": company_id, "ai_paused": False},
            {"$set": {"status": "precisa_humano" if needs_human else "em_atendimento", "ai_paused": needs_human}})
    except (ai.AiUnavailable, HTTPException):
        await db.conversations.update_one({"id": conv["id"], "company_id": company_id, "ai_paused": False},
            {"$set": {"status": "precisa_humano", "ai_paused": True}})
        logger.warning("Automatic reply unavailable for company %s; handed to human", company_id)
    return 1


@router.post("/web/inbound", response_model=OkOut)
async def receive_web_inbound(request: Request):
    secret = os.environ.get("WHATSAPP_WEB_SECRET", "")
    if not secret or not hmac.compare_digest(secret, request.headers.get("x-atende-internal-secret", "")):
        raise HTTPException(status_code=403, detail="Não autorizado")
    body = await request.json()
    processed = await _process_web_message(body)
    return OkOut(message=f"{processed} mensagem(ns) processada(s)")


# ---------- inbound webhook ("Conexão automática") ----------
@router.get("/webhook")
async def verify_webhook(
    request: Request,
    hub_mode: str = Query("", alias="hub.mode"),
    hub_challenge: str = Query("", alias="hub.challenge"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
):
    """Meta's subscription handshake. Matches the verify token of any tenant."""
    if hub_mode != "subscribe" or not hub_verify_token:
        raise HTTPException(status_code=403, detail="Verificação inválida")
    docs = await db.integrations.find({"kind": "whatsapp", "mode": "official"}).to_list(500)
    for doc in docs:
        if await whatsapp.verify_webhook_token(doc["company_id"], hub_verify_token):
            return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Token de verificação não reconhecido")


@router.post("/webhook", response_model=OkOut)
async def receive_webhook(request: Request):
    """Inbound messages. Idempotent: the unique (company_id, external_id) index
    guarantees a replayed webhook can never create a duplicate message."""
    ip = audit.client_ip(request)
    if rate_limit_exceeded(f"webhook:{ip}", 300, 60):
        raise HTTPException(status_code=429, detail="Rate limit")

    raw_body = await request.body()
    app_secret = os.environ.get("META_APP_SECRET", "").strip()
    signature = request.headers.get("x-hub-signature-256", "").strip()
    if app_secret:
        expected = "sha256=" + hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=403, detail="Assinatura do webhook inválida")
    else:
        raise HTTPException(status_code=503, detail="Webhook Meta não configurado: META_APP_SECRET ausente")

    try:
        import json
        body = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    processed = 0
    for entry in (body.get("entry") or [])[:20]:
        for change in (entry.get("changes") or [])[:20]:
            value = change.get("value") or {}
            phone_number_id = (value.get("metadata") or {}).get("phone_number_id")
            if not phone_number_id:
                continue
            integration = await db.integrations.find_one(
                {"kind": "whatsapp", "mode": "official", "connected": True, "phone_number_id": phone_number_id}
            )
            if not integration:
                logger.warning("webhook for unknown phone_number_id")
                continue
            company_id = integration["company_id"]
            company = await db.companies.find_one({"id": company_id})
            if not company or not company.get("active", True):
                continue

            contacts = {c.get("wa_id"): c.get("profile", {}).get("name", "") for c in (value.get("contacts") or [])}
            for raw in (value.get("messages") or [])[:20]:
                if raw.get("type") != "text":
                    continue
                external_id = raw.get("id")
                phone = raw.get("from", "")
                text = ((raw.get("text") or {}).get("body") or "").strip()
                if not (external_id and phone and text):
                    continue
                processed += await _process_web_message({
                    "company_id": company_id, "external_id": external_id, "phone": phone,
                    "name": contacts.get(phone) or phone, "text": text, "timestamp": raw.get("timestamp"),
                }, mode="official")

    return OkOut(message=f"{processed} mensagem(ns) processada(s)")
