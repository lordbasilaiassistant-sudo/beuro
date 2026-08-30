// ============================================================
// Beuro — /api/bots
// POST: hire a bot (LLM generates the persona when absent) — owned
//       by the signed-in user, starts idle with no fake data.
// DELETE ?id=: fire a bot (memories + routines cascade) — owner only.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { callLLM } from '@/lib/grokbok-llm'
import { toBot } from '@/lib/grokbok-serialize'
import type { CreateBotInput } from '@/lib/grokbok-types'

export const runtime = 'nodejs'

const DEFAULT_PERSONA = 'You are a diligent AI teammate.'

async function generatePersona(
  ownerName: string,
  name: string,
  role: string,
): Promise<string> {
  try {
    const raw = await callLLM(
      'You write short bot personas for Beuro, where AI teammates research on the live web and report what they actually found, with sources. Output ONLY the persona text — no quotes, no preamble, no markdown.',
      `Write a 1-2 sentence persona for an AI teammate named "${name}" whose role is "${role}", working for ${ownerName}. Cover what it does day-to-day and how it communicates.`,
      15000,
    )
    const cleaned = raw
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .slice(0, 400)
      .trim()
    return cleaned || DEFAULT_PERSONA
  } catch (error) {
    console.error('[api/bots] persona LLM failed, using default persona:', error)
    return DEFAULT_PERSONA
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = (await req.json().catch(() => ({}))) as Partial<CreateBotInput>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (!role) return NextResponse.json({ error: 'role is required' }, { status: 400 })

    const owner = await db.user.findUnique({ where: { id: session.id } })
    if (!owner) return unauthorized()

    const emoji =
      typeof body.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : '🤖'
    const personaInput = typeof body.persona === 'string' ? body.persona.trim() : ''
    const persona =
      personaInput || (await generatePersona(owner.name.split(' ')[0] ?? owner.name, name, role))

    const bot = await db.bot.create({
      data: { userId: session.id, name, role, emoji, persona },
      include: { memories: true, routines: true },
    })
    return NextResponse.json({ bot: toBot(bot) }, { status: 201 })
  } catch (error) {
    console.error('[api/bots] POST failed:', error)
    return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const id = new URL(req.url).searchParams.get('id')?.trim() ?? ''
    if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 })

    const existing = await db.bot.findUnique({ where: { id } })
    if (!existing || existing.userId !== session.id) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
    }

    await db.bot.delete({ where: { id } }) // memories + routines cascade via schema
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/bots] DELETE failed:', error)
    return NextResponse.json({ error: 'Failed to delete bot' }, { status: 500 })
  }
}
