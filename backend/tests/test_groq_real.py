"""Groq real-key regression — validates DEFAULT_MODELS['groq'] and probe_key
auto-discovery against a REAL Groq API key.

The key is read from os.environ['GROQ_TEST_KEY']. Tests that require the real
key are skipped when the env var is unset. The key value is NEVER written to
any file, response body, or log.
"""
import glob
import os
import subprocess

import httpx
import pytest

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"

ADMIN_EMAIL = "admin@atendeia.com"
ADMIN_PASS = os.environ.get("PLATFORM_ADMIN_PASSWORD", "")
DEMO_EMAIL = "demo@atendeia.com"
DEMO_PASS = os.environ.get("DEMO_OWNER_PASSWORD", "")

GROQ_KEY = os.environ.get("GROQ_TEST_KEY", "")
_requires_real_key = pytest.mark.skipif(
    not GROQ_KEY, reason="GROQ_TEST_KEY env var not set"
)


def _login(email: str, password: str) -> httpx.Client:
    c = httpx.Client(base_url=API, timeout=60.0)
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.cookies.get("atende_session") or c.cookies.get("atende_session")
    c.cookies.clear()
    c.headers["Cookie"] = f"atende_session={token}"
    return c


@pytest.fixture(scope="module")
def admin_client():
    c = _login(ADMIN_EMAIL, ADMIN_PASS)
    # These tests require a disposable backend. Never delete pre-existing credentials.
    existing = c.get("/admin/ai/credentials")
    assert existing.status_code == 200 and existing.json() == [], "Use a clean, isolated test database"
    yield c
    cid = getattr(pytest, "cred_id", None) or getattr(pytest, "groq_cred_id", None)
    if cid:
        c.delete(f"/admin/ai/credentials/{cid}")
    c.close()


# --- (1) test with default (new) model ---
@_requires_real_key
def test_probe_default_model_success(admin_client):
    r = admin_client.post(
        "/admin/ai/credentials/test",
        json={"provider": "groq", "api_key": GROQ_KEY},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True, f"expected ok=true, got {body}"
    assert "Conex" in body.get("message", ""), body
    # Should have used the new pinned default OR an auto-discovered fallback
    assert body.get("model"), f"missing model in response: {body}"
    # Key must not leak
    assert GROQ_KEY not in r.text


# --- (2) explicit sunset model must trigger auto-discovery ---
@_requires_real_key
def test_probe_sunset_model_autodiscovers(admin_client):
    r = admin_client.post(
        "/admin/ai/credentials/test",
        json={
            "provider": "groq",
            "api_key": GROQ_KEY,
            "model": "llama-3.1-8b-instant",  # decommissioned
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True, f"expected ok=true after auto-discovery, got {body}"
    assert "detectado automaticamente" in body.get("message", ""), body
    assert body.get("model") and body["model"] != "llama-3.1-8b-instant", body
    assert GROQ_KEY not in r.text


# --- (3) PUT credential masks the key ---
@_requires_real_key
def test_put_credential_masked(admin_client):
    r = admin_client.put(
        "/admin/ai/credentials",
        json={
            "provider": "groq",
            "name": "Principal",
            "api_key": GROQ_KEY,
            "model": "groq/compound-mini",
            "priority": 10,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert GROQ_KEY not in r.text
    hint = body.get("key_hint", "")
    assert hint, "missing key_hint"
    assert hint.endswith(GROQ_KEY[-4:]), f"hint {hint!r} should end with last-4"
    assert "•" in hint or "*" in hint
    assert not body.get("api_key")
    assert not body.get("encrypted")
    pytest.groq_cred_id = body["id"]


# --- (4) sandbox chat performs a real Groq call ---
@_requires_real_key
def test_sandbox_chat_uses_real_groq():
    c = _login(DEMO_EMAIL, DEMO_PASS)
    try:
        r = c.post("/sandbox/chat", json={"message": "Diga apenas: pong"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("provider") == "groq", f"expected provider=groq, got {body}"
        assert body.get("model"), body
        reply = body.get("reply") or body.get("message") or ""
        assert reply, f"empty reply: {body}"
        assert not reply.startswith("[modo teste]"), f"got mock reply: {reply!r}"
        assert GROQ_KEY not in r.text
    finally:
        c.close()


# --- (5) DELETE the credential ---
@_requires_real_key
def test_delete_groq_credential(admin_client):
    cid = getattr(pytest, "groq_cred_id", None)
    assert cid, "no credential to delete (previous test likely failed)"
    r = admin_client.delete(f"/admin/ai/credentials/{cid}")
    assert r.status_code == 200


# --- (6) SECURITY: audit-log detail must not contain plaintext key ---
@_requires_real_key
def test_audit_log_never_contains_key(admin_client):
    r = admin_client.get("/admin/audit-logs", params={"limit": 200})
    assert r.status_code == 200
    assert GROQ_KEY not in r.text
    for log in r.json():
        assert GROQ_KEY not in (log.get("detail") or "")


# --- (7) SECURITY: supervisor backend logs must not contain the key ---
@_requires_real_key
def test_supervisor_logs_never_contain_key():
    for path in glob.glob("/var/log/supervisor/backend.*.log"):
        try:
            with open(path, errors="ignore") as f:
                data = f.read()
        except OSError:
            continue
        assert GROQ_KEY not in data, f"key leaked in {path}"


# --- (8) SECURITY: no test file under /app/backend/tests contains the REAL key ---
@_requires_real_key
def test_real_key_not_in_test_files():
    """Prevents accidental hardcoding of the REAL Groq key in test sources."""
    from pathlib import Path
    matches = [str(p) for p in Path(__file__).parent.glob("*.py") if GROQ_KEY in p.read_text(encoding="utf-8")]
    assert not matches, f"REAL key found literally in: {matches}"
