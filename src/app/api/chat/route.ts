// ============================================================
// GrokBok clone — POST /api/chat
// Body is a SendChatInput (new user message → bot replies with activity)
// or an ApprovalInput (approve/reject a pending message → follow-up).
// Discriminated by the presence of `decision`.
// All LLM failures fall back to canned responses — this route never 500s
// because of the model.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { callLLM, extractJson, parseActivity, parseMemoryUpdates } from '@/lib/grokbok-llm'
import { parseJsonArray, toMessage } from '@/lib/grokbok-serialize'
import type { ActivityStep } from '@/lib/grokbok-types'

export const runtime = 'nodejs'

// ---------- LLM output shapes ----------

interface LLMEntry {
  botId?: unknown
  activity?: unknown
  reply?: unknown
  memoryUpdates?: unknown
  needsApproval?: unknown
  approvalNote?: unknown
}

interface BotContext {
  id: string
  name: string
  role: string
  persona: string
  memories: string[]
}

interface NormalizedReply {
  botId: string
  activity: ActivityStep[]
  reply: string
  memoryUpdates: string[]
  needsApproval: boolean
  approvalNote: string
}

// ---------- canned fallbacks (LLM outage ≠ broken UX) ----------

const FALLBACK_REPLY = "On it — I'll take this from here and report back."
const FALLBACK_ACTIVITY: ActivityStep[] = [
  { kind: 'signin', text: 'Signing in to the workspace…' },
  { kind: 'read', text: 'Reading the latest context…' },
  { kind: 'think', text: 'Planning the next moves…' },
  { kind: 'write', text: 'Drafting the deliverable…' },
  { kind: 'done', text: 'Step complete — reporting back.' },
]

const APPROVED_FALLBACK = {
  activity: [
    { kind: 'tool', text: 'Sending the approved work…' },
    { kind: 'write', text: 'Logging the results…' },
    { kind: 'done', text: 'Done — all sent.' },
  ] as ActivityStep[],
  reply: "Done — approved and executed. Everything went out and it's all logged; I'll flag anything unusual.",
}

const REJECTED_FALLBACK = {
  activity: [
    { kind: 'think', text: 'Parking the queued work…' },
    { kind: 'done', text: 'Nothing sent — task parked.' },
  ] as ActivityStep[],
  reply: 'Understood — parked it. Nothing went out.',
}

// ---------- prompt builders ----------

function botSystemPrompt(bot: BotContext, teammates?: { name: string; role: string }[]): string {
  const memoryText = bot.memories.length ? bot.memories.join(' | ') : 'none yet'
  let prompt =
    `You are ${bot.name}, a ${bot.role} AI teammate in GrokBok. Persona: ${bot.persona}. ` +
    `Your memories: ${memoryText}. ` +
    `You have your own cloud computer, can sign into the user's tools, and work end-to-end. ` +
    `You reply like a competent colleague: concise, specific, friendly. Never mention you are an LLM.`
  if (teammates && teammates.length > 0) {
    prompt +=
      ` You are in a group chat with teammates: ${teammates
        .map((t) => `${t.name} (${t.role})`)
        .join(', ')}. ` +
      'Hand work to the right specialist in sequence instead of doing everything yourself.'
  }
  return prompt
}

function groupSystemPrompt(bots: BotContext[]): string {
  const roster = bots
    .map((b) => {
      const memoryText = b.memories.length ? b.memories.join(' | ') : 'none yet'
      return `- ${b.name} (botId: ${b.id}, role: ${b.role}) — persona: ${b.persona} — memories: ${memoryText}`
    })
    .join('\n')
  return (
    'You operate a team of AI teammates in GrokBok. Every bot has its own cloud computer, signs into the user\'s tools, and works end-to-end. ' +
    'Each bot replies like a competent colleague: concise, specific, friendly. Never mention LLMs.\n' +
    `Team roster:\n${roster}\n` +
    'In group chats the bots coordinate and hand work to each other sequentially, like colleagues in one room.'
  )
}

