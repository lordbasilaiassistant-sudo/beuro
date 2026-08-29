// ============================================================
// GrokBok — POST /api/auth/login
// Verifies email + password (scrypt) and sets the session cookie.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  createSessionToken,
  sessionCookieValue,
  toAuthUser,
  verifyPassword,
} from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 })
    }

    const res = NextResponse.json({ user: toAuthUser(user) })
    res.headers.set('Set-Cookie', sessionCookieValue(createSessionToken(user.id)))
    return res
  } catch (error) {
    console.error('[api/auth/login] POST failed:', error)
    return NextResponse.json({ error: 'Could not sign in' }, { status: 500 })
  }
}
