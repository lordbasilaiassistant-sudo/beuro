// ============================================================
// Beuro — SHARED API CONTRACT & TYPES
// Every agent MUST import types from this file.
// Do not redefine these shapes elsewhere.
// ============================================================

export type BotStatus = "idle" | "working" | "waiting_approval";
export type MessageRole = "user" | "bot";
export type ApprovalStatus = "none" | "pending" | "approved" | "rejected";
export type ActivityKind = "think" | "signin" | "tool" | "read" | "write" | "done";
export type ConnectionType = "api_key" | "webhook" | "email" | "database" | "custom";

/** The signed-in account owner (never includes the password hash). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  company: string;
  createdAt: string;
}

/** A tool/account the user connected so bots can work with it. */
export interface Connection {
  id: string;
  userId: string;
  name: string;
  type: ConnectionType;
  /** Value is masked for secrets — the raw value never leaves the server. */
  maskedValue: string;
  notes: string;
  createdAt: string;
}

/** Something the user can open to check a Bot's work. */
export interface Evidence {
  kind: "url" | "file";
  label: string;
  href: string;
}

/**
 * One line in the bot's "Computer" activity feed.
 *
 * `verified` is the honesty flag and the UI MUST respect it:
 *   true  — this step is a record of an action that really executed. Its text
 *           came from the tool's own result, not from the model, and `evidence`
 *           points at what produced it.
 *   false/absent — narrated. The model said this happened; nothing checked it.
 *
 * Never set `verified: true` on a step the server did not actually perform.
 */
export interface ActivityStep {
  kind: ActivityKind;
  text: string;
  evidence?: Evidence[];
  verified?: boolean;
}

export interface Memory {
  id: string;
  botId: string;
  content: string;
  source: string; // "chat" | "teaching" | "seed"
  createdAt: string; // ISO
}

export interface Routine {
  id: string;
  botId: string;
  title: string;
  schedule: string; // human readable, e.g. "Every weekday at 8:30 AM"
  steps: string[];
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

export interface Bot {
  id: string;
  name: string;
  role: string;
  emoji: string;
  persona: string;
  status: BotStatus;
  memories: Memory[];
  routines: Routine[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  botId: string | null;
  content: string;
  activity: ActivityStep[];
  needsApproval: boolean;
  approvalStatus: ApprovalStatus;
  approvalNote: string;
  createdAt: string;
}

export interface Thread {
  id: string;
  title: string;
  isGroup: boolean;
  botIds: string[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/** GET /api/state → returns everything owned by the signed-in user. */
export interface AppState {
  bots: Bot[];
  threads: Thread[];
  connections: Connection[];
}

// ---------- Request bodies ----------

/** POST /api/auth/signup */
export interface SignupInput {
  email: string;
  name: string;
  password: string;
  company?: string;
}

/** POST /api/auth/login */
export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
}

/** GET /api/auth/me when signed out */
export interface MeResponse {
  user: AuthUser | null;
}

/** POST /api/connections */
export interface CreateConnectionInput {
  name: string;
  type: ConnectionType;
  value?: string;
  notes?: string;
}

/** POST /api/bots */
export interface CreateBotInput {
  name: string;
  role: string;
  emoji?: string;
  persona?: string;
}

/** POST /api/threads — 1 bot = DM thread, 2+ bots = group chat */
export interface CreateThreadInput {
  botIds: string[];
  title?: string;
}

/** POST /api/chat — send a user message */
export interface SendChatInput {
  threadId: string;
  content: string;
}

/** POST /api/chat — approve/reject a pending message (discriminated by `decision`) */
export interface ApprovalInput {
  threadId: string;
  messageId: string;
  decision: "approved" | "rejected";
}

export type ChatInput = SendChatInput | ApprovalInput;

/** POST /api/routines — LLM turns a description into title/schedule/steps */
export interface CreateRoutineInput {
  botId: string;
  description: string;
}

/** PATCH /api/routines — enable/disable */
export interface ToggleRoutineInput {
  id: string;
  enabled: boolean;
}

/** POST /api/routines/run — bot runs a routine now and reports back in its DM thread */
export interface RunRoutineInput {
  routineId: string;
}

// ---------- Response bodies ----------

export interface CreateBotResponse {
  bot: Bot;
}

export interface CreateThreadResponse {
  thread: Thread;
}

export interface ConnectionResponse {
  connection: Connection;
}

export interface ConnectionsResponse {
  connections: Connection[];
}

export interface ChatResponse {
  messages: ChatMessage[]; // bot reply(ies) with activity; may include follow-ups
}

export interface RoutineResponse {
  routine: Routine;
}

export interface OkResponse {
  ok: true;
}

export interface ErrorResponse {
  error: string;
}
