"""Workspace: company, onboarding, agent config, knowledge, catalogue, customers,
dashboard, appointments, usage. Every query is scoped by principal.tenant()."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from lib import audit
from lib.db import db
from lib.deps import Principal, current_principal, require_role
from models.schemas import (
    AgentConfig,
    AgentConfigUpdate,
    Appointment,
    AppointmentInput,
    CompanyOut,
    CompanyUpdate,
    Customer,
    CustomerInput,
    DashboardOut,
    KnowledgeInput,
    KnowledgeItem,
    OkOut,
    OnboardingStepInput,
    Product,
    ProductInput,
    UsageOut,
)

router = APIRouter(tags=["workspace"])

PLAN_LIMITS = {
    "FREE": {"users": 2, "customers": 100, "ai_calls": 200, "conversations": 200},
    "BASIC": {"users": 5, "customers": 1000, "ai_calls": 2000, "conversations": 2000},
    "PRO": {"users": 15, "customers": 10000, "ai_calls": 20000, "conversations": 20000},
    "PREMIUM": {"users": 100, "customers": 100000, "ai_calls": 200000, "conversations": 200000},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def _company_out(c: dict) -> CompanyOut:
    return CompanyOut(
        id=c["id"], name=c["name"], segment=c.get("segment", ""), description=c.get("description", ""),
        phone=c.get("phone", ""), address=c.get("address", ""), business_hours=c.get("business_hours", ""),
        payment_methods=c.get("payment_methods", ""), plan=c.get("plan", "FREE"), active=c.get("active", True),
        onboarding_step=c.get("onboarding_step", 0), onboarding_done=c.get("onboarding_done", False),
        created_at=c["created_at"],
    )


# ---------- company + onboarding ----------
@router.get("/company", response_model=CompanyOut)
async def get_company(principal: Principal = Depends(current_principal)):
    return _company_out(principal.company)


@router.put("/company", response_model=CompanyOut)
async def update_company(payload: CompanyUpdate, request: Request,
                         principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    changes = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if changes:
        await db.companies.update_one({"id": principal.company_id}, {"$set": changes})
        await audit.log("company.updated", company_id=principal.company_id,
                        company_name=principal.company["name"], user_email=principal.user["email"],
                        detail=f"campos: {', '.join(changes)}", request=request)
    doc = await db.companies.find_one({"id": principal.company_id})
    return _company_out(doc)


@router.put("/company/onboarding", response_model=CompanyOut)
async def save_onboarding_step(payload: OnboardingStepInput,
                               principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    await db.companies.update_one(
        {"id": principal.company_id},
        {"$set": {"onboarding_step": payload.step, "onboarding_done": payload.done}},
    )
    doc = await db.companies.find_one({"id": principal.company_id})
    return _company_out(doc)


# ---------- agent config ----------
async def load_config(company_id: str) -> dict:
    doc = await db.agent_configs.find_one({"company_id": company_id})
    if not doc:
        doc = AgentConfig(company_id=company_id).model_dump()
        await db.agent_configs.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.get("/agent-config", response_model=AgentConfig)
async def get_agent_config(principal: Principal = Depends(current_principal)):
    return AgentConfig(**await load_config(principal.company_id))


@router.put("/agent-config", response_model=AgentConfig)
async def update_agent_config(payload: AgentConfigUpdate, request: Request,
                              principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    await load_config(principal.company_id)
    changes = payload.model_dump(exclude_none=True)
    changes["updated_at"] = _now()
    await db.agent_configs.update_one({"company_id": principal.company_id}, {"$set": changes})
    await audit.log("ai.config_updated", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=f"campos: {', '.join(k for k in changes if k != 'updated_at')}", request=request)
    return AgentConfig(**await load_config(principal.company_id))


# ---------- knowledge ("Ensine sua IA") ----------
@router.get("/knowledge", response_model=list[KnowledgeItem])
async def list_knowledge(principal: Principal = Depends(current_principal),
                         limit: int = Query(100, ge=1, le=200), skip: int = Query(0, ge=0)):
    docs = await db.knowledge.find(principal.tenant()).sort("created_at", -1).skip(skip).to_list(limit)
    return [KnowledgeItem(**d) for d in docs]


@router.post("/knowledge", response_model=KnowledgeItem, status_code=201)
async def create_knowledge(payload: KnowledgeInput, request: Request,
                           principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    item = KnowledgeItem(company_id=principal.company_id, **payload.model_dump())
    await db.knowledge.insert_one(item.model_dump())
    await audit.log("knowledge.created", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=item.title, request=request)
    return item


@router.put("/knowledge/{item_id}", response_model=KnowledgeItem)
async def update_knowledge(item_id: str, payload: KnowledgeInput,
                           principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    res = await db.knowledge.update_one(principal.tenant({"id": item_id}), {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Informação não encontrada")
    doc = await db.knowledge.find_one(principal.tenant({"id": item_id}))
    return KnowledgeItem(**doc)


@router.delete("/knowledge/{item_id}", response_model=OkOut)
async def delete_knowledge(item_id: str, principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    res = await db.knowledge.delete_one(principal.tenant({"id": item_id}))
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Informação não encontrada")
    return OkOut(message="Informação removida")


# ---------- catalogue ----------
@router.get("/products", response_model=list[Product])
async def list_products(principal: Principal = Depends(current_principal),
                        limit: int = Query(100, ge=1, le=200), skip: int = Query(0, ge=0)):
    docs = await db.products.find(principal.tenant()).sort("created_at", -1).skip(skip).to_list(limit)
    return [Product(**d) for d in docs]


@router.post("/products", response_model=Product, status_code=201)
async def create_product(payload: ProductInput, request: Request,
                         principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    item = Product(company_id=principal.company_id, **payload.model_dump())
    await db.products.insert_one(item.model_dump())
    await audit.log("catalog.created", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=item.name, request=request)
    return item


@router.put("/products/{item_id}", response_model=Product)
async def update_product(item_id: str, payload: ProductInput,
                         principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    res = await db.products.update_one(principal.tenant({"id": item_id}), {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    doc = await db.products.find_one(principal.tenant({"id": item_id}))
    return Product(**doc)


@router.delete("/products/{item_id}", response_model=OkOut)
async def delete_product(item_id: str, principal: Principal = Depends(require_role("MANAGER", "ADMIN", "OWNER"))):
    res = await db.products.delete_one(principal.tenant({"id": item_id}))
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return OkOut(message="Item removido")


# ---------- customers ----------
@router.get("/customers", response_model=list[Customer])
async def list_customers(principal: Principal = Depends(current_principal),
                         search: str = Query("", max_length=100),
                         limit: int = Query(50, ge=1, le=200), skip: int = Query(0, ge=0)):
    query = principal.tenant()
    if search:
        safe = search.strip()[:60]
        query["$or"] = [
            {"name": {"$regex": safe, "$options": "i"}},
            {"phone": {"$regex": safe, "$options": "i"}},
        ]
    docs = await db.customers.find(query).sort("created_at", -1).skip(skip).to_list(limit)
    return [Customer(**d) for d in docs]


@router.post("/customers", response_model=Customer, status_code=201)
async def create_customer(payload: CustomerInput, request: Request,
                          principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    phone = payload.phone.strip()
    if await db.customers.find_one(principal.tenant({"phone": phone})):
        raise HTTPException(status_code=409, detail="Já existe um cliente com este telefone")

    plan = principal.company.get("plan", "FREE")
    count = await db.customers.count_documents(principal.tenant())
    if count >= PLAN_LIMITS[plan]["customers"]:
        raise HTTPException(status_code=402, detail=f"Limite de clientes do plano {plan} atingido")

    data = payload.model_dump()
    data["phone"] = phone
    item = Customer(company_id=principal.company_id, **data)
    await db.customers.insert_one(item.model_dump())
    await audit.log("customer.created", company_id=principal.company_id,
                    company_name=principal.company["name"], user_email=principal.user["email"],
                    detail=item.name, request=request)
    return item


@router.put("/customers/{item_id}", response_model=Customer)
async def update_customer(item_id: str, payload: CustomerInput,
                          principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    res = await db.customers.update_one(principal.tenant({"id": item_id}), {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    doc = await db.customers.find_one(principal.tenant({"id": item_id}))
    return Customer(**doc)


@router.delete("/customers/{item_id}", response_model=OkOut)
async def delete_customer(item_id: str, principal: Principal = Depends(require_role("ADMIN", "OWNER"))):
    res = await db.customers.delete_one(principal.tenant({"id": item_id}))
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return OkOut(message="Cliente removido")


# ---------- appointments ----------
@router.get("/appointments", response_model=list[Appointment])
async def list_appointments(principal: Principal = Depends(current_principal),
                            limit: int = Query(50, ge=1, le=200)):
    docs = await db.appointments.find(principal.tenant()).sort("starts_at", 1).to_list(limit)
    return [Appointment(**d) for d in docs]


@router.post("/appointments", response_model=Appointment, status_code=201)
async def create_appointment(payload: AppointmentInput,
                             principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    item = Appointment(company_id=principal.company_id, **payload.model_dump())
    await db.appointments.insert_one(item.model_dump())
    return item


@router.delete("/appointments/{item_id}", response_model=OkOut)
async def cancel_appointment(item_id: str,
                             principal: Principal = Depends(require_role("AGENT", "MANAGER", "ADMIN", "OWNER"))):
    res = await db.appointments.update_one(principal.tenant({"id": item_id}), {"$set": {"status": "cancelado"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    return OkOut(message="Agendamento cancelado")


# ---------- dashboard ----------
async def build_checklist(principal: Principal) -> dict[str, bool]:
    company = principal.company
    cid = principal.company_id
    config = await db.agent_configs.find_one({"company_id": cid}) or {}
    integration = await db.integrations.find_one({"company_id": cid, "kind": "whatsapp"})
    return {
        "empresa": bool(company.get("segment") and company.get("description")),
        "personalidade": bool(config.get("ai_name")),
        "produtos": await db.products.count_documents({"company_id": cid, "active": True}) > 0,
        "conhecimento": await db.knowledge.count_documents({"company_id": cid, "active": True}) > 0,
        "atendimento": bool(config.get("service_rules") or config.get("custom_instructions")),
        "vendas": bool(config.get("sales_rules")) if config.get("enable_sales") else True,
        "whatsapp": bool(integration and integration.get("connected")),
        "teste": await db.ai_usage.count_documents({"company_id": cid}) > 0,
    }


PENDING_LABELS = {
    "empresa": "Complete as informações da sua empresa",
    "personalidade": "Defina a personalidade da sua IA",
    "produtos": "Cadastre seus produtos ou serviços",
    "conhecimento": "Ensine sua IA com as informações do negócio",
    "atendimento": "Defina as regras de atendimento",
    "vendas": "Defina as regras de vendas",
    "whatsapp": "Conecte seu WhatsApp",
    "teste": "Teste sua IA pela primeira vez",
}


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(principal: Principal = Depends(current_principal)):
    cid = principal.company_id
    start_of_day = _now().replace(hour=0, minute=0, second=0, microsecond=0)

    conversations_today = await db.conversations.count_documents(
        {"company_id": cid, "last_message_at": {"$gte": start_of_day}}
    )
    customers_served = await db.customers.count_documents({"company_id": cid, "last_interaction_at": {"$ne": None}})
    opportunities = await db.conversations.count_documents({"company_id": cid, "opportunity": True})
    recovered = await db.conversations.count_documents({"company_id": cid, "tags": "recuperado"})
    appointments = await db.appointments.count_documents({"company_id": cid, "status": "confirmado"})

    checklist = await build_checklist(principal)
    pending = [PENDING_LABELS[k] for k, ok in checklist.items() if not ok]
    return DashboardOut(
        conversations_today=conversations_today,
        customers_served=customers_served,
        opportunities=opportunities,
        recovered_sales=recovered,
        appointments=appointments,
        ai_status="ok" if not pending else "needs_config",
        pending_items=pending,
        checklist=checklist,
    )


@router.get("/usage", response_model=UsageOut)
async def usage(principal: Principal = Depends(current_principal)):
    cid = principal.company_id
    month_start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    plan = principal.company.get("plan", "FREE")
    return UsageOut(
        ai_calls_month=await db.ai_usage.count_documents({"company_id": cid, "created_at": {"$gte": month_start}}),
        messages_month=await db.messages.count_documents({"company_id": cid, "created_at": {"$gte": month_start}}),
        customers=await db.customers.count_documents({"company_id": cid}),
        conversations=await db.conversations.count_documents({"company_id": cid}),
        plan=plan,
        limits=PLAN_LIMITS[plan],
    )


@router.get("/audit-logs", response_model=list[dict])
async def company_audit_logs(principal: Principal = Depends(require_role("ADMIN", "OWNER")),
                             limit: int = Query(50, ge=1, le=200)):
    docs = await db.audit_logs.find(principal.tenant()).sort("created_at", -1).to_list(limit)
    return [
        {
            "id": d.get("id", ""),
            "action": d.get("action", ""),
            "detail": d.get("detail", ""),
            "user_email": d.get("user_email", ""),
            "ip": d.get("ip", ""),
            "created_at": _aware(d.get("created_at")).isoformat() if d.get("created_at") else "",
        }
        for d in docs
    ]


# helper reused by inbox/recovery routers
async def inactive_days_for(customer: dict) -> int:
    last = _aware(customer.get("last_interaction_at")) or _aware(customer.get("created_at"))
    if not last:
        return 0
    return max(0, (_now() - last).days)


__all__ = ["router", "load_config", "build_checklist", "PLAN_LIMITS", "inactive_days_for"]
