// ============================================================
// Beuro — /api/threads
// POST: create a thread (1 bot = DM, 2+ bots = group chat) — all
//       member bots must belong to the signed-in user.
// DELETE ?id=: delete a thread (messages cascade) — owner only.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { toThread } from '@/lib/grokbok-serialize'
import type { CreateThreadInput } from '@/lib/grokbok-types'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = (await req.json().catch(() => ({}))) as Partial<CreateThreadInput>
    const rawIds: unknown[] = Array.isArray(body.botIds) ? body.botIds : []
    const botIds = Array.from(
      new Set(
        rawIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      ),
    )
    if (botIds.length < 1) {
      return NextResponse.json({ error: 'At least one bot is required' }, { status: 400 })
    }
    if (botIds.length > 5) {
      return NextResponse.json({ error: 'A thread can have at most 5 bots' }, { status: 400 })
    }

    const bots = await db.bot.findMany({
      where: { id: { in: botIds }, userId: session.id },
    })
    if (bots.length !== botIds.length) {
      return NextResponse.json({ error: 'One or more bots were not found' }, { status: 400 })
    }

    const isGroup = botIds.length > 1
    const customTitle = typeof body.title === 'string' ? body.title.trim() : ''
    let title = customTitle
    if (!title) {
      title = isGroup
        ? botIds.map((id) => bots.find((b) => b.id === id)?.name ?? 'Teammate').join(' + ')
        : (bots[0]?.name ?? 'Chat')
    }

    const thread = await db.thread.create({
      data: { userId: session.id, title, isGroup, botIds: JSON.stringify(botIds) },
      include: { messages: true },
    })
    return NextResponse.json({ thread: toThread(thread) }, { status: 201 })
  } catch (error) {
    console.error('[api/threads] POST failed:', error)
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const id = new URL(req.url).searchParams.get('id')?.trim() ?? ''
    if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 })

    const existing = await db.thread.findUnique({ where: { id } })
    if (!existing || existing.userId !== session.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    await db.thread.delete({ where: { id } }) // messages cascade via schema
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/threads] DELETE failed:', error)
    return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 })
  }
}
