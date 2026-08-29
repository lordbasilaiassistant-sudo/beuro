// ============================================================
// GrokBok clone — GET /api/state
// Returns the full workspace. Seeds the DB on first call (empty Bot table).
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { seedGrokBok } from '@/lib/grokbok-seed'
import { toBot, toThread } from '@/lib/grokbok-serialize'
import type { AppState } from '@/lib/grokbok-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request) {
  try {
    // Idempotent seeding: only when there are no bots at all.
    const botCount = await db.bot.count()
    if (botCount === 0) {
      await seedGrokBok()
    }

    const [botRows, threadRows] = await Promise.all([
      db.bot.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          memories: { orderBy: { createdAt: 'asc' } },
          routines: { orderBy: { createdAt: 'asc' } },
        },
      }),
      db.thread.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      }),
    ])

    const state: AppState = {
      bots: botRows.map(toBot),
      threads: threadRows.map(toThread),
    }
    return NextResponse.json(state)
  } catch (error) {
    console.error('[api/state] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load workspace state' }, { status: 500 })
  }
}
