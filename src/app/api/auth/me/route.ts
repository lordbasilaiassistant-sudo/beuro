// ============================================================
// GrokBok — GET /api/auth/me
// Returns the signed-in user, or { user: null } when signed out.
// (Sign-out lives at POST /api/auth/logout.)
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toAuthUser } from '@/lib/auth'

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
