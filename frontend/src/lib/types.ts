// Hand-written mirrors of the Pydantic models in backend/models/schemas.py.
// Nothing infers across the Python boundary — keep both sides in sync in one edit.

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
export type Plan = "FREE" | "BASIC" | "PRO" | "PREMIUM";
export type ConversationStatus =
  | "novo"
  | "em_atendimento"
  | "aguardando_cliente"
  | "precisa_humano"
  | "resolvido";

export interface User {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: Role;
  is_platform_admin: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  segment: string;
  description: string;
  phone: string;
  address: string;
  business_hours: string;
  payment_methods: string;
  plan: Plan;
  active: boolean;
  onboarding_step: number;
  onboarding_done: boolean;
  created_at: string;
}

export interface Me {
  user: User;
  company: Company;
}

export interface Ok {
  ok: boolean;
  message: string;
}

export interface SessionInfo {
  id: string;
  created_at: string;
  last_seen_at: string;
  user_agent: string;
  current: boolean;
}

export interface AgentConfig {
  company_id: string;
  ai_name: string;
  personality: string;
  tone: string;
  formality: string;
  use_emojis: boolean;
  response_length: string;
  greeting: string;
  closing: string;
  custom_instructions: string;
  service_rules: string;
  sales_rules: string;
  discount_policy: string;
  handoff_rules: string;
  out_of_hours_message: string;
  goal: string;
  enable_sales: boolean;
  enable_scheduling: boolean;
  enable_recovery: boolean;
  updated_at: string;
}

export interface KnowledgeItem {
  id: string;
  company_id: string;
  kind: string;
  title: string;
  content: string;
  active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  description: string;
  price: number;
  promo_price: number | null;
  category: string;
  image_url: string;
  availability: string;
  extra_info: string;
  kind: string;
  active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  origin: string;
  status: string;
  notes: string;
  last_interaction_at: string | null;
  last_purchase_at: string | null;
  last_purchase_value: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  company_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: ConversationStatus;
  intent: string;
  opportunity: boolean;
  assignee: string;
  channel: string;
  tags: string[];
  priority: string;
  last_message: string;
  last_message_at: string;
  ai_paused: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  company_id: string;
  conversation_id: string;
  role: string;
  author: string;
  content: string;
  external_id: string | null;
  direction: string;
  delivery_status: string;
  delivery_error: string;
  created_at: string;
}

export interface SandboxConfigUsed {
  ai_name: string;
  tone: string;
  formality: string;
  response_length: string;
  use_emojis: boolean;
  sales_enabled: boolean;
  scheduling_enabled: boolean;
  products_count: number;
  knowledge_count: number;
  company_name: string;
}

export interface SandboxReply {
  reply: string;
  provider: string;
  model: string;
  needs_human: boolean;
  config_used: SandboxConfigUsed;
}

export interface RecoveryRules {
  company_id: string;
  inactive_days: number;
  send_window_start: string;
  send_window_end: string;
  daily_limit: number;
  interval_minutes: number;
  max_attempts: number;
  require_approval: boolean;
  updated_at: string;
}

export interface RecoveryTarget {
  customer_id: string;
  name: string;
  phone: string;
  last_interaction_at: string | null;
  last_purchase_at: string | null;
  last_purchase_value: number;
  days_inactive: number;
  opportunity: string;
}

export interface RecoveryDraft {
  customer_id: string;
  message: string;
  provider: string;
  model: string;
}

export interface WhatsAppStatus {
  connected: boolean;
  mode: string;
  phone_number: string;
  display_name: string;
  last_sync_at: string | null;
  last_error: string;
  webhook_url: string;
  token_configured: boolean;
  web_status: string;
  web_qr: string;
  web_pairing_code: string;
  web_last_error: string;
  missing: string[];
}

export interface Dashboard {
  conversations_today: number;
  customers_served: number;
  opportunities: number;
  recovered_sales: number;
  appointments: number;
  ai_status: "ok" | "needs_config";
  pending_items: string[];
  checklist: Record<string, boolean>;
}

export interface Appointment {
  id: string;
  company_id: string;
  customer_name: string;
  customer_phone: string;
  service: string;
  starts_at: string;
  duration_minutes: number;
  professional: string;
  status: string;
  created_at: string;
}

export interface Usage {
  ai_calls_month: number;
  messages_month: number;
  customers: number;
  conversations: number;
  plan: Plan;
  limits: Record<string, number>;
}

export interface CompanyAuditEntry {
  id: string;
  action: string;
  detail: string;
  user_email: string;
  ip: string;
  created_at: string;
}

// ---------- admin ----------
export interface AdminOverview {
  companies: number;
  users: number;
  conversations: number;
  messages: number;
  ai_calls: number;
  plans: Record<string, number>;
}

export interface AdminCompany {
  id: string;
  name: string;
  plan: Plan;
  active: boolean;
  users: number;
  conversations: number;
  ai_calls: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  company: string;
  active: boolean;
  is_platform_admin: boolean;
  created_at: string;
}

export interface PlatformSetting {
  key: string;
  label: string;
  group: string;
  configured: boolean;
  hint: string;
  updated_at: string | null;
}

export interface AiProviderConfig {
  default_provider: string;
  default_model: string;
  fast_model: string;
  complex_model: string;
  max_tokens: number;
  temperature: number;
  monthly_call_limit: number;
  fallback_provider: string;
  fallback_model: string;
  key_configured: boolean;
  updated_at: string | null;
}

export interface ConnectionTest {
  ok: boolean;
  checks: { label: string; ok: boolean }[];
  message: string;
}

export interface HealthItem {
  key: string;
  label: string;
  status: "ok" | "warn" | "error" | "not_configured";
  detail: string;
}

export interface HealthReport {
  items: HealthItem[];
}

export interface AuditEntry {
  id: string;
  company_id: string | null;
  company_name: string;
  user_email: string;
  action: string;
  detail: string;
  ip: string;
  created_at: string;
}
