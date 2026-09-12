"""AIProvider abstraction — multi-provider, multi-credential, with automatic
fallback. Supported providers (direct integration, no vendor lock-in):

  - openai      (official Chat Completions API)
  - groq        (OpenAI-compatible, base_url=https://api.groq.com/openai/v1)
  - openrouter  (OpenAI-compatible, base_url=https://openrouter.ai/api/v1)
  - anthropic   (Messages API)
  - gemini      (google-generativeai)

Credentials are stored ENCRYPTED at rest in `ai_credentials` (Mongo). The API
never returns a key value — only a masked hint (last 4 chars). API keys are
never in logs, never in the frontend, never in Git.
"""

import logging
import os
import uuid
from datetime import datetime, timezone

from lib.db import db
from lib.security import decrypt_secret, encrypt_secret, mask_secret

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = ("openai", "groq", "openrouter", "anthropic", "gemini")

# Sensible default models per provider — used when the admin doesn't pin one.
# The picker prefers cheap/fast variants; the admin can override anytime.
# NOTE: providers sunset models frequently — probe_key auto-discovers a working
# alternative when the pinned model returns a decommissioned/404 error.
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "groq": "groq/compound-mini",
    "openrouter": "openai/gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "gemini": "gemini-1.5-flash",
}

# Substrings we want to AVOID when auto-picking a chat model from the provider
# catalog (transcription, embeddings, guards, TTS, image, etc.).
_NON_CHAT_HINTS = ("whisper", "embed", "guard", "orpheus", "tts", "audio",
                   "image", "vision-only", "safeguard")

# OpenAI-compatible base URLs (Chat Completions API surface).
OPENAI_COMPATIBLE_BASE_URLS = {
    "openai": None,  # default
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}

DEFAULTS = {
    "default_provider": "groq",
    "default_model": DEFAULT_MODELS["groq"],
    "fast_model": DEFAULT_MODELS["groq"],
    "complex_model": DEFAULT_MODELS["openai"],
    "max_tokens": 1200,
    "temperature": 0.6,
    "monthly_call_limit": 0,
    "fallback_provider": "gemini",
    "fallback_model": DEFAULT_MODELS["gemini"],
}


class AiUnavailable(Exception):
    """Raised when no provider credential is reachable."""


# ------------------------------- config -------------------------------------

async def get_provider_config() -> dict:
    doc = await db.platform_settings.find_one({"key": "ai_provider_config"})
    cfg = dict(DEFAULTS)
    if doc and isinstance(doc.get("value"), dict):
        cfg.update(doc["value"])
    return cfg


# ------------------------- credential store ---------------------------------

async def list_credentials(provider: str | None = None) -> list[dict]:
    """Public listing: returns metadata only, NEVER the plaintext key."""
    query: dict = {}
    if provider:
        query["provider"] = provider
    docs = await db.ai_credentials.find(query).sort([("provider", 1), ("priority", 1)]).to_list(200)
    return [
        {
            "id": d["id"],
            "provider": d["provider"],
            "name": d.get("name", ""),
            "active": bool(d.get("active", True)),
            "priority": int(d.get("priority", 100)),
            "model": d.get("model") or DEFAULT_MODELS.get(d["provider"], ""),
            "key_hint": d.get("key_hint", ""),
            "last_ok_at": d.get("last_ok_at"),
            "last_error": d.get("last_error", ""),
            "created_at": d.get("created_at"),
        }
        for d in docs
    ]


async def upsert_credential(payload: dict) -> dict:
    provider = payload["provider"]
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"provedor não suportado: {provider}")
    api_key = payload.get("api_key") or ""
    cred_id = payload.get("id") or str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    existing = await db.ai_credentials.find_one({"id": cred_id})
    doc = {
        "id": cred_id,
        "provider": provider,
        "name": payload.get("name") or f"{provider} principal",
        "active": bool(payload.get("active", True)),
        "priority": int(payload.get("priority", 100)),
        "model": payload.get("model") or (existing.get("model") if existing else DEFAULT_MODELS.get(provider)),
        "updated_at": now,
    }
    if not existing:
        doc["created_at"] = now
    if api_key:
        doc["encrypted"] = encrypt_secret(api_key)
        doc["key_hint"] = mask_secret(api_key)
    elif existing:
        # keep prior key untouched when rotating metadata only
        doc["encrypted"] = existing.get("encrypted")
        doc["key_hint"] = existing.get("key_hint", "")

    await db.ai_credentials.update_one({"id": cred_id}, {"$set": doc}, upsert=True)
    return {k: v for k, v in doc.items() if k != "encrypted"}


