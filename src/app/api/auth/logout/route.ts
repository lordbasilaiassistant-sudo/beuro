// ============================================================
// Beuro — POST /api/auth/logout
// Clears the session cookie. Idempotent.
// ============================================================

import { NextResponse } from 'next/server'
import { clearedSessionCookieValue } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', clearedSessionCookieValue())
  return res
}
