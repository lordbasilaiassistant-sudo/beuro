// ============================================================
// GrokBok — /api/connections
// The user connects their real tools (API keys, webhooks, email
// accounts, databases) so bots can work with them.
// GET: list (values masked) · POST: add · DELETE ?id=: remove
// Raw secret values are stored server-side and never returned.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { toConnection } from '@/lib/grokbok-serialize'
import type { ConnectionType, CreateConnectionInput } from '@/lib/grokbok-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TYPES: readonly string[] = ['api_key', 'webhook', 'email', 'database', 'custom']

export async function GET(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const rows = await db.connection.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ connections: rows.map(toConnection) })
  } catch (error) {
    console.error('[api/connections] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load connections' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = (await req.json().catch(() => ({}))) as Partial<CreateConnectionInput>
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    const typeRaw = typeof body.type === 'string' ? body.type.trim() : ''
    const value = typeof body.value === 'string' ? body.value.trim().slice(0, 2000) : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : ''

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!VALID_TYPES.includes(typeRaw)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const count = await db.connection.count({ where: { userId: session.id } })
    if (count >= 30) {
      return NextResponse.json(
        { error: 'Connection limit reached (30) — remove one first' },
        { status: 400 },
      )
    }

    const connection = await db.connection.create({
      data: {
        userId: session.id,
        name,
        type: typeRaw as ConnectionType,
        config: JSON.stringify({ value, notes }),
      },
    })
    return NextResponse.json({ connection: toConnection(connection) }, { status: 201 })
  } catch (error) {
    console.error('[api/connections] POST failed:', error)
    return NextResponse.json({ error: 'Failed to add the connection' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const id = new URL(req.url).searchParams.get('id')?.trim() ?? ''
    if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 })

    const existing = await db.connection.findUnique({ where: { id } })
    if (!existing || existing.userId !== session.id) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    await db.connection.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/connections] DELETE failed:', error)
    return NextResponse.json({ error: 'Failed to remove the connection' }, { status: 500 })
  }
}
