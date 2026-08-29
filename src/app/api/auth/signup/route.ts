// ============================================================
// GrokBok — POST /api/auth/signup
// Creates a real account: unique email, scrypt-hashed password,
// and sets the session cookie. The workspace starts EMPTY —
// the user hires their own bots and connects their own tools.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  createSessionToken,
  hashPassword,
  sessionCookieValue,
  toAuthUser,
} from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const company = typeof body.company === 'string' ? body.company.trim().slice(0, 120) : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      )
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists — sign in instead' },
        { status: 409 },
      )
    }

    const user = await db.user.create({
      data: { email, name: name.slice(0, 80), company, passwordHash: hashPassword(password) },
    })

    const res = NextResponse.json({ user: toAuthUser(user) }, { status: 201 })
    res.headers.set('Set-Cookie', sessionCookieValue(createSessionToken(user.id)))
    return res
  } catch (error) {
    console.error('[api/auth/signup] POST failed:', error)
    return NextResponse.json({ error: 'Could not create the account' }, { status: 500 })
  }
}