// ---------- entry point ----------

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null)
    if (body === null || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const payload = body as Record<string, unknown>

    if (payload.decision !== undefined && payload.decision !== null) {
      return handleApproval(payload)
    }
    return handleSend(payload)
  } catch (error) {
    console.error('[api/chat] POST failed:', error)
    return NextResponse.json({ error: 'Chat request failed' }, { status: 500 })
  }
}

// ---------- Send flow ----------

async function handleSend(payload: Record<string, unknown>) {
  const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : ''
  const content = typeof payload.content === 'string' ? payload.content.trim() : ''
  if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const thread = await db.thread.findUnique({
    where: { id: threadId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const botIds = parseJsonArray<string>(thread.botIds).filter((id) => id.length > 0)
  if (botIds.length === 0) {
    return NextResponse.json({ error: 'Thread has no members' }, { status: 400 })
  }

  const botRows = await db.bot.findMany({
    where: { id: { in: botIds } },
    include: { memories: { orderBy: { createdAt: 'desc' }, take: 8 } },
  })
  const botsById = new Map(botRows.map((b) => [b.id, b]))
  const orderedBots: BotContext[] = botIds
    .map((id) => botsById.get(id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .map((b) => ({ id: b.id, name: b.name, role: b.role, persona: b.persona, memories: b.memories.map((m) => m.content) }))
  if (orderedBots.length === 0) {
    return NextResponse.json({ error: 'Thread members no longer exist' }, { status: 400 })
  }

  // 1. Save the user message.
  const now = Date.now()
  await db.message.create({
    data: { threadId: thread.id, role: 'user', botId: null, content, createdAt: new Date(now) },
  })

  // 2. All member bots are now working.
  await db.bot.updateMany({ where: { id: { in: botIds } }, data: { status: 'working' } })

  // 3. Build the prompt (recent history, labeled) and get replies.
  const botsForLabels = new Map(botRows.map((b) => [b.id, b.name]))
  const historyText = thread.messages
    .slice(-10)
    .map((m) =>
      m.role === 'user'
        ? `User: ${m.content}`
        : `${m.botId ? (botsForLabels.get(m.botId) ?? 'Teammate') : 'Teammate'}: ${m.content}`,
    )
    .join('\n')

  const isGroupTurn = thread.isGroup && orderedBots.length > 1
  const replies = isGroupTurn
    ? await groupTurn(orderedBots, historyText, content)
    : [await dmTurn(orderedBots[0], historyText, content)]

  // 4. Persist bot messages (in reply order) + memories.
  const savedRows = []
  for (let i = 0; i < replies.length; i++) {
    const reply = replies[i]
    const row = await db.message.create({
      data: {
        threadId: thread.id,
        role: 'bot',
        botId: reply.botId,
        content: reply.reply,
        activity: JSON.stringify(reply.activity),
        needsApproval: reply.needsApproval,
        approvalStatus: reply.needsApproval ? 'pending' : 'none',
        approvalNote: reply.approvalNote,
        createdAt: new Date(now + (i + 1) * 10),
      },
    })
    savedRows.push(row)

    for (const memory of reply.memoryUpdates) {
      await db.memory.create({ data: { botId: reply.botId, content: memory, source: 'chat' } })
    }
  }

  // 5. Statuses: everyone idle again; approval-requesting bots wait.
  await db.bot.updateMany({ where: { id: { in: botIds } }, data: { status: 'idle' } })
  for (const reply of replies) {
    if (reply.needsApproval) {
      await db.bot.update({ where: { id: reply.botId }, data: { status: 'waiting_approval' } })
    }
  }

  await db.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } })

  return NextResponse.json({ messages: savedRows.map(toMessage) })
}

function normalizeEntry(entry: LLMEntry, validBotIds: Set<string>, defaultBotId: string): NormalizedReply {
  const botIdRaw = typeof entry.botId === 'string' ? entry.botId : ''
  const botId = botIdRaw && validBotIds.has(botIdRaw) ? botIdRaw : defaultBotId
  const activity = parseActivity(entry.activity)
  const reply =
    typeof entry.reply === 'string' && entry.reply.trim() ? entry.reply.trim() : FALLBACK_REPLY

  return {
    botId,
    activity: activity.length > 0 ? activity : FALLBACK_ACTIVITY,
    reply,
    memoryUpdates: parseMemoryUpdates(entry.memoryUpdates),
    needsApproval: entry.needsApproval === true,
    approvalNote:
      typeof entry.approvalNote === 'string' ? entry.approvalNote.trim().slice(0, 300) : '',
  }
}

function fallbackEntry(botId: string): NormalizedReply {
  return {
    botId,
    activity: FALLBACK_ACTIVITY,
    reply: FALLBACK_REPLY,
    memoryUpdates: [],
    needsApproval: false,
    approvalNote: '',
  }
}

async function dmTurn(bot: BotContext, historyText: string, content: string): Promise<NormalizedReply> {
  const system = botSystemPrompt(bot)
  const history = historyText ? `${historyText}\n\n` : ''
  const user = `${history}The user just said: ${content}

Respond with STRICT JSON only — no markdown, no commentary — exactly this shape:
{"activity":[{"kind":"signin","text":"..."}],"reply":"...","memoryUpdates":[],"needsApproval":false,"approvalNote":""}
Rules:
- "activity": 4-7 short steps of the work you are doing right now on your own cloud computer. Be concrete and reference real tool names like Gmail, Zendesk, Notion, Slack, CRM.
- "reply": your answer in a competent teammate voice, 1-4 sentences, referencing the concrete work.
- "memoryUpdates": 0-3 short durable facts worth remembering about the user, accounts, or preferences (empty array if none).
- "needsApproval": true ONLY if the user must sign off before you send, spend, or publish anything.
- "approvalNote": one short line describing the pending action (empty string when needsApproval is false).`

  try {
    const raw = await callLLM(system, user)
    const parsed = extractJson<LLMEntry>(raw)
    return normalizeEntry(parsed, new Set([bot.id]), bot.id)
  } catch (error) {
    console.error(`[api/chat] DM turn LLM failed for ${bot.name}, using fallback:`, error)
    return fallbackEntry(bot.id)
  }
}

async function groupTurn(bots: BotContext[], historyText: string, content: string): Promise<NormalizedReply[]> {
  const system = groupSystemPrompt(bots)
  const history = historyText ? `${historyText}\n\n` : ''
  const user = `${history}The user just said: ${content}

Respond with STRICT JSON only — no markdown, no commentary — exactly this shape:
{"replies":[{"botId":"...","activity":[{"kind":"signin","text":"..."}],"reply":"...","memoryUpdates":[],"needsApproval":false,"approvalNote":""}]}
Rules:
- "replies": 1-3 entries in logical hand-off order (e.g. the coordinator triages first, then a specialist picks up the work). Each "botId" must be one of: ${bots
    .map((b) => `"${b.id}" (${b.name})`)
    .join(', ')}.
- Per entry: "activity" is 4-7 concrete steps that bot does on its own computer, referencing real tool names like Gmail, Zendesk, Notion, Slack, CRM; "reply" is 1-3 sentences in that bot's voice picking up where the previous bot left off; "memoryUpdates" is 0-3 durable facts.
- "needsApproval": true ONLY if that bot needs the user's sign-off before sending, spending, or publishing anything; "approvalNote" describes the pending action (empty string otherwise).`

  const validBotIds = new Set(bots.map((b) => b.id))
  try {
    const raw = await callLLM(system, user)
    const parsed = extractJson<{ replies?: unknown }>(raw)
    const entries: unknown[] = Array.isArray(parsed.replies) ? parsed.replies : []

    const normalized = entries
      .filter((e): e is LLMEntry => e !== null && typeof e === 'object')
      .slice(0, 3)
      .map((entry, index) => normalizeEntry(entry, validBotIds, bots[Math.min(index, bots.length - 1)].id))

    if (normalized.length === 0) throw new Error('no valid replies in group output')
    return normalized
  } catch (error) {
    console.error('[api/chat] group turn LLM failed, using fallback:', error)
    return [fallbackEntry(bots[0].id)]
  }
}

// ---------- Approval flow ----------

async function handleApproval(payload: Record<string, unknown>) {
  const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : ''
  const messageId = typeof payload.messageId === 'string' ? payload.messageId.trim() : ''
  const decision =
    payload.decision === 'approved' ? 'approved' : payload.decision === 'rejected' ? 'rejected' : null

  if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
  if (!decision) {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 })
  }

  const message = await db.message.findUnique({ where: { id: messageId } })
  if (!message || message.threadId !== threadId) {
    return NextResponse.json({ error: 'Message not found in this thread' }, { status: 404 })
  }
  if (!message.botId) {
    return NextResponse.json({ error: 'Only bot messages can be approved' }, { status: 400 })
  }

  const botRow = await db.bot.findUnique({
    where: { id: message.botId },
    include: { memories: { orderBy: { createdAt: 'desc' }, take: 8 } },
  })
  if (!botRow) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  const bot: BotContext = {
    id: botRow.id,
    name: botRow.name,
    role: botRow.role,
    persona: botRow.persona,
    memories: botRow.memories.map((m) => m.content),
  }

  // 1. Record the decision.
  await db.message.update({ where: { id: message.id }, data: { approvalStatus: decision } })

  // 2. Bot posts a follow-up showing the outcome.
  const plan = await buildFollowUpPlan(bot, message.content, message.approvalNote, decision)
  const followUp = await db.message.create({
    data: {
      threadId,
      role: 'bot',
      botId: bot.id,
      content: plan.reply,
      activity: JSON.stringify(plan.activity),
      needsApproval: false,
      approvalStatus: 'none',
      approvalNote: '',
    },
  })

  // 3. Bot is free again either way.
  await db.bot.update({ where: { id: bot.id }, data: { status: 'idle' } })
  await db.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })

  return NextResponse.json({ messages: [toMessage(followUp)] })
}

