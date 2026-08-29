// ============================================================
// GrokBok — GET /api/auth/me · POST /api/auth/logout
// me returns the signed-in user (or null); logout clears the cookie.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  clearedSessionCookieValue,
  getSessionUser,
  toAuthUser,
} from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSessionUser(req)
    if (!session) return NextResponse.json({ user: null })
    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user) return NextResponse.json({ user: null })
    return NextResponse.json({ user: toAuthUser(user) })
  } catch (error) {
    console.error('[api/auth/me] GET failed:', error)
    return NextResponse.json({ error: 'Could not load the session' }, { status: 500 })
  }
}

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', clearedSessionCookieValue())
  return res
}
