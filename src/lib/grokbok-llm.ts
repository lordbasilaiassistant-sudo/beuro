// ============================================================
// GrokBok clone — shared LLM helpers (BACKEND ONLY)
// Wraps z-ai-web-dev-sdk with timeout + robust JSON parsing.
// ============================================================

import ZAI from 'z-ai-web-dev-sdk'
import type { ActivityKind, ActivityStep } from '@/lib/grokbok-types'

const VALID_KINDS: readonly string[] = ['think', 'signin', 'tool', 'read', 'write', 'done']
export const MAX_ACTIVITY_STEPS = 8

/**
 * One system+user LLM round-trip with a hard timeout.
 * Resolves with the raw text; rejects on error/timeout — callers handle fallbacks.
 */
export async function callLLM(system: string, user: string, timeoutMs = 60000): Promise<string> {
  const zai = await ZAI.create()

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        thinking: { type: 'disabled' },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])

    const text = completion.choices[0]?.message?.content ?? ''
    if (!text.trim()) throw new Error('LLM returned an empty response')
    return text
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Robustly pull a JSON object out of raw LLM text:
 * strips markdown fences, slices from first '{' to last '}', JSON.parse.
 * Throws on any failure so callers can fall back.
 */
export function extractJson<T>(text: string): T {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('extractJson: empty input')
  }
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('extractJson: no JSON object found in LLM output')
  }

  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1))
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('extractJson: parsed value is not an object')
  }
  return parsed as T
}

/**
 * Validate/sanitize an LLM-produced activity array into ActivityStep[].
 * - drops non-object entries and entries without usable text
 * - coerces unknown kinds to 'think'
 * - clamps to MAX_ACTIVITY_STEPS (8)
 */
export function parseActivity(raw: unknown): ActivityStep[] {
  if (!Array.isArray(raw)) return []

  const steps: ActivityStep[] = []
  for (const entry of raw) {
    if (steps.length >= MAX_ACTIVITY_STEPS) break
    if (entry === null || typeof entry !== 'object') continue

    const obj = entry as Record<string, unknown>
    const kindRaw = typeof obj.kind === 'string' ? obj.kind.trim().toLowerCase() : ''
    const kind: ActivityKind = VALID_KINDS.includes(kindRaw) ? (kindRaw as ActivityKind) : 'think'

    let text = ''
    if (typeof obj.text === 'string') text = obj.text.trim()
    else if (obj.text !== null && obj.text !== undefined) text = String(obj.text).trim()
    if (!text) continue

    steps.push({ kind, text: text.slice(0, 240) })
  }
  return steps
}

/** Pull 0–3 non-empty string memory updates out of unknown LLM output. */
export function parseMemoryUpdates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 300))
    .slice(0, 3)
}
