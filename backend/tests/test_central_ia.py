"""Central de IA — backend tests for provider/credential management."""
import os
import httpx
import pytest

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"

ADMIN_EMAIL = "admin@atendeia.com"
ADMIN_PASS = "AtendeIA#2026"
DEMO_EMAIL = "demo@atendeia.com"
DEMO_PASS = "Demo#2026forte"

INVALID_GROQ_KEY = "gsk_invalid_test_0000000000"


def _login(email, password):
    c = httpx.Client(base_url=API, timeout=30.0)
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.cookies.get("atende_session") or c.cookies.get("atende_session")
    c.cookies.clear()
    # Send session via Cookie header — bypasses Secure attribute over http.
    c.headers["Cookie"] = f"atende_session={token}"
    return c


@pytest.fixture(scope="module")
def admin_client():
    c = _login(ADMIN_EMAIL, ADMIN_PASS)
    # cleanup any prior test credentials
    try:
        for cred in c.get("/admin/ai/credentials").json():
            c.delete(f"/admin/ai/credentials/{cred['id']}")
    except Exception:
        pass
    yield c
    try:
        for cred in c.get("/admin/ai/credentials").json():
            c.delete(f"/admin/ai/credentials/{cred['id']}")
    except Exception:
        pass
    c.close()


@pytest.fixture(scope="module")
def demo_client():
    c = _login(DEMO_EMAIL, DEMO_PASS)
    yield c
    c.close()


# --- providers ---
def test_providers_endpoint_lists_groq(admin_client):
    r = admin_client.get("/admin/ai/providers")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body["supported"]) >= {"openai", "groq", "openrouter", "anthropic", "gemini"}
    assert isinstance(body["defaults"], dict)
    assert body["defaults"].get("groq")


# --- credentials list empty ---
def test_credentials_initially_empty(admin_client):
    r = admin_client.get("/admin/ai/credentials")
    assert r.status_code == 200
    assert r.json() == []


# --- test invalid key does not leak ---
def test_test_invalid_groq_key(admin_client):
    r = admin_client.post("/admin/ai/credentials/test",
                          json={"provider": "groq", "api_key": INVALID_GROQ_KEY})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert "Falha ao conectar" in body["message"]
    assert INVALID_GROQ_KEY not in r.text


# --- create credential ---
def test_create_credential_masked(admin_client):
    r = admin_client.put("/admin/ai/credentials", json={
        "provider": "groq", "name": "Principal",
        "api_key": INVALID_GROQ_KEY,
        "model": "llama-3.1-8b-instant", "active": True, "priority": 10,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert INVALID_GROQ_KEY not in r.text
    hint = body.get("key_hint", "")
    assert hint, "missing key_hint"
    assert hint.endswith(INVALID_GROQ_KEY[-4:]), f"hint {hint} should end with last-4"
    assert "•" in hint or "*" in hint, f"hint {hint} not masked"
    assert "api_key" not in body or not body.get("api_key")
    pytest.cred_id = body["id"]


def test_list_returns_masked_credential(admin_client):
    r = admin_client.get("/admin/ai/credentials")
    assert r.status_code == 200
    creds = r.json()
    assert len(creds) == 1
    assert INVALID_GROQ_KEY not in r.text
    assert creds[0]["provider"] == "groq"
    assert creds[0]["key_hint"].endswith(INVALID_GROQ_KEY[-4:])


def test_test_stored_credential_fails_safely(admin_client):
    cid = pytest.cred_id
    r = admin_client.post(f"/admin/ai/credentials/{cid}/test")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert INVALID_GROQ_KEY not in r.text


def test_ai_models_requires_active_valid_key(admin_client):
    r = admin_client.get("/admin/ai/models", params={"provider": "groq"})
    # Should not be 500; either 200 (returned curated fallback list) or 400 (unable to reach)
    assert r.status_code in (200, 400), f"got {r.status_code}: {r.text}"
    assert INVALID_GROQ_KEY not in r.text


# --- legacy provider endpoint accepts groq ---
def test_legacy_ai_provider_accepts_groq(admin_client):
    r = admin_client.put("/admin/ai-provider", json={
        "default_provider": "groq",
        "default_model": "llama-3.1-8b-instant",
        "fast_model": "llama-3.1-8b-instant",
        "complex_model": "llama-3.3-70b-versatile",
        "max_tokens": 1200, "temperature": 0.6, "monthly_call_limit": 0,
        "fallback_provider": "gemini", "fallback_model": "gemini-1.5-flash",
    })
    assert r.status_code == 200, f"{r.status_code}: {r.text}"


def test_legacy_ai_provider_get_returns_key_configured(admin_client):
    r = admin_client.get("/admin/ai-provider")
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    body = r.json()
    assert "key_configured" in body, f"missing key_configured: {body}"


def test_admin_health_ok(admin_client):
    r = admin_client.get("/admin/health")
    assert r.status_code == 200, f"{r.status_code}: {r.text}"



# --- audit log has event but no key ---
def test_audit_log_contains_save_event_no_key(admin_client):
    r = admin_client.get("/admin/audit-logs", params={"limit": 100})
    assert r.status_code == 200
    logs = r.json()
    actions = [l["action"] for l in logs]
    assert "admin.ai_credential_saved" in actions
    body_text = r.text
    assert "gsk_invalid_test_" not in body_text
    for l in logs:
        assert "gsk_invalid_test_" not in (l.get("detail") or "")


# --- delete credential ---
def test_delete_credential(admin_client):
    cid = pytest.cred_id
    r = admin_client.delete(f"/admin/ai/credentials/{cid}")
    assert r.status_code == 200
    r2 = admin_client.get("/admin/ai/credentials")
    assert r2.json() == []


def test_audit_log_contains_remove_event(admin_client):
    r = admin_client.get("/admin/audit-logs", params={"limit": 100})
    actions = [l["action"] for l in r.json()]
    assert "admin.ai_credential_removed" in actions
    assert "gsk_invalid_test_" not in r.text


# --- authz ---
def test_non_admin_forbidden_get(demo_client):
    r = demo_client.get("/admin/ai/credentials")
    assert r.status_code == 403


def test_non_admin_forbidden_put(demo_client):
    r = demo_client.put("/admin/ai/credentials", json={
        "provider": "groq", "api_key": "x", "name": "n",
    })
    assert r.status_code == 403


def test_unauthenticated_401():
    with httpx.Client(base_url=API, timeout=30.0) as c:
        assert c.get("/admin/ai/credentials").status_code == 401
        assert c.get("/admin/ai/providers").status_code == 401
        assert c.post("/admin/ai/credentials/test",
                      json={"provider": "groq", "api_key": "x"}).status_code == 401


# --- sandbox falls back to test mode ---
def test_sandbox_test_mode():
    c = _login(DEMO_EMAIL, DEMO_PASS)
    try:
        r2 = c.post("/sandbox/chat", json={"message": "Olá, tudo bem?"})
        assert r2.status_code == 200, r2.text
        body = r2.json()
        text = body.get("reply") or body.get("message") or ""
        prov = body.get("provider", "")
        assert prov == "test" or "[modo teste]" in text, f"expected test mode, got {body}"
    finally:
        c.close()


# --- security: search backend logs for the key ---
def test_backend_logs_no_key():
    import glob
    for path in glob.glob("/var/log/supervisor/backend.*.log"):
        with open(path, errors="ignore") as f:
            data = f.read()
        assert "gsk_invalid_test_" not in data, f"key leaked in {path}"