async function buildFollowUpPlan(
  bot: BotContext,
  originalContent: string,
  approvalNote: string,
  decision: 'approved' | 'rejected',
): Promise<{ activity: ActivityStep[]; reply: string }> {
  const system = botSystemPrompt(bot)
  const note = approvalNote || originalContent.slice(0, 200)
  const user =
    decision === 'approved'
      ? `You previously asked the user to approve a pending action (approval note: "${note}"). Your original message was: "${originalContent.slice(0, 400)}". The user APPROVED it just now.

Respond with STRICT JSON only — no markdown, no commentary — exactly this shape:
{"activity":[{"kind":"tool","text":"..."}],"reply":"..."}
Rules:
- "activity": 2-4 short steps showing the action completing on your computer (e.g. "Sending 5 follow-ups…", "Logged to CRM…", "Done — all sent."). Kinds: tool, write, done.
- "reply": 1-2 sentences confirming completion in your teammate voice.`
      : `You previously asked the user to approve a pending action (approval note: "${note}"). Your original message was: "${originalContent.slice(0, 400)}". The user REJECTED it just now.

Respond with STRICT JSON only — no markdown, no commentary — exactly this shape:
{"activity":[{"kind":"think","text":"..."}],"reply":"..."}
Rules:
- "activity": 1-2 steps showing the work being parked, nothing sent. Kinds: think, done.
- "reply": one short sentence acknowledging gracefully, e.g. "Understood — parked it. Nothing went out."`

  try {
    const raw = await callLLM(system, user, 30000)
    const parsed = extractJson<LLMEntry>(raw)
    const activity = parseActivity(parsed.activity)
    const reply =
      typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : ''
    if (activity.length === 0 || !reply) throw new Error('incomplete follow-up JSON')
    return { activity: activity.slice(0, 4), reply }
  } catch (error) {
    console.error('[api/chat] approval follow-up LLM failed, using fallback:', error)
    return decision === 'approved'
      ? { activity: APPROVED_FALLBACK.activity, reply: APPROVED_FALLBACK.reply }
      : { activity: REJECTED_FALLBACK.activity, reply: REJECTED_FALLBACK.reply }
  }
}
