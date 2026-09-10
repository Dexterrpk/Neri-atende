"""Atende IA — FastAPI entrypoint.

Every route lives on `api_router` (prefix /api); `app.include_router(api_router)`
is the last statement in this file.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from lib.db import client, db, ensure_indexes  # noqa: E402
from lib.security import IS_PRODUCTION, SECURITY_HEADERS, APP_SECRET  # noqa: E402
from routers import admin, auth, inbox, whatsapp_router, workspace  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if IS_PRODUCTION and APP_SECRET == "dev-only-insecure-secret-change-me":
        logger.error(
            "APP_SECRET is not configured in production. Set APP_SECRET in the environment. "
            "Refusing to start with the insecure default."
        )
        raise RuntimeError("APP_SECRET must be set in production")
    app.state.index_task = asyncio.create_task(ensure_indexes())
    yield
    client.close()


app = FastAPI(
    title="Atende IA",
    description="Seu atendente e vendedor inteligente no WhatsApp.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if os.environ.get("APP_ENV") == "production" else "/docs",
)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"name": "Atende IA", "status": "ok", "vendor": "Neri Infotech"}


@api_router.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "database": "ok"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "error"})


api_router.include_router(auth.router)
api_router.include_router(workspace.router)
api_router.include_router(inbox.router)
api_router.include_router(whatsapp_router.router)
api_router.include_router(admin.router)


# ---------- error handling: never leak a stack trace to the client ----------
@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Dados inválidos. Confira os campos preenchidos.", "fields": [
            {"field": ".".join(str(p) for p in e.get("loc", [])[1:]), "message": e.get("msg", "")}
            for e in exc.errors()[:10]
        ]},
    )


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Erro interno. Nossa equipe foi notificada."})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    return response


# CORS is restrictive by default: only the origins listed in CORS_ORIGINS.
# In production, "*" is refused when credentials are enabled — force explicit origins.
_origins_raw = os.environ.get("CORS_ORIGINS", "*")
_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]
_wildcard = _origins == ["*"]

if IS_PRODUCTION and _wildcard:
    logger.warning(
        "CORS_ORIGINS is '*' in production. Set CORS_ORIGINS to a comma-separated list of origins."
    )

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[] if _wildcard else _origins,
    allow_origin_regex=".*" if _wildcard else None,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(api_router)
