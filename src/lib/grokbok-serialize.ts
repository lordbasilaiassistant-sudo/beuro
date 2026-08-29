// ============================================================
// GrokBok clone — Prisma row → contract type mappers
// All dates become ISO strings; JSON string columns are parsed safely.
// ============================================================

import type {
  ApprovalStatus,
  Bot,
  BotStatus,
  ChatMessage,
  Memory,
  MessageRole,
  Routine,
  Thread,
} from '@/lib/grokbok-types'
import { parseActivity } from '@/lib/grokbok-llm'
import type {
  Bot as BotRow,
  Memory as MemoryRow,
  Message as MessageRow,
  Routine as RoutineRow,
  Thread as ThreadRow,
} from '@prisma/client'

export type BotWithRelations = BotRow & {
  memories: MemoryRow[]
  routines: RoutineRow[]
}
export type ThreadWithMessages = ThreadRow & { messages: MessageRow[] }

const BOT_STATUSES: readonly string[] = ['idle', 'working', 'waiting_approval']
const APPROVAL_STATUSES: readonly string[] = ['none', 'pending', 'approved', 'rejected']

/** Parse a JSON-string column into an array; returns [] on any failure. */
export function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    botId: row.botId,
    content: row.content,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    botId: row.botId,
    title: row.title,
    schedule: row.schedule,
    steps: parseJsonArray<string>(row.steps),
    enabled: row.enabled,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toMessage(row: MessageRow): ChatMessage {
  const role: MessageRole = row.role === 'user' ? 'user' : 'bot'
  const approvalStatus: ApprovalStatus = APPROVAL_STATUSES.includes(row.approvalStatus)
    ? (row.approvalStatus as ApprovalStatus)
    : 'none'

  return {
    id: row.id,
    threadId: row.threadId,
    role,
    botId: row.botId,
    content: row.content,
    activity: parseActivity(parseJsonArray<unknown>(row.activity)),
    needsApproval: row.needsApproval,
    approvalStatus,
    approvalNote: row.approvalNote,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toBot(row: BotWithRelations): Bot {
  const status: BotStatus = BOT_STATUSES.includes(row.status) ? (row.status as BotStatus) : 'idle'

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    emoji: row.emoji,
    persona: row.persona,
    status,
    memories: [...row.memories]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toMemory),
    routines: [...row.routines]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toRoutine),
    createdAt: row.createdAt.toISOString(),
  }
}

export function toThread(row: ThreadWithMessages): Thread {
  return {
    id: row.id,
    title: row.title,
    isGroup: row.isGroup,
    botIds: parseJsonArray<string>(row.botIds),
    messages: [...row.messages]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toMessage),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
