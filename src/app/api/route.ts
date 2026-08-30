// ============================================================
// Beuro — /api
// Health + inference diagnostics. Tells you which LLM rail this
// instance is actually wired to, so "why is the AI not answering"
// is one curl away.
// ============================================================

import { NextResponse } from 'next/server'
import { providerInfo } from '@/lib/llm-provider'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'beuro',
    llm: providerInfo(),
  })
}
