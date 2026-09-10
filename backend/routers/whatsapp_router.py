"""WhatsApp connection + inbound webhook. Tokens are never returned to the client."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from lib import audit, whatsapp
from lib.db import db
from lib.deps import Principal, current_principal, require_role
from lib.security import rate_limit_exceeded
from models.schemas import Customer, OkOut, WhatsAppConnectInput, WhatsAppStatusOut
from routers.inbox import _append_message, ensure_conversation, run_ai_reply
from routers.workspace import load_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.get("/status", response_model=WhatsAppStatusOut)
async def status(principal: Principal = Depends(current_principal)):
    doc = await whatsapp.get_integration(principal.company_id)
    return WhatsAppStatusOut(**whatsapp.status_payload(doc))


@router.put("/connect", response_model=WhatsAppStatusOut)
async def connect(payload: WhatsAppConnectInput, request: Request,
                  principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    if payload.mode not in ("test", "official"):
        raise HTTPException(status_code=422, detail="Modo inválido")
    if payload.mode == "official" and not payload.phone_number_id:
        raise HTTPException(status_code=422, detail="Informe o ID do número da API oficial")

    doc = await whatsapp.save_integration(principal.company_id, payload.model_dump())
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
    """Revokes the stored credentials for this tenant. Conversation history is preserved."""
    await db.integrations.update_one(
        {"company_id": principal.company_id, "kind": "whatsapp"},
        {"$set": {"connected": False},
         "$unset": {"access_token_encrypted": "", "verify_token_encrypted": ""}},
    )
    await audit.log("whatsapp.disconnected", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail="credenciais revogadas", request=request)
    return OkOut(message="WhatsApp desconectado e credenciais removidas")


@router.post("/test-send", response_model=OkOut)
async def test_send(request: Request, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    doc = await whatsapp.get_integration(principal.company_id)
    st = whatsapp.status_payload(doc)
    if not st["connected"]:
        raise HTTPException(status_code=400, detail="Conecte o WhatsApp antes de testar")
    target = st["phone_number"] or ""
    if not target:
        raise HTTPException(status_code=400, detail="Informe o número conectado antes de testar")
    sent, detail = await whatsapp.send_message(principal.company_id, target, "Teste de conexão do Atende IA.")
    await audit.log("whatsapp.test_send", company_id=principal.company_id,
                    user_email=principal.user["email"], detail=detail, request=request)
    return OkOut(ok=sent, message=detail)


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

    try:
        body = await request.json()
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
                {"kind": "whatsapp", "phone_number_id": phone_number_id}
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
                if await db.messages.find_one({"company_id": company_id, "external_id": external_id}):
                    continue  # duplicate delivery — ignore silently

                customer = await db.customers.find_one({"company_id": company_id, "phone": phone})
                if not customer:
                    customer = Customer(
                        company_id=company_id, name=contacts.get(phone) or phone,
                        phone=phone, origin="whatsapp",
                        last_interaction_at=datetime.now(timezone.utc),
                    ).model_dump()
                    await db.customers.insert_one(dict(customer))
                else:
                    await db.customers.update_one(
                        {"_id": customer["_id"]},
                        {"$set": {"last_interaction_at": datetime.now(timezone.utc)}},
                    )

                conv = await ensure_conversation(company_id, customer)
                try:
                    await _append_message(company_id, conv["id"], "customer", text,
                                          author=customer.get("name", ""), external_id=external_id)
                except Exception:
                    continue  # unique-index race: another worker already stored it
                processed += 1

                if conv.get("ai_paused"):
                    continue  # a human owns this conversation; the AI stays silent
                config = await load_config(company_id)
                reply, needs_human = await run_ai_reply(company, config, conv, text)
                await _append_message(company_id, conv["id"], "ai", reply, author=config.get("ai_name", "IA"))
                await whatsapp.send_message(company_id, phone, reply)
                await db.conversations.update_one(
                    {"id": conv["id"], "company_id": company_id},
                    {"$set": {"status": "precisa_humano" if needs_human else "em_atendimento",
                              "ai_paused": needs_human}},
                )

    return OkOut(message=f"{processed} mensagem(ns) processada(s)")
