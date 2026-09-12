"""Pydantic v2 request/response models. Each one has a hand-written TS mirror in
frontend/src/lib/types.ts — keep the pair in sync in the same edit."""

import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"]
ConversationStatus = Literal["novo", "em_atendimento", "aguardando_cliente", "precisa_humano", "resolvido"]
Plan = Literal["FREE", "BASIC", "PRO", "PREMIUM"]


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- auth ----------
class RegisterInput(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str = Field(min_length=10)
    password: str = Field(min_length=8, max_length=200)


class ChangePasswordInput(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=200)


class UserOut(BaseModel):
    id: str
    company_id: str
    name: str
    email: str
    role: Role
    is_platform_admin: bool = False
    email_verified: bool = False
    created_at: datetime


class CompanyOut(BaseModel):
    id: str
    name: str
    segment: str = ""
    description: str = ""
    phone: str = ""
    address: str = ""
    business_hours: str = ""
    payment_methods: str = ""
    plan: Plan = "FREE"
    active: bool = True
    onboarding_step: int = 0
    onboarding_done: bool = False
    created_at: datetime


class MeOut(BaseModel):
    user: UserOut
    company: CompanyOut


class SessionOut(BaseModel):
    id: str
    created_at: datetime
    last_seen_at: datetime
    user_agent: str = ""
    current: bool = False


class OkOut(BaseModel):
    ok: bool = True
    message: str = ""


# ---------- company / onboarding ----------
class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    segment: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=300)
    business_hours: str | None = Field(default=None, max_length=500)
    payment_methods: str | None = Field(default=None, max_length=500)


class OnboardingStepInput(BaseModel):
    step: int = Field(ge=0, le=8)
    done: bool = False


# ---------- agent config ----------
class AgentConfig(BaseModel):
    company_id: str
    ai_name: str = "Ana"
    personality: str = "consultiva"
    tone: str = "amigavel"
    formality: str = "informal"
    use_emojis: bool = True
    response_length: str = "medio"
    greeting: str = "Olá! Tudo bem? Como podemos te ajudar hoje?"
    closing: str = "Qualquer coisa é só chamar. Tenha um ótimo dia!"
    custom_instructions: str = ""
    service_rules: str = ""
    sales_rules: str = ""
    discount_policy: str = ""
    handoff_rules: str = "Quando o cliente pedir para falar com uma pessoa, reclamar de um problema grave ou pedir algo que eu não tenho informação."
    out_of_hours_message: str = "Estamos fora do horário de atendimento, mas já registrei sua mensagem e retornamos em breve."
    goal: str = "atender_e_vender"
    enable_sales: bool = True
    enable_scheduling: bool = False
    enable_recovery: bool = True
    updated_at: datetime = Field(default_factory=_now)


class AgentConfigUpdate(BaseModel):
    ai_name: str | None = Field(default=None, min_length=1, max_length=60)
    personality: str | None = Field(default=None, max_length=60)
    tone: str | None = Field(default=None, max_length=60)
    formality: str | None = Field(default=None, max_length=60)
    use_emojis: bool | None = None
    response_length: str | None = Field(default=None, max_length=30)
    greeting: str | None = Field(default=None, max_length=600)
    closing: str | None = Field(default=None, max_length=600)
    custom_instructions: str | None = Field(default=None, max_length=6000)
    service_rules: str | None = Field(default=None, max_length=4000)
    sales_rules: str | None = Field(default=None, max_length=4000)
    discount_policy: str | None = Field(default=None, max_length=2000)
    handoff_rules: str | None = Field(default=None, max_length=2000)
    out_of_hours_message: str | None = Field(default=None, max_length=1000)
    goal: str | None = Field(default=None, max_length=60)
    enable_sales: bool | None = None
    enable_scheduling: bool | None = None
    enable_recovery: bool | None = None


# ---------- knowledge ----------
class KnowledgeItem(BaseModel):
    id: str = Field(default_factory=_id)
    company_id: str
    kind: str = "informacao"  # informacao | faq | politica | horario | endereco | pagamento
    title: str
    content: str
    active: bool = True
    created_at: datetime = Field(default_factory=_now)


class KnowledgeInput(BaseModel):
    kind: str = Field(default="informacao", max_length=40)
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=1, max_length=20000)
    active: bool = True


