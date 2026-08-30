// ============================================================
// Beuro — POST /api/chat
// Body is a SendChatInput (new user message → bot replies with activity)
// or an ApprovalInput (approve/reject a pending message → follow-up).
// Discriminated by the presence of `decision`.
// Everything is scoped to the signed-in user's workspace, and bots are
// briefed on the user's REAL context: their name, company and the tools
// they connected (Connections), so they work on actual company matters.
// All LLM failures fall back to canned responses — this route never 500s
// because of the model.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { callLLM, extractJson, parseActivity, parseMemoryUpdates } from '@/lib/grokbok-llm'
import { runAgentLoop } from '@/lib/agent-loop'
import { parseJsonArray, toMessage } from '@/lib/grokbok-serialize'
import type { ActivityStep } from '@/lib/grokbok-types'
import type { Message as MessageRow } from '@prisma/client'

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

interface WorkspaceContext {
  ownerName: string
  company: string
  connectedTools: { name: string; type: string; notes: string }[]
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

function workspaceBrief(ws: WorkspaceContext): string {
  const who = ws.company ? `${ws.ownerName} at ${ws.company}` : ws.ownerName
  const tools =
    ws.connectedTools.length > 0
      ? ws.connectedTools
          .map((t) => `${t.name} (${t.type}${t.notes ? ` — ${t.notes}` : ''})`)
          .join(', ')
      : 'none connected yet — if a task needs a tool that is not connected, say so plainly and suggest connecting it instead of pretending'
  return (
    `You work for ${who}. This is their real company — treat every task as real work with real consequences. ` +
    `Connected tools on your computer: ${tools}.`
  )
}

function botSystemPrompt(
  bot: BotContext,
  ws: WorkspaceContext,
  teammates?: { name: string; role: string }[],
): string {
  const memoryText = bot.memories.length ? bot.memories.join(' | ') : 'none yet'
  let prompt =
    `You are ${bot.name}, a ${bot.role} AI teammate in Beuro. Persona: ${bot.persona}. ` +
    `${workspaceBrief(ws)} ` +
    `Your memories: ${memoryText}. ` +
    // Tell the Bot what it can ACTUALLY do. This line used to read "You have
    // your own cloud computer, can sign into the user's tools, and work
    // end-to-end" — none of which is true, and it is why Bots narrated
    // "Logged into email marketing platform". A model told it has hands will
    // describe using them.
    `You can search the live web and open real public web pages. You CANNOT sign into anything, ` +
    `send email, move money, or reach the user's private systems. When a task needs one of those, ` +
    `say so plainly rather than describing yourself doing it. ` +
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

function groupSystemPrompt(bots: BotContext[], ws: WorkspaceContext): string {
  const roster = bots
    .map((b) => {
      const memoryText = b.memories.length ? b.memories.join(' | ') : 'none yet'
      return `- ${b.name} (botId: ${b.id}, role: ${b.role}) — persona: ${b.persona} — memories: ${memoryText}`
    })
    .join('\n')
  return (
    'You operate a team of AI teammates in Beuro. They can search the live web and open real public ' +
    'pages. They CANNOT sign into anything, send email, move money, or reach the user\'s private ' +
    'systems — when a task needs that, the bot says so plainly instead of describing itself doing it. ' +
    `${workspaceBrief(ws)}\n` +
    'Each bot replies like a competent colleague: concise, specific, friendly. Never mention LLMs.\n' +
    `Team roster:\n${roster}\n` +
    'In group chats the bots coordinate and hand work to each other sequentially, like colleagues in one room.'
  )
}

// ---------- entry point ----------

export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body: unknown = await req.json().catch(() => null)
    if (body === null || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const payload = body as Record<string, unknown>

    if (payload.decision !== undefined && payload.decision !== null) {
      return handleApproval(payload, session.id)
    }
    return handleSend(payload, session.id)
  } catch (error) {
    console.error('[api/chat] POST failed:', error)
    return NextResponse.json({ error: 'Chat request failed' }, { status: 500 })
  }
}

/** Load the owner's name, company and connected tools for bot briefings. */
async function loadWorkspace(userId: string): Promise<WorkspaceContext> {
  const [user, connections] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, company: true } }),
    db.connection.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ])
  return {
    ownerName: user?.name.split(' ')[0] ?? user?.name ?? 'the user',
    company: user?.company ?? '',
    connectedTools: connections.map((c) => {
      let notes = ''
      try {
        const parsed: unknown = JSON.parse(c.config)
        if (parsed && typeof parsed === 'object' && 'notes' in parsed) {
          notes = typeof (parsed as { notes?: unknown }).notes === 'string'
            ? ((parsed as { notes: string }).notes as string).slice(0, 80)
            : ''
        }
      } catch {
        /* config parse failure → no notes */
      }
      return { name: c.name, type: c.type, notes }
    }),
  }
}

