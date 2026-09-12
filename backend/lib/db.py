"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on.
INDEXES: dict[str, list[IndexModel]] = {
    "companies": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)], name="company_created"),
    ],
    "sessions": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "password_resets": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "agent_configs": [
        IndexModel([("company_id", ASCENDING)], name="company_id", unique=True),
    ],
    "knowledge": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)], name="company_created"),
    ],
    "products": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("company_id", ASCENDING), ("active", ASCENDING)], name="company_active"),
    ],
    "customers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("company_id", ASCENDING), ("phone", ASCENDING)], name="company_phone", unique=True),
        IndexModel([("company_id", ASCENDING), ("last_interaction_at", DESCENDING)], name="company_last"),
    ],
    "conversations": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("company_id", ASCENDING), ("customer_id", ASCENDING)],
                   name="one_open_customer", unique=True,
                   partialFilterExpression={"status": {"$in": ["novo", "em_atendimento", "aguardando_cliente", "precisa_humano"]}}),
        IndexModel([("company_id", ASCENDING), ("last_message_at", DESCENDING)], name="company_last"),
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING)], name="company_status"),
    ],
    "messages": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("conversation_id", ASCENDING), ("created_at", ASCENDING)], name="conv_created"),
        # idempotency: a duplicated webhook can never insert the same provider message twice
        IndexModel(
            [("company_id", ASCENDING), ("external_id", ASCENDING)],
            name="company_external",
            unique=True,
            partialFilterExpression={"external_id": {"$type": "string"}},
        ),
    ],
    "appointments": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("company_id", ASCENDING), ("starts_at", ASCENDING)], name="company_starts"),
    ],
    "integrations": [
        IndexModel([("company_id", ASCENDING), ("kind", ASCENDING)], name="company_kind", unique=True),
        IndexModel([("phone_number_id", ASCENDING)], name="official_phone_owner", unique=True,
                   partialFilterExpression={"kind": "whatsapp", "mode": "official", "phone_number_id": {"$type": "string"}}),
    ],
    "audit_logs": [
        IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)], name="company_created"),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "platform_settings": [
        IndexModel([("key", ASCENDING)], name="key", unique=True),
    ],
    "ai_usage": [
        IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)], name="company_created"),
    ],
    "ai_credentials": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("provider", ASCENDING), ("priority", ASCENDING)], name="provider_priority"),
        IndexModel([("active", ASCENDING)], name="active"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception:
                logger.error("Required index failed: %s.%s", collection, model.document["name"])
                raise  # Starting without uniqueness silently breaks tenant/message guarantees.
