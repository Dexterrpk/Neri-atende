"""Inbox: conversations, messages, AI replies, sandbox ("Testar minha IA") and
customer recovery. All tenant-scoped."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from lib import ai, audit, whatsapp
from lib.db import db
from lib.deps import Principal, current_principal, require_role
from lib.prompt import RECOVERY_PROMPT, build_system_prompt
from models.schemas import (
    Conversation,
    ConversationStatusInput,
    Customer,
    Message,
    OkOut,
    RecoveryDraftOut,
    RecoveryRules,
    RecoveryRulesUpdate,
    RecoveryTarget,
    SandboxInput,
    SandboxOut,
    SendMessageInput,
    TakeoverInput,
)
from routers.workspace import load_config

router = APIRouter(tags=["inbox"])

HANDOFF_MARK = "[TRANSFERIR_HUMANO]"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


# ---------- conversations ----------
@router.get("/conversations", response_model=list[Conversation])
async def list_conversations(principal: Principal = Depends(current_principal),
                             status: str = Query("", max_length=30),
                             limit: int = Query(50, ge=1, le=100), skip: int = Query(0, ge=0)):
    query = principal.tenant()
    if status:
        query["status"] = status
    docs = await db.conversations.find(query).sort("last_message_at", -1).skip(skip).to_list(limit)
    return [Conversation(**d) for d in docs]


@router.get("/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str, principal: Principal = Depends(current_principal)):
    doc = await db.conversations.find_one(principal.tenant({"id": conversation_id}))
    if not doc:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return Conversation(**doc)


@router.get("/conversations/{conversation_id}/messages", response_model=list[Message])
async def list_messages(conversation_id: str, principal: Principal = Depends(current_principal),
                        limit: int = Query(100, ge=1, le=300)):
    # tenant check first: an id from another company must 404, never leak
    conv = await db.conversations.find_one(principal.tenant({"id": conversation_id}))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    docs = await db.messages.find(
        {"company_id": principal.company_id, "conversation_id": conversation_id}
    ).sort("created_at", 1).to_list(limit)
    return [Message(**d) for d in docs]


async def _append_message(company_id: str, conversation_id: str, role: str, content: str,
                          author: str = "", external_id: str | None = None) -> Message:
    msg = Message(company_id=company_id, conversation_id=conversation_id, role=role,
                  content=content, author=author, external_id=external_id)
    await db.messages.insert_one(msg.model_dump())
    await db.conversations.update_one(
        {"id": conversation_id, "company_id": company_id},
        {"$set": {"last_message": content[:200], "last_message_at": msg.created_at}},
    )
    return msg


async def ensure_conversation(company_id: str, customer: dict) -> dict:
    conv = await db.conversations.find_one(
        {"company_id": company_id, "customer_id": customer["id"], "status": {"$ne": "resolvido"}}
    )
    if conv:
        return conv
    new = Conversation(
        company_id=company_id,
        customer_id=customer["id"],
        customer_name=customer.get("name", ""),
        customer_phone=customer.get("phone", ""),
    )
    await db.conversations.insert_one(new.model_dump())
    return new.model_dump()


async def run_ai_reply(company: dict, config: dict, conversation: dict, incoming: str) -> tuple[str, bool]:
    history = await db.messages.find(
        {"company_id": company["id"], "conversation_id": conversation["id"]}
    ).sort("created_at", 1).to_list(30)
    prompt, _ = await build_system_prompt(company, config)
    reply, _provider, _model = await ai.generate(
        prompt, incoming,
        history=[{"role": m["role"], "content": m["content"]} for m in history[:-1]],
        company_id=company["id"], session_id=f"conv-{conversation['id']}", kind="reply",
    )
    needs_human = HANDOFF_MARK in reply
    return reply.replace(HANDOFF_MARK, "").strip(), needs_human


@router.post("/conversations/{conversation_id}/reply", response_model=Message)
async def agent_reply(conversation_id: str, payload: SendMessageInput, request: Request,
                      principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    """A human agent replies. Taking over automatically pauses the AI."""
    conv = await db.conversations.find_one(principal.tenant({"id": conversation_id}))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    await db.conversations.update_one(
        principal.tenant({"id": conversation_id}),
        {"$set": {"ai_paused": True, "assignee": principal.user["name"], "status": "em_atendimento"}},
    )
    msg = await _append_message(principal.company_id, conversation_id, "human",
                                payload.content, author=principal.user["name"])
    sent, detail = await whatsapp.send_message(principal.company_id, conv["customer_phone"], payload.content)
    await audit.log("inbox.human_reply", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"conversa {conversation_id} | envio: {detail}", request=request)
    if not sent:
        # message is stored either way so nothing is lost; the UI surfaces the delivery state
        pass
    return msg


@router.post("/conversations/{conversation_id}/simulate-customer", response_model=list[Message])
async def simulate_customer(conversation_id: str, payload: SendMessageInput,
                            principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    """Test mode: injects a customer message and lets the AI answer, with no real send."""
    conv = await db.conversations.find_one(principal.tenant({"id": conversation_id}))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    incoming = await _append_message(principal.company_id, conversation_id, "customer",
                                     payload.content, author=conv["customer_name"])
    await db.customers.update_one(
        principal.tenant({"id": conv["customer_id"]}), {"$set": {"last_interaction_at": _now()}}
    )
    out = [incoming]
    if conv.get("ai_paused"):
        return out

    config = await load_config(principal.company_id)
    reply, needs_human = await run_ai_reply(principal.company, config, conv, payload.content)
    out.append(await _append_message(principal.company_id, conversation_id, "ai", reply,
                                     author=config.get("ai_name", "IA")))
    await db.conversations.update_one(
        principal.tenant({"id": conversation_id}),
        {"$set": {"status": "precisa_humano" if needs_human else "em_atendimento",
                  "ai_paused": needs_human}},
    )
    return out


@router.patch("/conversations/{conversation_id}/status", response_model=Conversation)
async def set_status(conversation_id: str, payload: ConversationStatusInput,
                     principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    res = await db.conversations.update_one(principal.tenant({"id": conversation_id}),
                                            {"$set": {"status": payload.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    doc = await db.conversations.find_one(principal.tenant({"id": conversation_id}))
    return Conversation(**doc)


@router.post("/conversations/{conversation_id}/takeover", response_model=Conversation)
async def takeover(conversation_id: str, payload: TakeoverInput, request: Request,
                   principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    """take=true → human owns the conversation and the AI stops replying.
    take=false → hands it back to the AI."""
    updates = (
        {"ai_paused": True, "assignee": principal.user["name"], "status": "em_atendimento"}
        if payload.take
        else {"ai_paused": False, "assignee": "IA", "status": "em_atendimento"}
    )
    res = await db.conversations.update_one(principal.tenant({"id": conversation_id}), {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    await audit.log("inbox.takeover" if payload.take else "inbox.handback",
                    company_id=principal.company_id, company_name=principal.company["name"],
                    user_email=principal.user["email"], detail=conversation_id, request=request)
    doc = await db.conversations.find_one(principal.tenant({"id": conversation_id}))
    return Conversation(**doc)


@router.post("/conversations/start/{customer_id}", response_model=Conversation, status_code=201)
async def start_conversation(customer_id: str,
                             principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    customer = await db.customers.find_one(principal.tenant({"id": customer_id}))
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    conv = await ensure_conversation(principal.company_id, customer)
    return Conversation(**conv)


# ---------- sandbox: "Testar minha IA" ----------
@router.post("/sandbox/chat", response_model=SandboxOut)
async def sandbox_chat(payload: SandboxInput, principal: Principal = Depends(current_principal)):
    """Talks to the tenant's configured AI without sending anything to a real customer."""
    if ai_rate_limited(principal):
        raise HTTPException(status_code=429, detail="Muitas mensagens de teste seguidas. Aguarde um instante.")

    config = await load_config(principal.company_id)
    prompt, summary = await build_system_prompt(principal.company, config)
    reply, provider, model = await ai.generate(
        prompt, payload.message,
        history=[{"role": h.get("role", "customer"), "content": str(h.get("content", ""))} for h in payload.history],
        company_id=principal.company_id, session_id=f"sandbox-{principal.company_id}", kind="sandbox",
    )
    needs_human = HANDOFF_MARK in reply
    return SandboxOut(
        reply=reply.replace(HANDOFF_MARK, "").strip(),
        provider=provider, model=model, needs_human=needs_human, config_used=summary,
    )