// ---------- Send flow ----------

async function handleSend(payload: Record<string, unknown>, userId: string) {
  const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : ''
  const content = typeof payload.content === 'string' ? payload.content.trim() : ''
  if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const thread = await db.thread.findUnique({
    where: { id: threadId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!thread || thread.userId !== userId) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  const botIds = parseJsonArray<string>(thread.botIds).filter((id) => id.length > 0)
  if (botIds.length === 0) {
    return NextResponse.json({ error: 'Thread has no members' }, { status: 400 })
  }

  const botRows = await db.bot.findMany({
    where: { id: { in: botIds }, userId },
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

  const ws = await loadWorkspace(userId)

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
    ? await groupTurn(orderedBots, ws, historyText, content)
    : [await dmTurn(orderedBots[0], ws, historyText, content)]

  // 4. Persist bot messages (in reply order) + memories.
  const savedRows: MessageRow[] = []
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

async function dmTurn(
  bot: BotContext,
  ws: WorkspaceContext,
  historyText: string,
  content: string,
): Promise<NormalizedReply> {
  // The Bot actually works the task on its computer: real searches, real
  // pages. Steps come back written by the tools, so the activity feed is a
  // record of what happened rather than a story about it.
  const system = botSystemPrompt(bot, ws)
  // Keep prior turns clearly marked as background. Pasting them in unlabelled
  // made the Bot re-run a search from an earlier question and attach those
  // steps to an unrelated answer — real actions, wrong conversation.
  const task = historyText
    ? `Earlier in this conversation (background only — do NOT act on it again):
${historyText}

---
Their request right now, the only thing to act on:
${content}`
    : content

  const outcome = await runAgentLoop(system, task)

  console.info(
    `[api/chat] ${bot.name}: ${outcome.toolCalls} tool call(s), realWork=${outcome.didRealWork}, brokeDown=${outcome.brokeDown}`,
  )

  // Nothing executed and the model gave us nothing usable — fall back so the
  // UI still moves, but the steps stay unverified and the pane will say so.
  if (!outcome.didRealWork && outcome.brokeDown) {
    return fallbackEntry(bot.id)
  }

  // A Bot that answered straight from what it knew ran no tools, and that is
  // a legitimate answer — but it must NOT be dressed in borrowed activity.
  // Padding it with FALLBACK_ACTIVITY would claim it signed in and drafted a
  // deliverable when it did nothing, which is precisely the lie we are here
  // to kill. One honest, unverified line instead.
  const activity: ActivityStep[] =
    outcome.steps.length > 0
      ? outcome.steps
      : [{ kind: 'think', text: 'Answered directly — no tools needed for this one.' }]

  return {
    botId: bot.id,
    activity,
    reply: outcome.reply || FALLBACK_REPLY,
    memoryUpdates: outcome.memoryUpdates,
    needsApproval: outcome.needsApproval,
    approvalNote: outcome.approvalNote,
  }
}

async function groupTurn(
  bots: BotContext[],
  ws: WorkspaceContext,
  historyText: string,
  content: string,
): Promise<NormalizedReply[]> {
  const system = groupSystemPrompt(bots, ws)
  const history = historyText ? `${historyText}\n\n` : ''
  const user = `${history}The user just said: ${content}

Respond with STRICT JSON only — no markdown, no commentary — exactly this shape:
{"replies":[{"botId":"...","activity":[{"kind":"signin","text":"..."}],"reply":"...","memoryUpdates":[],"needsApproval":false,"approvalNote":""}]}
Rules:
- "replies": 1-3 entries in logical hand-off order (e.g. the coordinator triages first, then a specialist picks up the work). Each "botId" must be one of: ${bots
    .map((b) => `"${b.id}" (${b.name})`)
    .join(', ')}.
- Per entry: "activity" is 4-7 concrete steps that bot does on its own computer, referencing the user's actual connected tools where relevant; "reply" is 1-3 sentences in that bot's voice picking up where the previous bot left off; "memoryUpdates" is 0-3 durable facts.
- Approval policy — an entry sets "needsApproval": true whenever its work involves sending email/DMs to other people, spending or wiring money, publishing externally, signing contracts, deleting data, or hiring decisions; in that case the activity must END with the prepared draft/action (never claim it was sent/spent) and the reply says it's waiting for sign-off. "approvalNote" describes the pending action. Internal/read-only/reversible work completes fully with "needsApproval": false.`

  const validBotIds = new Set(bots.map((b) => b.id))
  try {
    const raw = await callLLM(system, user)
    let entries: unknown[] = []
    try {
      const parsed = extractJson<{ replies?: unknown }>(raw)
      entries = Array.isArray(parsed.replies) ? parsed.replies : []
    } catch {
      // Whole-object parse failed — salvage individual {"botId": ...} entries instead.
      entries = salvageReplyObjects(raw)
      console.warn(`[api/chat] group output failed full parse, salvaged ${entries.length} entries`)
    }

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

/**
 * Last-resort salvage for malformed group output: carve out top-level objects
 * that contain a "botId" key and parse each one through the repair pipeline.
 */
function salvageReplyObjects(raw: string): unknown[] {
  const salvaged: unknown[] = []
  for (let i = raw.indexOf('"botId"'); i !== -1; i = raw.indexOf('"botId"', i + 1)) {
    const objStart = raw.lastIndexOf('{', i)
    if (objStart === -1) continue
    // Walk forward to the matching closing brace (string-aware).
    let depth = 0
    let inString = false
    let escaped = false
    for (let j = objStart; j < raw.length; j += 1) {
      const ch = raw[j]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            salvaged.push(JSON.parse(closeOpenStructuresSafe(raw.slice(objStart, j + 1))))
          } catch {
            /* skip unparseable entry */
          }
          break
        }
      }
    }
    if (salvaged.length >= 3) break
  }
  return salvaged
}

function closeOpenStructuresSafe(s: string): string {
  let inString = false
  let escaped = false
  const stack: string[] = []
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let out = s
  if (inString) out += '"'
  out = out.replace(/,\s*$/, '')
  while (stack.length > 0) out += stack.pop()
  return out
}

// ---------- Approval flow ----------

async function handleApproval(payload: Record<string, unknown>, userId: string) {
  const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : ''
  const messageId = typeof payload.messageId === 'string' ? payload.messageId.trim() : ''
  const decision =
    payload.decision === 'approved' ? 'approved' : payload.decision === 'rejected' ? 'rejected' : null

  if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
  if (!decision) {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 })
  }

  const thread = await db.thread.findUnique({ where: { id: threadId } })
  if (!thread || thread.userId !== userId) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  const message = await db.message.findUnique({ where: { id: messageId } })
  if (!message || message.threadId !== threadId) {
    return NextResponse.json({ error: 'Message not found in this thread' }, { status: 404 })
  }
  if (!message.botId) {
    return NextResponse.json({ error: 'Only bot messages can be approved' }, { status: 400 })
  }

  const botRow = await db.bot.findFirst({
    where: { id: message.botId, userId },
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
  const ws = await loadWorkspace(userId)

  // 1. Record the decision.
  await db.message.update({ where: { id: message.id }, data: { approvalStatus: decision } })

  // 2. Bot posts a follow-up showing the outcome.
  const plan = await buildFollowUpPlan(bot, ws, message.content, message.approvalNote, decision)
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
  ws: WorkspaceContext,
  originalContent: string,
  approvalNote: string,
  decision: 'approved' | 'rejected',
): Promise<{ activity: ActivityStep[]; reply: string }> {
  const system = botSystemPrompt(bot, ws)
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
