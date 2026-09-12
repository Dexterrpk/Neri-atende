"""Idempotent seed. NEVER drops a collection and never overwrites existing data.

Creates:
- the platform administrator account (credentials from the environment, or the
  documented development defaults)
- one demo company with its own isolated AI configuration

Run:  cd /app/backend && python seed.py
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

from lib.db import db, ensure_indexes
from lib.security import hash_password
from models.schemas import AgentConfig, Customer, KnowledgeItem, Product, RecoveryRules

ADMIN_EMAIL = os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@atendeia.com")
ADMIN_PASSWORD = os.environ.get("PLATFORM_ADMIN_PASSWORD", "")
DEMO_EMAIL = os.environ.get("DEMO_OWNER_EMAIL", "demo@atendeia.com")
DEMO_PASSWORD = os.environ.get("DEMO_OWNER_PASSWORD", "")


def now() -> datetime:
    return datetime.now(timezone.utc)


async def upsert_company(name: str, **fields) -> dict:
    existing = await db.companies.find_one({"name": name})
    if existing:
        return existing
    doc = {
        "id": str(uuid.uuid4()), "name": name, "plan": "PRO", "active": True,
        "onboarding_step": 8, "onboarding_done": True, "created_at": now(),
        "segment": "", "description": "", "phone": "", "address": "",
        "business_hours": "", "payment_methods": "",
    }
    doc.update(fields)
    await db.companies.insert_one(dict(doc))
    print(f"  + empresa criada: {name}")
    return doc


async def upsert_user(email: str, password: str, name: str, company_id: str,
                      role: str, platform_admin: bool = False) -> dict:
    existing = await db.users.find_one({"email": email})
    if existing:
        print(f"  = usuário já existe, preservado: {email}")
        return existing
    if len(password) < 12:
        raise RuntimeError("Configure uma senha inicial de pelo menos 12 caracteres")
    doc = {
        "id": str(uuid.uuid4()), "company_id": company_id, "name": name, "email": email,
        "password_hash": hash_password(password), "role": role,
        "is_platform_admin": platform_admin, "email_verified": True,
        "active": True, "created_at": now(),
    }
    await db.users.insert_one(dict(doc))
    print(f"  + usuário criado: {email} ({role}{', PLATFORM ADMIN' if platform_admin else ''})")
    return doc


async def main() -> None:
    print("Atende IA — seed idempotente (nenhum dado existente é apagado)\n")
    await ensure_indexes()

    # --- platform operator workspace ---
    platform_company = await upsert_company(
        "Neri Infotech (Plataforma)",
        segment="Tecnologia", plan="PREMIUM",
        description="Empresa operadora da plataforma Atende IA.",
    )
    if ADMIN_PASSWORD or await db.users.find_one({"email": ADMIN_EMAIL}):
        await upsert_user(ADMIN_EMAIL, ADMIN_PASSWORD, "Administrador da Plataforma",
                          platform_company["id"], "OWNER", platform_admin=True)
    else:
        print("Admin inicial não criado: configure PLATFORM_ADMIN_PASSWORD e execute seed.py.")
    if os.environ.get("SEED_DEMO", "false").lower() != "true":
        return
    if len(DEMO_PASSWORD) < 12:
        raise RuntimeError("Configure DEMO_OWNER_PASSWORD para habilitar SEED_DEMO")

    # --- demo tenant, fully isolated from the one above ---
    demo = await upsert_company(
        "Bella Estética & Bem-estar",
        segment="Estética e beleza",
        description="Clínica de estética com atendimento personalizado, focada em "
                    "tratamentos faciais, corporais e day spa.",
        phone="5511999990000",
        address="Rua das Acácias, 120 — São Paulo/SP",
        business_hours="Segunda a sexta, 9h às 19h. Sábado, 9h às 14h.",
        payment_methods="Pix, cartão de crédito em até 6x, débito e dinheiro.",
    )
    await upsert_user(DEMO_EMAIL, DEMO_PASSWORD, "Camila Ribeiro", demo["id"], "OWNER")
    await upsert_user("gerente@atendeia.com", DEMO_PASSWORD, "Bruno Lima", demo["id"], "MANAGER")
    await upsert_user("atendente@atendeia.com", DEMO_PASSWORD, "Paula Souza", demo["id"], "AGENT")

    for company_id in (platform_company["id"], demo["id"]):
        if not await db.agent_configs.find_one({"company_id": company_id}):
            await db.agent_configs.insert_one(AgentConfig(company_id=company_id).model_dump())
        key = f"recovery_rules:{company_id}"
        if not await db.platform_settings.find_one({"key": key}):
            await db.platform_settings.insert_one(
                {"key": key, "value": RecoveryRules(company_id=company_id).model_dump()}
            )

    # demo AI personality
    await db.agent_configs.update_one(
        {"company_id": demo["id"], "demo_personality_initialized": {"$ne": True}},
        {"$set": {
            "demo_personality_initialized": True,
            "ai_name": "Bella",
            "tone": "amigavel",
            "personality": "consultiva",
            "formality": "informal",
            "greeting": "Oi! Eu sou a Bella, da Bella Estética. Como posso te ajudar hoje?",
            "service_rules": "Sempre confirmar o procedimento desejado antes de sugerir horário. "
                             "Nunca prometer resultado clínico. Encaminhar dúvidas médicas à equipe.",
            "sales_rules": "Apresentar no máximo 2 opções por vez. Explicar o que está incluso. "
                           "Nunca oferecer desconto que não esteja cadastrado.",
            "discount_policy": "Descontos apenas nos itens marcados com preço promocional no catálogo.",
            "enable_sales": True,
            "enable_scheduling": True,
            "updated_at": now(),
        }},
    )

    # demo catalogue
    catalog = [
        ("Limpeza de Pele Profunda", "servico", 180.0, None, "Facial",
         "Sessão de 60 minutos com extração, hidratação e máscara calmante.", "disponivel"),
        ("Massagem Relaxante", "servico", 150.0, 120.0, "Corporal",
         "Sessão de 50 minutos com óleos essenciais.", "disponivel"),
        ("Day Spa Completo", "servico", 420.0, None, "Pacote",
         "Massagem, limpeza de pele, esfoliação e ritual dos pés. 3 horas.", "disponivel"),
        ("Sérum Vitamina C 30ml", "produto", 129.0, 99.0, "Skincare",
         "Sérum antioxidante para uso diário.", "disponivel"),
    ]
    for name, kind, price, promo, category, description, availability in catalog:
        if await db.products.find_one({"company_id": demo["id"], "name": name}):
            continue
        await db.products.insert_one(
            Product(company_id=demo["id"], name=name, kind=kind, price=price, promo_price=promo,
                    category=category, description=description, availability=availability).model_dump()
        )
    print("  + catálogo de demonstração garantido")

    # demo knowledge base
    knowledge = [
        ("horario", "Horário de funcionamento",
         "Segunda a sexta das 9h às 19h. Sábado das 9h às 14h. Domingo fechado."),
        ("pagamento", "Formas de pagamento",
         "Aceitamos Pix, dinheiro, débito e crédito em até 6x sem juros acima de R$ 300."),
        ("politica", "Política de cancelamento",
         "Cancelamentos com até 24h de antecedência não têm custo. "
         "Abaixo disso, cobramos 30% do valor do procedimento."),
        ("faq", "Preciso de avaliação antes do procedimento?",
         "Sim. Toda primeira sessão inclui uma avaliação gratuita de 15 minutos."),
    ]
    for kind, title, content in knowledge:
        if await db.knowledge.find_one({"company_id": demo["id"], "title": title}):
            continue
        await db.knowledge.insert_one(
            KnowledgeItem(company_id=demo["id"], kind=kind, title=title, content=content).model_dump()
        )
    print("  + base de conhecimento de demonstração garantida")

    # demo customers (some inactive, to exercise the recovery screen)
    customers = [
        ("Mariana Alves", "5511988880001", 420.0, 62),
        ("Rafael Costa", "5511988880002", 180.0, 8),
        ("Juliana Prado", "5511988880003", 0.0, 120),
        ("Tiago Menezes", "5511988880004", 129.0, 41),
    ]
    for name, phone, value, days_ago in customers:
        if await db.customers.find_one({"company_id": demo["id"], "phone": phone}):
            continue
        await db.customers.insert_one(
            Customer(
                company_id=demo["id"], name=name, phone=phone, origin="whatsapp",
                last_purchase_value=value,
                last_interaction_at=now() - timedelta(days=days_ago),
                last_purchase_at=now() - timedelta(days=days_ago) if value else None,
            ).model_dump()
        )
    print("  + clientes de demonstração garantidos")

    print("\nSeed concluído. Nenhuma coleção foi apagada.")
    print(f"  Admin da plataforma: {ADMIN_EMAIL}")
    print(f"  Dono da empresa demo: {DEMO_EMAIL}")


if __name__ == "__main__":
    asyncio.run(main())
