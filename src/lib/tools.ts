// ============================================================
// Beuro — the tool layer (BACKEND ONLY)
//
// This is where a Bot stops narrating and starts doing. Every tool here
// performs a REAL action against the real internet and returns what
// actually came back. Nothing in this file invents a result.
//
// The contract that makes the product honest:
//   - a tool either succeeds and returns real `observation` text, or it
//     fails and says so. It never fabricates a plausible-looking answer.
//   - anything the user can check gets attached as `evidence` (a URL, a
//     file) so a claim in the reply can be traced to the thing that
//     produced it.
//
// Tools run server-side only. They are the Bot's hands.
// ============================================================

import { glmSearch } from '@/lib/llm-provider'
import type { Evidence } from '@/lib/grokbok-types'

export type { Evidence }

export interface ToolResult {
  ok: boolean
  /** What the model sees on its next turn. Real output, or a real error. */
  observation: string
  evidence: Evidence[]
  /** Short past-tense line for the activity feed, e.g. "Read developers.cloudflare.com". */
  summary: string
}

export interface ToolCall {
  tool: string
  [key: string]: unknown
}

// ---------- guards -------------------------------------------------------

const MAX_PAGE_CHARS = 6000
/**
 * JSON and other structured formats get a larger budget. Measured: a Bot read
 * api.github.com, whose repo JSON runs past 6000 chars, lost stargazers_count
 * to the clip, and invented a figure rather than saying it could not see one.
 * Prose tolerates truncation because the gist survives; a data document does
 * not, because the one field you wanted is usually the field that got cut.
 */
const MAX_DATA_CHARS = 20000
const FETCH_TIMEOUT_MS = 20000

/**
 * Block private/loopback targets so a Bot cannot be talked into probing the
 * host's own network. The Bot works on the public internet only.
 */
function isPubliclyRoutable(raw: string): { ok: true; url: URL } | { ok: false; why: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, why: 'that is not a valid URL' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, why: `unsupported protocol ${url.protocol}` }
  }
  const host = url.hostname.toLowerCase()
  const blocked =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if (blocked) return { ok: false, why: 'that address is on a private network' }
  return { ok: true, url }
}

/**
 * HTML → readable text. Deliberately dependency-free: strip the parts that
 * are never prose, drop tags, decode the handful of entities that actually
 * show up, collapse whitespace.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

// ---------- the tools ----------------------------------------------------

/** Live web search. Real ranked results with real URLs. */
async function webSearch(args: ToolCall): Promise<ToolResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return { ok: false, observation: 'web_search needs a "query".', evidence: [], summary: 'Search skipped — no query' }
  }

  try {
    const results = await glmSearch(query, 6)
    if (results.length === 0) {
      return {
        ok: true,
        observation: `No results for "${query}". Try different wording.`,
        evidence: [],
        summary: `Searched "${query}" — no results`,
      }
    }

    const lines = results.map(
      (r, i) => `${i + 1}. ${r.name}\n   ${r.url}\n   ${r.snippet}${r.date ? `  (${r.date})` : ''}`,
    )
    return {
      ok: true,
      observation: `Search results for "${query}":\n${lines.join('\n')}`,
      evidence: results.slice(0, 6).map((r) => ({ kind: 'url' as const, label: r.name || r.url, href: r.url })),
      summary: `Searched "${query}" — ${results.length} results`,
    }
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    return { ok: false, observation: `Search failed: ${why}`, evidence: [], summary: `Search failed — ${query}` }
  }
}

/** Fetch a real page and return its readable text. */
async function readUrl(args: ToolCall): Promise<ToolResult> {
  const raw = typeof args.url === 'string' ? args.url.trim() : ''
  if (!raw) {
    return { ok: false, observation: 'read_url needs a "url".', evidence: [], summary: 'Read skipped — no URL' }
  }

  const guard = isPubliclyRoutable(raw)
  if (!guard.ok) {
    return {
      ok: false,
      observation: `Refused to open ${raw} — ${guard.why}.`,
      evidence: [],
      summary: `Refused ${raw}`,
    }
  }
  const url = guard.url

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Identify honestly. Some sites will refuse us; that is a real result.
        'user-agent': 'BeuroBot/0.1 (+https://github.com/lordbasilaiassistant-sudo/beuro)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    const type = res.headers.get('content-type') ?? ''
    const body = await res.text()

    if (!res.ok) {
      return {
        ok: false,
        observation: `${url.href} returned HTTP ${res.status}. First of the body: ${body.slice(0, 300)}`,
        evidence: [{ kind: 'url', label: url.hostname, href: url.href }],
        summary: `${url.hostname} → HTTP ${res.status}`,
      }
    }

    const isHtml = /html/i.test(type)
    const text = isHtml ? htmlToText(body) : body.trim()
    const budget = isHtml ? MAX_PAGE_CHARS : MAX_DATA_CHARS
    if (!text) {
      return {
        ok: false,
        observation: `${url.href} loaded but contained no readable text (content-type ${type || 'unknown'}). It may render its content with JavaScript.`,
        evidence: [{ kind: 'url', label: url.hostname, href: url.href }],
        summary: `${url.hostname} — no readable text`,
      }
    }

    const clipped = text.length > budget
    const shown = clipped
      ? `${text.slice(0, budget)}\n…[truncated at ${budget} characters — say so rather than guessing at anything past this point]`
      : text

    return {
      ok: true,
      observation: `Content of ${url.href}:\n${shown}`,
      evidence: [{ kind: 'url', label: url.hostname, href: url.href }],
      summary: `Read ${url.hostname}${clipped ? ' (truncated)' : ''}`,
    }
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      observation: `Could not open ${url.href}: ${why}`,
      evidence: [],
      summary: `Failed to open ${url.hostname}`,
    }
  }
}

// ---------- registry -----------------------------------------------------

export interface ToolSpec {
  name: string
  /** Shown to the model. Keep it short — it is prompt budget. */
  usage: string
  run: (args: ToolCall) => Promise<ToolResult>
  /** The activity kind this tool produces in the feed. */
  kind: 'tool' | 'read'
  /**
   * True when running this tool changes something outside Beuro — sends a
   * message, spends money, publishes, deletes, alters a live system.
   *
   * The agent loop REFUSES to run a side-effecting tool without the user's
   * prior approval. That refusal is the gate, and it lives here rather than in
   * the prompt because a prompt-level gate is not a gate: asked to wire $5,000
   * or delete all records, the model raised the approval flag for neither.
   * A structural rule cannot be talked out of.
   *
   * Every tool today is read-only, so nothing is currently gated — but the
   * mechanism is in place and enforced before the first one lands.
   */
  sideEffecting?: boolean
}

export const TOOLS: ToolSpec[] = [
  {
    name: 'web_search',
    usage: '{"tool":"web_search","query":"what to search for"} — live web search, returns real ranked URLs.',
    run: webSearch,
    kind: 'tool',
  },
  {
    name: 'read_url',
    usage: '{"tool":"read_url","url":"https://…"} — opens a real page and returns its text.',
    run: readUrl,
    kind: 'read',
  },
]

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

/** The tool menu injected into the agent prompt, minus any switched-off tools. */
export function toolMenu(blocked?: ReadonlySet<string>): string {
  return TOOLS.filter((t) => !blocked?.has(t.name))
    .map((t) => `- ${t.usage}`)
    .join('\n')
}