# ---------- products ----------
class Product(BaseModel):
    id: str = Field(default_factory=_id)
    company_id: str
    name: str
    description: str = ""
    price: float = 0
    promo_price: float | None = None
    category: str = ""
    image_url: str = ""
    availability: str = "disponivel"
    extra_info: str = ""
    kind: str = "produto"  # produto | servico
    active: bool = True
    created_at: datetime = Field(default_factory=_now)


class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    price: float = Field(default=0, ge=0, le=10_000_000)
    promo_price: float | None = Field(default=None, ge=0, le=10_000_000)
    category: str = Field(default="", max_length=80)
    image_url: str = Field(default="", max_length=1000)
    availability: str = Field(default="disponivel", max_length=40)
    extra_info: str = Field(default="", max_length=2000)
    kind: str = Field(default="produto", max_length=20)
    active: bool = True


# ---------- customers ----------
class Customer(BaseModel):
    id: str = Field(default_factory=_id)
    company_id: str
    name: str
    phone: str
    email: str = ""
    tags: list[str] = Field(default_factory=list)
    origin: str = "manual"
    status: str = "ativo"
    notes: str = ""
    last_interaction_at: datetime | None = None
    last_purchase_at: datetime | None = None
    last_purchase_value: float = 0
    created_at: datetime = Field(default_factory=_now)


class CustomerInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str = Field(min_length=8, max_length=25)
    email: str = Field(default="", max_length=200)
    tags: list[str] = Field(default_factory=list)
    notes: str = Field(default="", max_length=2000)
    last_purchase_value: float = Field(default=0, ge=0)


# ---------- conversations ----------
class Conversation(BaseModel):
    id: str = Field(default_factory=_id)
    company_id: str
    customer_id: str
    customer_name: str
    customer_phone: str
    status: ConversationStatus = "novo"
    intent: str = ""
    opportunity: bool = False
    assignee: str = "IA"
    channel: str = "whatsapp"
    tags: list[str] = Field(default_factory=list)
    priority: str = "normal"
    last_message: str = ""
    last_message_at: datetime = Field(default_factory=_now)
    ai_paused: bool = False
    created_at: datetime = Field(default_factory=_now)


class Message(BaseModel):
    id: str = Field(default_factory=_id)
    company_id: str
    conversation_id: str
    role: str  # customer | ai | human
    author: str = ""
    content: str
    external_id: str | None = None
    direction: str = "outgoing"
    delivery_status: str = "recorded"
    delivery_error: str = ""
    created_at: datetime = Field(default_factory=_now)


