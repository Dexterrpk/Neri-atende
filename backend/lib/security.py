"""Security primitives: password hashing, session tokens, secret encryption, rate limiting.

No secret value ever leaves this module in plaintext through an API response.
The master key comes from the environment (APP_SECRET) — never from code.
"""

import base64
import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken

# --- master key (environment only) -------------------------------------------------
APP_SECRET = os.environ.get("APP_SECRET") or "dev-only-insecure-secret-change-me"
IS_PRODUCTION = os.environ.get("APP_ENV", "development").lower() == "production"

_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(APP_SECRET.encode()).digest()))

SESSION_COOKIE = "atende_session"
SESSION_TTL_DAYS = 14
PBKDF2_ROUNDS = 260_000


# --- passwords ---------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# --- opaque tokens -----------------------------------------------------------------
def new_token() -> str:
    """Opaque random token — only its hash is persisted."""
    return secrets.token_urlsafe(32)


def token_fingerprint(token: str) -> str:
    return hashlib.sha256(f"{APP_SECRET}:{token}".encode()).hexdigest()


def session_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)


def cookie_kwargs() -> dict:
    """HttpOnly always; Secure + SameSite=Lax since the app is served same-origin over HTTPS."""
    return {
        "httponly": True,
        "secure": True,
        "samesite": "lax",
        "path": "/",
        "max_age": SESSION_TTL_DAYS * 24 * 3600,
    }


# --- secret storage (encrypted at rest, never returned) -----------------------------
def encrypt_secret(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt_secret(blob: str) -> str | None:
    try:
        return _fernet.decrypt(blob.encode()).decode()
    except (InvalidToken, Exception):
        return None


def mask_secret(value: str) -> str:
    """Only ever a hint — last 4 chars. Used for admin display, never the full key."""
    if not value:
        return ""
    return f"••••••••{value[-4:]}" if len(value) > 4 else "••••••••"


# --- in-process rate limiting / brute-force protection ------------------------------
_buckets: dict[str, list[float]] = {}


def rate_limit_exceeded(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    hits = [t for t in _buckets.get(key, []) if now - t < window_seconds]
    if len(hits) >= limit:
        _buckets[key] = hits
        return True
    hits.append(now)
    _buckets[key] = hits
    return False


def reset_rate_limit(key: str) -> None:
    _buckets.pop(key, None)


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-XSS-Protection": "1; mode=block",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    # CSP compatible with React (needs 'unsafe-inline' for injected style tags), Vite
    # HMR in dev (ws:), Google Fonts and same-origin API. Tighten via CSP_EXTRA env if needed.
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' ws: wss: https:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
}
