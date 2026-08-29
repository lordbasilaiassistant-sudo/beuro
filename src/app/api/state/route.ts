// ============================================================
// GrokBok — GET /api/state
// Returns the signed-in user's full workspace: their bots,
// threads and tool connections. Every new account starts EMPTY.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { toBot, toConnection, toThread } from '@/lib/grokbok-serialize'
import type { AppState } from '@/lib/grokbok-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    const userId = session.id

    const [botRows, threadRows, connectionRows] = await Promise.all([
      db.bot.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: {
          memories: { orderBy: { createdAt: 'asc' } },
          routines: { orderBy: { createdAt: 'asc' } },
        },
      }),
      db.thread.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      }),
      db.connection.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    ])

    const state: AppState = {
      bots: botRows.map(toBot),
      threads: threadRows.map(toThread),
      connections: connectionRows.map(toConnection),
    }
    return NextResponse.json(state)
  } catch (error) {
    console.error('[api/state] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load workspace state' }, { status: 500 })
  }
}
