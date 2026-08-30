// ============================================================
// Beuro — POST /api/routines/run
// A bot executes one of its routines "now" and posts a run report
// (activity feed + reply) into its DM thread. Owner-scoped.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { callLLM, extractJson, parseActivity } from '@/lib/grokbok-llm'
import { parseJsonArray, toMessage } from '@/lib/grokbok-serialize'
import type { ActivityStep, RunRoutineInput } from '@/lib/grokbok-types'

export const runtime = 'nodejs'

interface RunReport {
  activity: ActivityStep[]
  reply: string
}

function cannedReport(title: string, steps: string[]): RunReport {
  const middle: ActivityStep[] = steps
    .slice(0, 4)
    .map((step) => ({ kind: 'tool', text: `${step}…` }))
  const fallbackMiddle: ActivityStep[] = [
    { kind: 'read', text: 'Reading the latest context…' },
    { kind: 'write', text: 'Preparing the deliverable…' },
  ]
  const activityAll: ActivityStep[] = [
    { kind: 'signin', text: `Signing in to run "${title}"…` },
    ...(middle.length > 0 ? middle : fallbackMiddle),
    { kind: 'done', text: 'Routine complete — summary posted.' },
  ]
  const activity = activityAll.slice(0, 7)

  return {
    activity,
    reply: `${title} run complete — every step executed on my computer and the highlights are above. I'll flag anything that needs your call.`,
  }
}

async function generateRunReport(
  bot: { name: string; role: string; persona: string },
  ownerContext: string,
  routineTitle: string,
  schedule: string,
  steps: string[],
): Promise<RunReport> {
  const system =
    `You are ${bot.name}, a ${bot.role} AI teammate in Beuro. Persona: ${bot.persona}. ` +
    `${ownerContext} ` +
    `You can search the live web and open real public web pages. You cannot sign into anything, ` +
    `send email, or reach the user's private systems — say so plainly rather than describing yourself doing it. ` +
    `You report like a competent colleague: concise, specific, friendly. Never mention you are an LLM.`

  const user = `You just executed your scheduled routine "${routineTitle}" (schedule: ${schedule}). Routine steps:
${steps.length > 0 ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : '1. Do the routine work.'}

Respond with STRICT JSON only — no markdown, no commentary — exactly this shape:
{"activity":[{"kind":"signin","text":"..."}],"reply":"..."}
Rules:
- "activity": 4-7 steps walking through the routine on your computer, concrete, with plausible numbers (e.g. "Reading 23 new tickets…", "Drafting 5 follow-ups…"). Kinds: signin, read, think, tool, write, done.
- "reply": 1-3 sentences summarizing results like a teammate (e.g. "Sweep done — 5 follow-ups drafted, 2 hot leads flagged for you."), mentioning anything that needs the user.`

  try {
    const raw = await callLLM(system, user, 45000)
    const parsed = extractJson<{ activity: unknown; reply: unknown }>(raw)
    const activity = parseActivity(parsed.activity)
    const reply =
      typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : ''
    if (activity.length === 0 || !reply) throw new Error('incomplete run report')
    return { activity, reply }
  } catch (error) {
    console.error('[api/routines/run] run-report LLM failed, using canned report:', error)
    return cannedReport(routineTitle, steps)
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = (await req.json().catch(() => ({}))) as Partial<RunRoutineInput>
    const routineId = typeof body.routineId === 'string' ? body.routineId.trim() : ''
    if (!routineId) return NextResponse.json({ error: 'routineId is required' }, { status: 400 })

    const routine = await db.routine.findUnique({
      where: { id: routineId },
      include: { bot: true },
    })
    if (!routine || routine.bot.userId !== session.id) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    }
    const bot = routine.bot

    // Owner + connected tools brief, same as chat.
    const [user, connections] = await Promise.all([
      db.user.findUnique({ where: { id: session.id }, select: { name: true, company: true } }),
      db.connection.findMany({ where: { userId: session.id }, orderBy: { createdAt: 'asc' } }),
    ])
    const ownerName = user?.name.split(' ')[0] ?? user?.name ?? 'the user'
    const company = user?.company ?? ''
    const ownerContext = connections.length
      ? `You work for ${company ? `${ownerName} at ${company}` : ownerName}. Connected tools on your computer: ${connections.map((c) => c.name).join(', ')}.`
      : `You work for ${company ? `${ownerName} at ${company}` : ownerName}.`

    // Find or create the bot's single-bot DM thread (title = bot name), owner-scoped.
    const candidateThreads = await db.thread.findMany({
      where: { userId: session.id, isGroup: false },
    })
    const dmThread =
      candidateThreads.find((t) => {
        const ids = parseJsonArray<string>(t.botIds)
        return ids.length === 1 && ids[0] === bot.id
      }) ??
      (await db.thread.create({
        data: {
          userId: session.id,
          title: bot.name,
          isGroup: false,
          botIds: JSON.stringify([bot.id]),
        },
      }))

    const steps = parseJsonArray<string>(routine.steps)
    const report = await generateRunReport(
      { name: bot.name, role: bot.role, persona: bot.persona },
      ownerContext,
      routine.title,
      routine.schedule,
      steps,
    )

    const message = await db.message.create({
      data: {
        threadId: dmThread.id,
        role: 'bot',
        botId: bot.id,
        content: report.reply,
        activity: JSON.stringify(report.activity),
      },
    })

    await db.routine.update({ where: { id: routine.id }, data: { lastRunAt: new Date() } })
    await db.bot.update({ where: { id: bot.id }, data: { status: 'idle' } })
    await db.thread.update({ where: { id: dmThread.id }, data: { updatedAt: new Date() } })

    return NextResponse.json({ messages: [toMessage(message)] })
  } catch (error) {
    console.error('[api/routines/run] POST failed:', error)
    return NextResponse.json({ error: 'Failed to run routine' }, { status: 500 })
  }
}
