// ============================================================
// GrokBok — LLM provider layer (BACKEND ONLY)
//
// Replaces the sandbox-only `z-ai-web-dev-sdk` with plain fetch, so this
// repo runs anywhere: a laptop, a VPS, a container — with NO API key at all
// on the default rail, or against any OpenAI-compatible endpoint you own.
//
// Two providers, chosen by env:
//
//   GLM   (default, keyless)  LLM_PROVIDER=glm
//         Free chat via a Z.ai-hosted Web Dev SDK deployment. The platform
//         supplies model access, so there is no key and no account. Override
//         the host with GLM_BASE — it is a preview domain and does rotate.
//
//   OPENAI-COMPATIBLE          LLM_PROVIDER=openai
//         Anything speaking POST /chat/completions: Z.ai's paid API, Groq,
//         OpenRouter, Ollama, vLLM, OpenAI itself.
//         Needs LLM_BASE_URL, LLM_MODEL, and usually LLM_API_KEY.
//
// ⚠️ THE FREE RAIL IS SERIAL. Measured 2026-08-28 against the live
// deployment: concurrency 1 → 1/1, 2 → 2/2, 3 → 2/3, 4 → 0/4. Worse, a burst
// of ten parallel calls rate-limited the WHOLE deployment for over 60s across
// every endpoint — the quota is shared, and we are a guest on it. So every
// request in this process goes through one queue with a floor gap, and a
// rate-limit backs off hard instead of hammering. Never Promise.all this.
//
// ⚠️ An upstream 429 is relayed as HTTP 500 with "status 429" in the BODY,
// so status codes alone mislead. isRateLimited() reads the body.
// ============================================================

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const PROVIDER = (process.env.LLM_PROVIDER || 'glm').toLowerCase()

const GLM_BASE = process.env.GLM_BASE || 'https://k1y9z7g5f8m0-d.space-z.ai'

const OPENAI_BASE = (process.env.LLM_BASE_URL || 'https://api.z.ai/api/paas/v4').replace(/\/+$/, '')
const OPENAI_KEY = process.env.LLM_API_KEY || ''
const OPENAI_MODEL = process.env.LLM_MODEL || 'glm-4-flash'

/** Floor gap between calls on the shared free rail. */
const MIN_GAP_MS = Number(process.env.LLM_MIN_GAP_MS || 400)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- serial queue -------------------------------------------------------
// One chain per process. Next.js may hold several route invocations at once;
// this makes them line up rather than burst the shared quota.
let chainTail: Promise<unknown> = Promise.resolve()
let lastFinish = 0

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chainTail.then(async () => {
    const gap = MIN_GAP_MS - (Date.now() - lastFinish)
    if (gap > 0) await sleep(gap)
    try {
      return await job()
    } finally {
      lastFinish = Date.now()
    }
  })
  // Keep the chain alive even when a job rejects.
  chainTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run as Promise<T>
}

/** True when the body carries an upstream rate-limit, whatever the status says. */
export function isRateLimited(status: number | string, bodyText: string): boolean {
  return status === 429 || /status 429|too many requests|rate limit/i.test(String(bodyText || ''))
}

// ---- providers ----------------------------------------------------------

async function glmChat(messages: ChatMessage[], timeoutMs: number): Promise<string> {
  // The rail takes `system` separately from the message history.
  const system = messages.find((m) => m.role === 'system')?.content
  const history = messages.filter((m) => m.role !== 'system')

  const body: Record<string, unknown> = { messages: history }
  if (system) body.system = system

  const retries = 3
  let lastErr = 'glm: request failed'

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let status: number | string = 'ERR'
    let text = ''
    try {
      const res = await fetch(`${GLM_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      status = res.status
      text = await res.text()
    } catch (err) {
      lastErr = `glm: ${err instanceof Error ? err.message : String(err)}`
    }

    if (status === 200) {
      let json: { success?: boolean; content?: string; error?: string } | null = null
      try {
        json = JSON.parse(text)
      } catch {
        /* non-JSON 200 — fall through to the error below */
      }
      if (json?.success === false) throw new Error(`glm: ${json.error || 'success:false'}`)
      const content = json?.content ?? ''
      if (content.trim()) return content
      lastErr = 'glm: empty response'
    } else if (isRateLimited(status, text)) {
      // Measured: the lockout outlasts a minute of polling, so short retries
      // are actively harmful — each is another request against an angry limit.
      lastErr = 'glm: upstream rate limit (the quota is shared deployment-wide)'
      if (attempt < retries) {
        await sleep(5000 * 2 ** attempt)
        continue
      }
    } else if (status === 502 || status === 503 || status === 504) {
      lastErr = `glm: upstream ${status}`
      if (attempt < retries) {
        await sleep(2000 * (attempt + 1))
        continue
      }
    } else if (status !== 'ERR') {
      throw new Error(`glm: HTTP ${status} ${text.slice(0, 200)}`)
    }

    if (attempt < retries) await sleep(1000 * (attempt + 1))
  }

  throw new Error(lastErr)
}

async function openAiChat(messages: ChatMessage[], timeoutMs: number): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (OPENAI_KEY) headers.authorization = `Bearer ${OPENAI_KEY}`

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: OPENAI_MODEL, messages, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`llm: HTTP ${res.status} ${text.slice(0, 200)}`)

  let json: { choices?: Array<{ message?: { content?: string } }> }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('llm: provider returned non-JSON')
  }

  const content = json.choices?.[0]?.message?.content ?? ''
  if (!content.trim()) throw new Error('llm: provider returned an empty response')
  return content
}

// ---- public entry point -------------------------------------------------

/**
 * One chat round-trip, serialised and retried. Resolves with the raw text;
 * rejects on error/timeout — callers own their fallbacks.
 */
export function chatCompletion(messages: ChatMessage[], timeoutMs = 60000): Promise<string> {
  return enqueue(() =>
    PROVIDER === 'openai' ? openAiChat(messages, timeoutMs) : glmChat(messages, timeoutMs),
  )
}

// ---- live web search ----------------------------------------------------

export interface SearchResult {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date: string
}

/**
 * Real web search via the GLM rail's search endpoint. Returns genuine ranked
 * results — url, title, snippet, date — not model recall.
 *
 * This shares the SAME serial queue as chat, deliberately: the rate limit is
 * per deployment across every endpoint, so a search burst would lock chat out
 * too. Search is available regardless of LLM_PROVIDER, since it is the rail's
 * own capability rather than a chat completion.
 */
export function glmSearch(query: string, num = 6): Promise<SearchResult[]> {
  return enqueue(async () => {
    const res = await fetch(`${GLM_BASE}/api/ai/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: String(query), num }),
      signal: AbortSignal.timeout(60000),
    })

    const text = await res.text()
    if (isRateLimited(res.status, text)) {
      throw new Error('search: upstream rate limit (the quota is shared deployment-wide)')
    }
    if (!res.ok) throw new Error(`search: HTTP ${res.status} ${text.slice(0, 160)}`)

    let json: { success?: boolean; results?: SearchResult[]; error?: string }
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error('search: rail returned non-JSON')
    }
    if (json.success === false) throw new Error(`search: ${json.error || 'success:false'}`)
    return Array.isArray(json.results) ? json.results : []
  })
}

/** Which rail is live — surfaced by GET /api for diagnostics. */
export function providerInfo() {
  return PROVIDER === 'openai'
    ? { provider: 'openai-compatible', baseUrl: OPENAI_BASE, model: OPENAI_MODEL, keyed: Boolean(OPENAI_KEY) }
    : { provider: 'glm-free', baseUrl: GLM_BASE, model: 'platform-supplied', keyed: false }
}