class SendMessageInput(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ConversationStatusInput(BaseModel):
    status: ConversationStatus


class TakeoverInput(BaseModel):
    take: bool = True


# ---------- sandbox ----------
class SandboxInput(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict] = Field(default_factory=list, max_length=40)


class SandboxOut(BaseModel):
    reply: str
    provider: str
    model: str
    needs_human: bool = False
    config_used: dict


# ---------- recovery ----------
class RecoveryRules(BaseModel):
    company_id: str
    inactive_days: int = 30
    send_window_start: str = "09:00"
    send_window_end: str = "18:00"
    daily_limit: int = 30
    interval_minutes: int = 5
    max_attempts: int = 3
    require_approval: bool = True
    updated_at: datetime = Field(default_factory=_now)


class RecoveryRulesUpdate(BaseModel):
    inactive_days: int | None = Field(default=None, ge=1, le=3650)
    send_window_start: str | None = Field(default=None, max_length=5)
    send_window_end: str | None = Field(default=None, max_length=5)
    daily_limit: int | None = Field(default=None, ge=1, le=1000)
    interval_minutes: int | None = Field(default=None, ge=1, le=1440)
    max_attempts: int | None = Field(default=None, ge=1, le=20)
    require_approval: bool | None = None


class RecoveryTarget(BaseModel):
    customer_id: str
    name: str
    phone: str
    last_interaction_at: datetime | None = None
    last_purchase_at: datetime | None = None
    last_purchase_value: float = 0
    days_inactive: int = 0
    opportunity: str = "media"


class RecoveryDraftOut(BaseModel):
    customer_id: str
    message: str
    provider: str
    model: str


# ---------- whatsapp / integrations ----------
class WhatsAppStatusOut(BaseModel):
    connected: bool
    mode: str  # official | test
    phone_number: str = ""
    display_name: str = ""
    last_sync_at: datetime | None = None
    last_error: str = ""
    webhook_url: str = ""
    token_configured: bool = False
    web_status: str = "disconnected"
    web_qr: str = ""
    web_pairing_code: str = ""
    web_last_error: str = ""
    missing: list[str] = Field(default_factory=list)


class WhatsAppConnectInput(BaseModel):
    mode: str = Field(default="test", max_length=20)
    phone_number: str = Field(default="", max_length=25)
    display_name: str = Field(default="", max_length=120)
    phone_number_id: str = Field(default="", max_length=120)
    access_token: str = Field(default="", max_length=500)
    verify_token: str = Field(default="", max_length=200)


# ---------- dashboard ----------
class DashboardOut(BaseModel):
    conversations_today: int
    customers_served: int
    opportunities: int
    recovered_sales: int
    appointments: int
    ai_status: str  # ok | needs_config
    pending_items: list[str]
    checklist: dict[str, bool]


# ---------- appointments ----------
class Appointment(BaseModel):
    id: str = Field(default_factory=_id)
    company_id: str
    customer_name: str
    customer_phone: str = ""
    service: str = ""
    starts_at: datetime
    duration_minutes: int = 60
    professional: str = ""
    status: str = "confirmado"
    created_at: datetime = Field(default_factory=_now)


class AppointmentInput(BaseModel):
    customer_name: str = Field(min_length=1, max_length=160)
    customer_phone: str = Field(default="", max_length=25)
    service: str = Field(default="", max_length=160)
    starts_at: datetime
    duration_minutes: int = Field(default=60, ge=5, le=1440)
    professional: str = Field(default="", max_length=120)


# ---------- team ----------
class InviteUserInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    role: Role = "AGENT"


class RoleUpdateInput(BaseModel):
    role: Role


# ---------- audit ----------
class AuditLogOut(BaseModel):
    id: str
    company_id: str | None = None
    company_name: str = ""
    user_email: str = ""
    action: str
    detail: str = ""
    ip: str = ""
    created_at: datetime


# ---------- admin ----------
class AdminOverviewOut(BaseModel):
    companies: int
    users: int
    conversations: int
    messages: int
    ai_calls: int
    plans: dict[str, int]


class AdminCompanyOut(BaseModel):
    id: str
    name: str
    plan: Plan
    active: bool
    users: int
    conversations: int
    ai_calls: int
    created_at: datetime


class AdminCompanyUpdate(BaseModel):
    plan: Plan | None = None
    active: bool | None = None


class PlatformSettingOut(BaseModel):
    key: str
    label: str
    group: str
    configured: bool
    hint: str = ""
    updated_at: datetime | None = None


class PlatformSettingInput(BaseModel):
    key: str = Field(min_length=2, max_length=80)
    value: str = Field(min_length=1, max_length=2000)


class AiProviderConfigOut(BaseModel):
    default_provider: str
    default_model: str
    fast_model: str
    complex_model: str
    max_tokens: int
    temperature: float
    monthly_call_limit: int
    fallback_provider: str
    fallback_model: str
    key_configured: bool
    updated_at: datetime | None = None


class AiProviderConfigInput(BaseModel):
    default_provider: str = Field(max_length=40)
    default_model: str = Field(max_length=80)
    fast_model: str = Field(max_length=80)
    complex_model: str = Field(max_length=80)
    max_tokens: int = Field(ge=64, le=32000)
    temperature: float = Field(ge=0, le=2)
    monthly_call_limit: int = Field(ge=0, le=10_000_000)
    fallback_provider: str = Field(default="", max_length=40)
    fallback_model: str = Field(default="", max_length=80)


class ConnectionTestOut(BaseModel):
    ok: bool
    checks: list[dict]
    message: str


class HealthItemOut(BaseModel):
    key: str
    label: str
    status: str  # ok | warn | error | not_configured
    detail: str = ""


class HealthOut(BaseModel):
    items: list[HealthItemOut]


class UsageOut(BaseModel):
    ai_calls_month: int
    messages_month: int
    customers: int
    conversations: int
    plan: Plan
    limits: dict[str, int]