def ai_rate_limited(principal: Principal) -> bool:
    from lib.security import rate_limit_exceeded

    return rate_limit_exceeded(f"ai:{principal.company_id}", 40, 60)


@router.get("/sandbox/prompt", response_model=dict)
async def sandbox_prompt(principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    """Lets the owner inspect exactly which configuration the AI is using."""
    config = await load_config(principal.company_id)
    _prompt, summary = await build_system_prompt(principal.company, config)
    return {"config_used": summary}


# ---------- recovery ----------
async def _rules_doc(company_id: str) -> dict:
    key = f"recovery_rules:{company_id}"
    doc = await db.platform_settings.find_one({"key": key})
    if not doc:
        value = RecoveryRules(company_id=company_id).model_dump()
        await db.platform_settings.insert_one({"key": key, "value": value})
        return value
    return doc["value"]


@router.get("/recovery/rules", response_model=RecoveryRules)
async def get_recovery_rules(principal: Principal = Depends(current_principal)):
    return RecoveryRules(**await _rules_doc(principal.company_id))


@router.put("/recovery/rules", response_model=RecoveryRules)
async def update_recovery_rules(payload: RecoveryRulesUpdate, request: Request,
                                principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    current = await _rules_doc(principal.company_id)
    current.update(payload.model_dump(exclude_none=True))
    current["updated_at"] = _now()
    await db.platform_settings.update_one(
        {"key": f"recovery_rules:{principal.company_id}"}, {"$set": {"value": current}}, upsert=True
    )
    await audit.log("recovery.rules_updated", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"], request=request)
    return RecoveryRules(**current)


@router.get("/recovery/targets", response_model=list[RecoveryTarget])
async def recovery_targets(principal: Principal = Depends(current_principal),
                           limit: int = Query(50, ge=1, le=200)):
    rules = await _rules_doc(principal.company_id)
    cutoff_days = rules.get("inactive_days", 30)
    docs = await db.customers.find(principal.tenant()).sort("last_interaction_at", 1).to_list(limit * 3)

    targets: list[RecoveryTarget] = []
    for c in docs:
        last = _aware(c.get("last_interaction_at")) or _aware(c.get("created_at"))
        days = max(0, (_now() - last).days) if last else 0
        if days < cutoff_days:
            continue
        value = c.get("last_purchase_value", 0) or 0
        opportunity = "alta" if value >= 300 else "media" if value > 0 else "baixa"
        targets.append(
            RecoveryTarget(
                customer_id=c["id"], name=c.get("name", ""), phone=c.get("phone", ""),
                last_interaction_at=_aware(c.get("last_interaction_at")),
                last_purchase_at=_aware(c.get("last_purchase_at")),
                last_purchase_value=value, days_inactive=days, opportunity=opportunity,
            )
        )
        if len(targets) >= limit:
            break
    return targets


@router.post("/recovery/draft/{customer_id}", response_model=RecoveryDraftOut)
async def recovery_draft(customer_id: str,
                         principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    """Generates a personalised draft. Nothing is sent — the user approves first."""
    customer = await db.customers.find_one(principal.tenant({"id": customer_id}))
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if ai_rate_limited(principal):
        raise HTTPException(status_code=429, detail="Muitas gerações seguidas. Aguarde um instante.")

    config = await load_config(principal.company_id)
    last = _aware(customer.get("last_interaction_at")) or _aware(customer.get("created_at"))
    days = max(0, (_now() - last).days) if last else 0
    prompt = RECOVERY_PROMPT.format(
        company=principal.company.get("name", ""), ai_name=config.get("ai_name", "Atendimento")
    )
    context = (
        f"Cliente: {customer.get('name')}. Está há {days} dias sem interagir. "
        f"Última compra registrada: {customer.get('last_purchase_value', 0)}. "
        "Escreva a mensagem de reativação."
    )
    message, provider, model = await ai.generate(
        prompt, context, company_id=principal.company_id,
        session_id=f"recovery-{customer_id}", kind="recovery", model_tier="fast",
    )
    return RecoveryDraftOut(customer_id=customer_id, message=message, provider=provider, model=model)


@router.post("/recovery/send/{customer_id}", response_model=OkOut)
async def recovery_send(customer_id: str, payload: SendMessageInput, request: Request,
                        principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    """Approved send. Respects the daily limit and records the attempt."""
    customer = await db.customers.find_one(principal.tenant({"id": customer_id}))
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    rules = await _rules_doc(principal.company_id)
    start_of_day = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    sent_today = await db.messages.count_documents(
        {"company_id": principal.company_id, "role": "human", "author": "Recuperação",
         "created_at": {"$gte": start_of_day}}
    )
    if sent_today >= rules.get("daily_limit", 30):
        raise HTTPException(status_code=429, detail="Limite diário de mensagens de recuperação atingido")

    conv = await ensure_conversation(principal.company_id, customer)
    await _append_message(principal.company_id, conv["id"], "human", payload.content, author="Recuperação")
    await db.conversations.update_one(
        {"id": conv["id"], "company_id": principal.company_id},
        {"$addToSet": {"tags": "recuperacao"}, "$set": {"opportunity": True, "status": "aguardando_cliente"}},
    )
    sent, detail = await whatsapp.send_message(principal.company_id, customer["phone"], payload.content)
    await audit.log("recovery.message_sent", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"cliente {customer_id} | {detail}", request=request)
    return OkOut(ok=sent, message="Mensagem enviada" if sent else f"Registrada, mas não enviada: {detail}")


@router.post("/recovery/mark-recovered/{conversation_id}", response_model=OkOut)
async def mark_recovered(conversation_id: str,
                         principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    res = await db.conversations.update_one(
        principal.tenant({"id": conversation_id}),
        {"$addToSet": {"tags": "recuperado"}, "$set": {"status": "resolvido"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return OkOut(message="Cliente marcado como recuperado")


# ---------- demo data (explicit, reversible, per-tenant) ----------
@router.post("/workspace/demo-data", response_model=OkOut)
async def create_demo_data(request: Request, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    """Adds example customers + conversations to THIS tenant only, so an empty
    account can be explored. Never touches another company's data."""
    from datetime import timedelta

    samples = [
        ("Mariana Alves", "5511988880001", 420.0, 45),
        ("Rafael Costa", "5511988880002", 180.0, 12),
        ("Juliana Prado", "5511988880003", 0.0, 90),
    ]
    created = 0
    for name, phone, value, days_ago in samples:
        if await db.customers.find_one(principal.tenant({"phone": phone})):
            continue
        cust = Customer(
            company_id=principal.company_id, name=name, phone=phone, origin="exemplo",
            last_purchase_value=value,
            last_interaction_at=_now() - timedelta(days=days_ago),
            last_purchase_at=_now() - timedelta(days=days_ago) if value else None,
        )
        await db.customers.insert_one(cust.model_dump())
        conv = await ensure_conversation(principal.company_id, cust.model_dump())
        await _append_message(principal.company_id, conv["id"], "customer",
                              "Olá, gostaria de saber mais sobre os serviços de vocês.", author=name)
        created += 1

    await audit.log("workspace.demo_data", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"{created} clientes de exemplo", request=request)
    return OkOut(message=f"{created} clientes de exemplo adicionados" if created
                 else "Os clientes de exemplo já existem nesta conta")
