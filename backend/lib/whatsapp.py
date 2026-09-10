"""WhatsAppProvider abstraction.

Two implementations share one interface so the provider can be swapped without
touching application code:

- `official`  → Meta WhatsApp Business Cloud API (requires tenant credentials)
- `test`      → no external call; messages stay inside the platform

WhatsApp Web / Puppeteer is deliberately NOT supported: it is unsafe for production.
"""

import logging
import os
from datetime import datetime, timezone

import httpx

from lib.db import db
from lib.security import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)

GRAPH_VERSION = "v21.0"
TIMEOUT = httpx.Timeout(15.0, connect=5.0)
REQUIRED_OFFICIAL_FIELDS = ("phone_number_id", "access_token", "verify_token")


def webhook_url() -> str:
    base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    return f"{base}/api/whatsapp/webhook" if base else "/api/whatsapp/webhook"


async def get_integration(company_id: str) -> dict | None:
    return await db.integrations.find_one({"company_id": company_id, "kind": "whatsapp"})


async def save_integration(company_id: str, payload: dict) -> dict:
    """Secrets are encrypted before they touch the database."""
    existing = await get_integration(company_id) or {}
    doc = {
        "company_id": company_id,
        "kind": "whatsapp",
        "mode": payload.get("mode") or existing.get("mode") or "test",
        "phone_number": payload.get("phone_number") or existing.get("phone_number", ""),
        "display_name": payload.get("display_name") or existing.get("display_name", ""),
        "phone_number_id": payload.get("phone_number_id") or existing.get("phone_number_id", ""),
        "last_error": "",
        "updated_at": datetime.now(timezone.utc),
    }
    for field in ("access_token", "verify_token"):
        incoming = (payload.get(field) or "").strip()
        if incoming:
            doc[f"{field}_encrypted"] = encrypt_secret(incoming)
        elif existing.get(f"{field}_encrypted"):
            doc[f"{field}_encrypted"] = existing[f"{field}_encrypted"]

    if doc["mode"] == "test":
        doc["connected"] = True
        doc["last_sync_at"] = datetime.now(timezone.utc)
    else:
        doc["connected"] = all(
            doc.get(f) or doc.get(f"{f}_encrypted") for f in ("phone_number_id", "access_token", "verify_token")
        )
        doc["last_sync_at"] = datetime.now(timezone.utc) if doc["connected"] else existing.get("last_sync_at")

    await db.integrations.update_one(
        {"company_id": company_id, "kind": "whatsapp"}, {"$set": doc}, upsert=True
    )
    return doc


def status_payload(doc: dict | None) -> dict:
    """Never exposes a token — only whether one is configured."""
    if not doc:
        return {
            "connected": False,
            "mode": "test",
            "phone_number": "",
            "display_name": "",
            "last_sync_at": None,
            "last_error": "",
            "webhook_url": webhook_url(),
            "token_configured": False,
            "missing": ["numero", "conexao"],
        }
    missing = []
    if doc.get("mode") == "official":
        for field in REQUIRED_OFFICIAL_FIELDS:
            if not (doc.get(field) or doc.get(f"{field}_encrypted")):
                missing.append(field)
    elif not doc.get("phone_number"):
        missing.append("numero")

    return {
        "connected": bool(doc.get("connected")) and not missing,
        "mode": doc.get("mode", "test"),
        "phone_number": doc.get("phone_number", ""),
        "display_name": doc.get("display_name", ""),
        "last_sync_at": doc.get("last_sync_at"),
        "last_error": doc.get("last_error", ""),
        "webhook_url": webhook_url(),
        "token_configured": bool(doc.get("access_token_encrypted")),
        "missing": missing,
    }


async def send_message(company_id: str, to_phone: str, text: str) -> tuple[bool, str]:
    """Returns (sent, detail). Test mode short-circuits with no external call."""
    doc = await get_integration(company_id)
    if not doc or not doc.get("connected"):
        return False, "WhatsApp não conectado"

    if doc.get("mode") != "official":
        return True, "modo teste: mensagem registrada apenas na plataforma"

    token = decrypt_secret(doc.get("access_token_encrypted", "")) if doc.get("access_token_encrypted") else None
    phone_number_id = doc.get("phone_number_id")
    if not token or not phone_number_id:
        return False, "Credenciais da API oficial incompletas"

    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": text[:4000]},
    }
    # controlled retry with exponential backoff, no secret in any log line
    delays = [0, 1, 3]
    last_detail = ""
    for attempt, delay in enumerate(delays):
        if delay:
            import asyncio

            await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as http:
                res = await http.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})
            if res.status_code < 300:
                await db.integrations.update_one(
                    {"company_id": company_id, "kind": "whatsapp"},
                    {"$set": {"last_sync_at": datetime.now(timezone.utc), "last_error": ""}},
                )
                return True, "enviado"
            last_detail = f"HTTP {res.status_code}"
            if res.status_code < 500 and res.status_code != 429:
                break  # client error: retrying will not help
        except Exception as exc:
            last_detail = type(exc).__name__
        logger.warning("whatsapp send attempt %s failed: %s", attempt + 1, last_detail)

    await db.integrations.update_one(
        {"company_id": company_id, "kind": "whatsapp"},
        {"$set": {"last_error": f"Falha ao enviar ({last_detail})"}},
    )
    return False, f"Falha ao enviar ({last_detail})"


async def verify_webhook_token(company_id: str, token: str) -> bool:
    doc = await get_integration(company_id)
    if not doc or not doc.get("verify_token_encrypted"):
        return False
    return decrypt_secret(doc["verify_token_encrypted"]) == token
