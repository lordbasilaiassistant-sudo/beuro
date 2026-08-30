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
import { TOOL_BY_NAME } from '@/lib/tools'
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

/**
 * A group turn. Bots take the work in sequence, and each one that speaks does
 * REAL work — the same agent loop a 1:1 thread runs.
 *
 * This used to be a single LLM call that invented every bot's activity at once,
 * which is why group steps were narrated while DM steps were verified. Same
 * product, two different standards of truth. Now a cheap routing call decides
 * who should pick this up, and then those bots actually run.
 *
 * Capped at MAX_GROUP_RESPONDERS because every responder is a full loop against
 * a shared, serial rail — three bots deliberating is three times the latency
 * and quota of one.
 */
const MAX_GROUP_RESPONDERS = 2

async function chooseResponders(
  bots: BotContext[],
  ws: WorkspaceContext,
  historyText: string,
  content: string,
): Promise<BotContext[]> {
  const roster = bots.map((b) => `- ${b.id} — ${b.name}, ${b.role}`).join('\n')
  const prompt = `${historyText ? `${historyText}\n\n` : ''}The user just said: ${content}

Team:
${roster}

Which teammates should pick this up, in order? Reply with ONE JSON object and nothing else:
{"botIds":["id","id"]}
Pick 1 or 2 — only the ones whose role genuinely fits. Prefer one unless the task
really needs a hand-off.`

  try {
    const parsed = extractJson<{ botIds?: unknown }>(await callLLM(groupSystemPrompt(bots, ws), prompt, 30000))
    const ids = Array.isArray(parsed.botIds) ? parsed.botIds : []
    const picked: BotContext[] = []
    for (const id of ids) {
      const bot = bots.find((b) => b.id === id)
      if (bot && !picked.includes(bot)) picked.push(bot)
      if (picked.length >= MAX_GROUP_RESPONDERS) break
    }
    if (picked.length > 0) return picked
  } catch {
    /* routing failed — fall through */
  }
  // Routing is a convenience, never a blocker: default to the first bot.
  return [bots[0]]
}

async function groupTurn(
  bots: BotContext[],
  ws: WorkspaceContext,
  historyText: string,
  content: string,
): Promise<NormalizedReply[]> {
  const responders = await chooseResponders(bots, ws, historyText, content)
  const teammates = bots.map((b) => ({ name: b.name, role: b.role }))
  const replies: NormalizedReply[] = []
  let handoffContext = ''

  for (const bot of responders) {
    const task =
      `${historyText ? `Earlier in this conversation (background only — do NOT act on it again):
${historyText}

---
` : ''}` +
      `Their request right now, the only thing to act on:
${content}` +
      handoffContext

    const outcome = await runAgentLoop(botSystemPrompt(bot, ws, teammates), task)

    console.info(
      `[api/chat] group ${bot.name}: ${outcome.toolCalls} tool call(s), realWork=${outcome.didRealWork}`,
    )

    replies.push({
      botId: bot.id,
      activity:
        outcome.steps.length > 0
          ? outcome.steps
          : [{ kind: 'think', text: 'Answered directly — no tools needed for this one.' }],
      reply: outcome.reply || FALLBACK_REPLY,
      memoryUpdates: outcome.memoryUpdates,
      needsApproval: outcome.needsApproval,
      approvalNote: outcome.approvalNote,
    })

    // The next teammate picks up from what this one actually found, not from
    // an invented summary of it.
    handoffContext = `

${bot.name} has already replied: "${outcome.reply}"
Build on that rather than repeating it.`
  }

  return replies.length > 0 ? replies : [fallbackEntry(bots[0].id)]
}

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
  //
  // On APPROVAL this used to ask the model to describe the action completing —
  // "Sending 12 follow-ups…", "Done — all sent." Nothing was sent. There is no
  // tool in this codebase that can send an email, move money or delete data, so
  // every one of those lines was fiction, and approving something was the most
  // dangerous place in the product to be telling it: the user has just said yes
  // and is entitled to believe the thing happened.
  //
  // Now approval runs the real agent loop. If the approved work is something
  // the Bot can actually do with its tools, it does it and the steps are
  // verified. If it is not, the Bot says so plainly instead of pretending.
  const plan =
    decision === 'approved'
      ? await runApprovedWork(bot, ws, message.content, message.approvalNote)
      : await buildFollowUpPlan(bot, ws, message.content, message.approvalNote, decision)
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

/**
 * Carry out work the user just approved — for real, with the same tools and
 * the same honesty rules as a normal turn.
 *
 * The Bot cannot send, pay or delete. When the approved action needs one of
 * those, the loop's own instructions make it say so; what it must never do is
 * report success. Steps come back written by the tools that ran, so an empty
 * toolset produces an empty log rather than a convincing one.
 */
async function runApprovedWork(
  bot: BotContext,
  ws: WorkspaceContext,
  originalContent: string,
  approvalNote: string,
): Promise<{ activity: ActivityStep[]; reply: string }> {
  const task =
    `Your teammate just APPROVED this pending action: "${approvalNote || originalContent}"\n` +
    `Your earlier message was: "${originalContent}"\n\n` +
    `Carry out whatever part of it you can actually do with your tools, then report back. ` +
    `If finishing it needs something you cannot do — sending a message to someone, spending money, ` +
    `changing a system you have no access to — say exactly that and say what is still needed. ` +
    `Do NOT report an action as done unless one of your tools performed it.`

  // The user has said yes to the described action, so the structural gate that
  // blocked it lifts for this follow-up turn — and only this one. Without this
  // the Bot would ask for approval it has already been given.
  const approved = new Set(TOOL_BY_NAME.keys())
  const outcome = await runAgentLoop(botSystemPrompt(bot, ws), task, approved)

  return {
    activity:
      outcome.steps.length > 0
        ? outcome.steps
        : [{ kind: 'think', text: 'Approved — but nothing here is something my tools can carry out.' }],
    reply: outcome.reply || APPROVED_FALLBACK.reply,
  }
}