async def delete_credential(cred_id: str) -> bool:
    res = await db.ai_credentials.delete_one({"id": cred_id})
    return res.deleted_count > 0


async def _decrypt_key(doc: dict) -> str | None:
    blob = doc.get("encrypted")
    return decrypt_secret(blob) if blob else None


async def _active_credentials(provider: str | None = None) -> list[dict]:
    """Ordered list of (doc, decrypted key), lowest priority number first."""
    query = {"active": True, "encrypted": {"$ne": None}}
    if provider:
        query["provider"] = provider
    return await db.ai_credentials.find(query).sort([("priority", 1), ("created_at", 1)]).to_list(200)


# ------------------------- environment fallback -----------------------------

PROVIDER_ENV_KEYS = {
    "openai": ("OPENAI_API_KEY",),
    "groq": ("GROQ_API_KEY",),
    "openrouter": ("OPENROUTER_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
}
UNIFIED_ENV_KEYS = ("AI_API_KEY",)


def _env_key(provider: str) -> str | None:
    for k in PROVIDER_ENV_KEYS.get(provider, ()):
        v = os.environ.get(k)
        if v:
            return v
    for k in UNIFIED_ENV_KEYS:
        v = os.environ.get(k)
        if v:
            return v
    return None


# --- legacy: single AI_API_KEY stored in platform_settings ------------------
async def _legacy_admin_key() -> str | None:
    doc = await db.platform_settings.find_one({"key": "AI_API_KEY"})
    if doc and doc.get("encrypted"):
        return decrypt_secret(doc["encrypted"])
    return None


async def has_any_key() -> bool:
    if await db.ai_credentials.count_documents({"active": True, "encrypted": {"$ne": None}}) > 0:
        return True
    if await _legacy_admin_key():
        return True
    for p in SUPPORTED_PROVIDERS:
        if _env_key(p):
            return True
    return False


# Back-compat alias — some routes still call get_api_key(); truthy if any key is configured.
async def get_api_key() -> bool:
    return await has_any_key()


# --------------------------- adapter calls ----------------------------------

async def _call_openai_compatible(base_url: str | None, api_key: str, model: str,
                                  system_prompt: str, message: str, history: list[dict] | None,
                                  max_tokens: int, temperature: float) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=20, max_retries=0) if base_url else AsyncOpenAI(api_key=api_key, timeout=20, max_retries=0)
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for turn in (history or [])[-20:]:
        role = "user" if turn.get("role") == "customer" else "assistant"
        content = str(turn.get("content", ""))[:2000]
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})
    resp = await client.chat.completions.create(
        model=model, messages=messages, max_tokens=max_tokens, temperature=temperature
    )
    return (resp.choices[0].message.content or "").strip()


async def _call_anthropic(api_key: str, model: str, system_prompt: str, message: str,
                          history: list[dict] | None, max_tokens: int, temperature: float) -> str:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=api_key, timeout=20, max_retries=0)
    msgs: list[dict] = []
    for turn in (history or [])[-20:]:
        role = "user" if turn.get("role") == "customer" else "assistant"
        content = str(turn.get("content", ""))[:2000]
        if content:
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": message})
    resp = await client.messages.create(
        model=model, system=system_prompt, messages=msgs,
        max_tokens=max_tokens, temperature=temperature,
    )
    return "".join(getattr(b, "text", "") or "" for b in resp.content).strip()


