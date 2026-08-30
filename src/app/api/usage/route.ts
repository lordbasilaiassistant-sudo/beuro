// ============================================================
// Beuro — GET /api/usage
// What this account has spent this billing period, and what is left.
//
// Exists so usage is visible to the person incurring it rather than only to
// whoever reads the database. A turn is the billable unit; see src/lib/usage.ts
// for what one actually costs.
// ============================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { getUsage } from '@/lib/usage'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const usage = await getUsage(session.id)
  return NextResponse.json({ usage })
}
