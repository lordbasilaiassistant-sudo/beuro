// ============================================================
// GrokBok — /api/routines
// POST: LLM turns a free-form description into { title, schedule, steps }
// PATCH: enable/disable a routine
// Both scoped to the signed-in user's bots.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { callLLM, extractJson } from '@/lib/grokbok-llm'
import { toRoutine } from '@/lib/grokbok-serialize'
import type { CreateRoutineInput, ToggleRoutineInput } from '@/lib/grokbok-types'

export const runtime = 'nodejs'

const FALLBACK_SCHEDULE = 'Every weekday at 9:00 AM'

interface RoutinePlan {
  title: string
  schedule: string
  steps: string[]
}

function cannedPlan(description: string): RoutinePlan {
  const trimmed = description.trim()
  const title = trimmed.length <= 48 ? trimmed : `${trimmed.slice(0, 45).trimEnd()}…`
  return {
    title: title || 'Recurring task',
    schedule: FALLBACK_SCHEDULE,
    steps: [
      'Review the relevant inbox, docs, and dashboards',
      `Do the core work for: ${trimmed.slice(0, 120)}`,
      'Draft the outputs for the user to review',
      'Post a summary in this chat',
    ],
  }
}

async function generateRoutinePlan(
  botName: string,
  description: string,
): Promise<RoutinePlan> {
  try {
    const raw = await callLLM(
      'You design recurring workflows for AI teammates in GrokBok. Respond with STRICT JSON only — no markdown, no commentary.',
      `Turn this description into a routine the bot "${botName}" can run on a schedule. Description: "${description}".

Respond exactly in this shape:
{"title":"...","schedule":"...","steps":["..."]}
- title: 2-5 words.
- schedule: human-readable, like "Every weekday at 8:30 AM" or "Every Monday at 9:00 AM" (pick a sensible default time).
- steps: 3-6 short imperative strings describing the actual work.`,
      30000,
    )
    const parsed = extractJson<{ title: unknown; schedule: unknown; steps: unknown }>(raw)
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim().slice(0, 200))
      : []
    const title =
      typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 80) : ''
    const schedule =
      typeof parsed.schedule === 'string' && parsed.schedule.trim()
        ? parsed.schedule.trim().slice(0, 80)
        : FALLBACK_SCHEDULE
    if (!title || steps.length === 0) throw new Error('incomplete routine plan')

    return { title, schedule, steps: steps.slice(0, 6) }
  } catch (error) {
    console.error('[api/routines] routine LLM failed, using canned plan:', error)
    return cannedPlan(description)
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = (await req.json().catch(() => ({}))) as Partial<CreateRoutineInput>
    const botId = typeof body.botId === 'string' ? body.botId.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    if (!botId) return NextResponse.json({ error: 'botId is required' }, { status: 400 })
    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }

    const bot = await db.bot.findFirst({ where: { id: botId, userId: session.id } })
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })

    const plan = await generateRoutinePlan(bot.name, description)
    const routine = await db.routine.create({
      data: {
        botId,
        title: plan.title,
        schedule: plan.schedule,
        steps: JSON.stringify(plan.steps),
      },
    })
    return NextResponse.json({ routine: toRoutine(routine) }, { status: 201 })
  } catch (error) {
    console.error('[api/routines] POST failed:', error)
    return NextResponse.json({ error: 'Failed to create routine' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = (await req.json().catch(() => ({}))) as Partial<ToggleRoutineInput>
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const existing = await db.routine.findUnique({
      where: { id },
      include: { bot: { select: { userId: true } } },
    })
    if (!existing || existing.bot.userId !== session.id) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    }

    const routine = await db.routine.update({ where: { id }, data: { enabled: body.enabled } })
    return NextResponse.json({ routine: toRoutine(routine) })
  } catch (error) {
    console.error('[api/routines] PATCH failed:', error)
    return NextResponse.json({ error: 'Failed to update routine' }, { status: 500 })
  }
}