async def _call_gemini(api_key: str, model: str, system_prompt: str, message: str,
                       history: list[dict] | None, max_tokens: int, temperature: float) -> str:
    import httpx
    from urllib.parse import quote

    contents = [{"role": "user" if t.get("role") == "customer" else "model",
                 "parts": [{"text": str(t.get("content", ""))[:2000]}]} for t in (history or [])[-20:]]
    contents.append({"role": "user", "parts": [{"text": message}]})
    # Per-request credentials: no process-global genai.configure shared across callers.
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model.removeprefix('models/'), safe='')}:generateContent",
            headers={"x-goog-api-key": api_key},
            json={"systemInstruction": {"parts": [{"text": system_prompt}]}, "contents": contents,
                  "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature}})
        response.raise_for_status()
        candidates = response.json().get("candidates") or []
        return "".join(p.get("text", "") for p in (candidates[0].get("content", {}).get("parts", []) if candidates else [])).strip()


async def _dispatch(provider: str, api_key: str, model: str,
                    system_prompt: str, message: str, history: list[dict] | None,
                    max_tokens: int, temperature: float) -> str:
    if provider in OPENAI_COMPATIBLE_BASE_URLS:
        return await _call_openai_compatible(
            OPENAI_COMPATIBLE_BASE_URLS[provider], api_key, model,
            system_prompt, message, history, max_tokens, temperature,
        )
    if provider == "anthropic":
        return await _call_anthropic(api_key, model, system_prompt, message, history, max_tokens, temperature)
    if provider == "gemini":
        return await _call_gemini(api_key, model, system_prompt, message, history, max_tokens, temperature)
    raise ValueError(f"provider {provider} not supported")


# --------------------------- test + models ----------------------------------

async def probe_key(provider: str, api_key: str, model: str | None = None) -> tuple[bool, str, str]:
    """Live-test a credential. Returns (ok, message, model_used). Never logs the key.

    When the pinned model returns a decommissioned/404-style error, we ask the
    provider for its live catalog and retry with the first suitable chat model.
    This keeps the flow resilient to provider model sunsets.
    """
    if provider not in SUPPORTED_PROVIDERS:
        return False, f"Provedor {provider} não suportado.", ""
    mdl = model or DEFAULT_MODELS.get(provider, "")
    prompt = "Responda apenas: OK"
    try:
        reply = await _dispatch(provider, api_key, mdl, prompt, prompt, None, 16, 0.0)
        if reply:
            return True, "Conexão bem-sucedida.", mdl
        raise RuntimeError("empty reply")
    except Exception as exc:
        msg = str(exc).lower()
        looks_like_model_gone = any(
            s in msg for s in ("does not exist", "not found", "decommission",
                               "deprecated", "unknown model", "model_not_found", "404")
        )
        # Auto-discovery fallback: fetch catalog and try a fresh chat model.
        if looks_like_model_gone:
            try:
                catalog = await list_provider_models(provider, api_key)
                for candidate in catalog[:8]:
                    if not candidate or candidate == mdl:
                        continue
                    if any(h in candidate.lower() for h in _NON_CHAT_HINTS):
                        continue
                    try:
                        reply = await _dispatch(provider, api_key, candidate, prompt,
                                                prompt, None, 16, 0.0)
                        if reply:
                            return True, f"Conexão bem-sucedida (modelo detectado automaticamente: {candidate}).", candidate
                    except Exception:
                        continue
            except Exception:
                pass
        return False, f"Falha ao conectar ({type(exc).__name__}).", mdl


async def list_provider_models(provider: str, api_key: str) -> list[str]:
    """Best-effort model discovery. Falls back to a curated list on failure."""
    try:
        if provider in OPENAI_COMPATIBLE_BASE_URLS:
            from openai import AsyncOpenAI

            base = OPENAI_COMPATIBLE_BASE_URLS[provider]
            client = AsyncOpenAI(api_key=api_key, base_url=base, timeout=20, max_retries=0) if base else AsyncOpenAI(api_key=api_key, timeout=20, max_retries=0)
            resp = await client.models.list()
            return sorted({m.id for m in resp.data})
        if provider == "anthropic":
            from anthropic import AsyncAnthropic
            async with AsyncAnthropic(api_key=api_key, timeout=20, max_retries=0) as client:
                page = await client.models.list(limit=50)
                return sorted(m.id for m in page.data)
        if provider == "gemini":
            import httpx
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get("https://generativelanguage.googleapis.com/v1beta/models",
                                            headers={"x-goog-api-key": api_key})
                response.raise_for_status()
                return sorted(m["name"].removeprefix("models/") for m in response.json().get("models", [])
                              if "generateContent" in m.get("supportedGenerationMethods", []))
    except Exception as exc:
        logger.warning("model discovery failed for %s: %s", provider, type(exc).__name__)
    return [DEFAULT_MODELS.get(provider, "")]


# --------------------------- usage log --------------------------------------

async def record_usage(company_id: str | None, provider: str, model: str, kind: str) -> None:
    await db.ai_usage.insert_one(
        {"company_id": company_id, "provider": provider, "model": model,
         "kind": kind, "created_at": datetime.now(timezone.utc)}
    )


def _mock_reply(_system_prompt: str, message: str) -> str:
    low = message.lower()
    if any(w in low for w in ("preço", "preco", "valor", "quanto custa")):
        return ("[modo teste] Posso te passar os valores do nosso catálogo. "
                "Assim que o serviço de IA estiver conectado, eu respondo com os preços "
                "cadastrados pela empresa — nunca com valores inventados.")
    if any(w in low for w in ("humano", "atendente", "pessoa", "reclama")):
        return "[modo teste] Entendi, vou te encaminhar para um atendente humano agora mesmo."
    return ("[modo teste] Recebi sua mensagem. A IA está em modo de teste porque nenhum "
            "provedor foi conectado. Configure em Painel do administrador → Provedores de IA.")


# --------------------------- generate (fallback chain) -----------------------

async def _build_attempt_chain(cfg: dict) -> list[tuple[str, str, str]]:
    """Return an ordered list of (provider, model, api_key) to try, in priority order.

    Priority:
      1. Active `ai_credentials` sorted by (priority asc, created_at asc). The
         default provider goes first when tied.
      2. Legacy single AI_API_KEY paired with cfg default_provider/model.
      3. Environment fallbacks per provider.
    """
    chain: list[tuple[str, str, str]] = []
    seen: set[str] = set()

    docs = await _active_credentials()
    # Move the default provider docs to the front to honour the admin's pick
    default_provider = cfg["default_provider"]
    docs.sort(key=lambda d: (0 if d["provider"] == default_provider else 1,
                             int(d.get("priority", 100)), d.get("created_at") or datetime.min))
    for d in docs:
        key = await _decrypt_key(d)
        if not key:
            continue
        model = d.get("model") or DEFAULT_MODELS.get(d["provider"], "")
        token = f"{d['provider']}|{d['id']}"
        if token in seen:
            continue
        seen.add(token)
        chain.append((d["provider"], model, key))

    legacy = await _legacy_admin_key()
    if legacy:
        chain.append((default_provider, cfg["default_model"], legacy))
        if cfg.get("fallback_provider") and cfg.get("fallback_model"):
            chain.append((cfg["fallback_provider"], cfg["fallback_model"], legacy))

    for p in (default_provider, cfg.get("fallback_provider"), *SUPPORTED_PROVIDERS):
        if not p:
            continue
        k = _env_key(p)
        if k:
            model = DEFAULT_MODELS.get(p, "")
            token = f"env|{p}"
            if token not in seen:
                seen.add(token)
                chain.append((p, model, k))
    return chain


async def generate(
    system_prompt: str,
    message: str,
    history: list[dict] | None = None,
    company_id: str | None = None,
    session_id: str = "sandbox",
    kind: str = "chat",
    model_tier: str = "default",
) -> tuple[str, str, str]:
    """Returns (reply, provider, model); raises AiUnavailable on quota exhaustion."""
    cfg = await get_provider_config()
    max_tokens = int(cfg.get("max_tokens") or 1200)
    temperature = float(cfg.get("temperature") or 0.6)

    chain = await _build_attempt_chain(cfg)
    if company_id and int(cfg.get("monthly_call_limit") or 0) > 0:
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used = await db.ai_usage.count_documents({"company_id": company_id, "created_at": {"$gte": month_start}})
        if used >= int(cfg["monthly_call_limit"]):
            raise AiUnavailable("Limite mensal de IA atingido")
    if not chain:
        return _mock_reply(system_prompt, message), "test", "mock"

    # Cap attempts to avoid pathological fallback loops.
    last_error: Exception | None = None
    for provider, model, key in chain[:6]:
        try:
            reply = await _dispatch(provider, key, model, system_prompt, message,
                                    history, max_tokens, temperature)
            if not reply:
                raise RuntimeError("empty reply")
            await record_usage(company_id, provider, model, kind)
            # Note: never log the key itself.
            return reply, provider, model
        except Exception as exc:
            last_error = exc
            logger.warning("ai fallback: %s/%s failed: %s", provider, model, type(exc).__name__)

    logger.error("all ai providers failed: %s", type(last_error).__name__ if last_error else "unknown")
    # Every candidate in the fallback chain raised. Degrade gracefully to test
    # mode so the product keeps answering (matches the "no working credential"
    # contract expected by /api/sandbox/chat).
    return _mock_reply(system_prompt, message), "test", "mock"


async def test_connection() -> tuple[bool, list[dict], str]:
    """Powers the admin [Testar conexão] button. Never returns or logs the key."""
    cfg = await get_provider_config()
    checks: list[dict] = []
    chain = await _build_attempt_chain(cfg)

    checks.append({"label": "Ao menos uma chave configurada", "ok": bool(chain)})
    if not chain:
        return False, checks, "Nenhuma chave de IA configurada."

    provider, model, key = chain[0]
    checks.append({"label": f"Provedor principal ({provider})", "ok": True})
    ok, msg, mdl = await probe_key(provider, key, model)
    checks.append({"label": "API acessível", "ok": ok})
    checks.append({"label": f"Modelo disponível ({mdl or model})", "ok": ok})
    return ok, checks, msg
