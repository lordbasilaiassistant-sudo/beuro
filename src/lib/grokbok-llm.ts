// ============================================================
// GrokBok — shared LLM helpers (BACKEND ONLY)
// Timeout + robust JSON parsing on top of the pluggable provider in
// `llm-provider.ts` (keyless free rail by default, or any
// OpenAI-compatible endpoint). No vendor SDK, no API key required.
// ============================================================

import { chatCompletion } from '@/lib/llm-provider'
import type { ActivityKind, ActivityStep, Evidence } from '@/lib/grokbok-types'

const VALID_KINDS: readonly string[] = ['think', 'signin', 'tool', 'read', 'write', 'done']

/**
 * Where an activity array came from.
 * - 'model'   — straight out of an LLM. Never trusted to mark itself verified.
 * - 'trusted' — steps this server built and persisted, coming back off the DB.
 */
export type ActivitySource = 'model' | 'trusted'
export const MAX_ACTIVITY_STEPS = 8

/**
 * One system+user LLM round-trip with a hard timeout.
 * Resolves with the raw text; rejects on error/timeout — callers handle fallbacks.
 */
export async function callLLM(system: string, user: string, timeoutMs = 60000): Promise<string> {
  const text = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    timeoutMs,
  )
  if (!text.trim()) throw new Error('LLM returned an empty response')
  return text
}

/**
 * Robustly pull a JSON object out of raw LLM text.
 * Pipeline: strip fences → slice first '{'..last '}' → JSON.parse →
 * repair passes (smart quotes, trailing commas, unescaped newlines,
 * truncated-structure closing). Throws only if every pass fails.
 */
export function extractJson<T>(text: string): T {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('extractJson: empty input')
  }
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1) {
    throw new Error('extractJson: no JSON object found in LLM output')
  }
  const sliced = end > start ? cleaned.slice(start, end + 1) : cleaned.slice(start)

  // Pass 1: as-is.
  try {
    return finalize<T>(JSON.parse(sliced))
  } catch {
    /* fall through to repairs */
  }

  // Pass 2: cheap character-level repairs.
  try {
    return finalize<T>(JSON.parse(repairJsonText(sliced)))
  } catch {
    /* fall through */
  }

  // Pass 3: repair + close any truncated strings/arrays/objects.
  try {
    return finalize<T>(JSON.parse(closeOpenStructures(repairJsonText(sliced))))
  } catch {
    /* fall through */
  }

  // Pass 4: progressively truncate to the last "complete-looking" object and close.
  for (let cut = sliced.length; cut > 2; cut -= 1) {
    const candidate = sliced.slice(0, cut)
    try {
      return finalize<T>(JSON.parse(closeOpenStructures(repairJsonText(candidate))))
    } catch {
      continue
    }
  }

  throw new Error('extractJson: all JSON repair passes failed')
}

function finalize<T>(parsed: unknown): T {
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('extractJson: parsed value is not an object')
  }
  return parsed as T
}

/** Common LLM JSON mistakes that are safe to fix blind. */
function repairJsonText(s: string): string {
  return (
    s
      // smart quotes → straight quotes
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      // trailing commas before closing brackets
      .replace(/,\s*([}\]])/g, '$1')
  )
}

/** Walk the text, close any unterminated string and unclosed {/[ structures. */
function closeOpenStructures(s: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (const ch of s) {
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }

  let out = s
  if (inString) out += '"'
  out = out.replace(/,\s*$/, '')
  while (stack.length > 0) out += stack.pop()
  return out
}

/**
 * Validate/sanitize an LLM-produced activity array into ActivityStep[].
 * - drops non-object entries and entries without usable text
 * - coerces unknown kinds to 'think'
 * - clamps to MAX_ACTIVITY_STEPS (8)
 */
export function parseActivity(raw: unknown, source: ActivitySource = 'model'): ActivityStep[] {
  if (!Array.isArray(raw)) return []

  // `verified` is a claim about what the SERVER did. Honouring it from model
  // output let a Bot self-certify: asked to include "verified": true in its
  // steps, it produced "Sent 400 personalized launch emails" rendered as a
  // real, executed action, having sent nothing. Only the trusted path — our
  // own already-validated steps coming back off the database — may carry it.
  const trustVerified = source === 'trusted'

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

    const step: ActivityStep = { kind, text: text.slice(0, 240) }

    // Only the trusted DB round-trip may carry the honesty flag and its
    // evidence back. From model output both are dropped: a step is "real"
    // because the server ran a tool, never because the model said so.
    if (trustVerified) {
      if (obj.verified === true) step.verified = true
      const evidence = parseEvidence(obj.evidence)
      if (evidence.length > 0) step.evidence = evidence
    }

    steps.push(step)
  }
  return steps
}

/** Validate evidence links. Only http(s) — an evidence link is user-clickable. */
function parseEvidence(raw: unknown): Evidence[] {
  if (!Array.isArray(raw)) return []
  const out: Evidence[] = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const href = typeof obj.href === 'string' ? obj.href.trim() : ''
    if (!/^https?:\/\//i.test(href)) continue
    const label = typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : href
    out.push({
      kind: obj.kind === 'file' ? 'file' : 'url',
      label: label.slice(0, 120),
      href: href.slice(0, 500),
    })
    if (out.length >= 6) break
  }
  return out
}

/** Pull 0–3 non-empty string memory updates out of unknown LLM output. */
export function parseMemoryUpdates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 300))
    .slice(0, 3)
}
