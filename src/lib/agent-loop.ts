// ============================================================
// Beuro — the agent loop (BACKEND ONLY)
//
// The Bot's working cycle: think → act → observe → repeat → answer.
// Every "act" is a real tool call against the real internet, and every
// observation is what genuinely came back.
//
// ── THE HONESTY RULE, ENFORCED HERE ──
// A step's text is written by the TOOL, never by the model. The model
// chooses *which* tool to run; the tool reports *what happened*. That is
// why a Bot cannot claim "Read 14 support tickets" when all it did was a
// web search — it does not get to write that line.
//
// Steps produced here carry `verified: true` and their evidence. Steps
// invented anywhere else must not. The UI renders the two differently, so
// this flag is the difference between a product and a puppet show.
// ============================================================

import { callLLM, extractJson, parseMemoryUpdates } from '@/lib/grokbok-llm'
import { TOOL_BY_NAME, toolMenu, type ToolCall } from '@/lib/tools'
import type { ActivityStep, Evidence } from '@/lib/grokbok-types'

/** Hard ceiling on tool calls per turn. Each one is latency and shared quota. */
const MAX_TURNS = 5
/** How many times one tool may run per task before it is switched off. */
const REPEAT_LIMIT = 2
/** How much of an observation we carry forward into the next prompt. */
const OBSERVATION_BUDGET = 3500

export interface AgentOutcome {
  reply: string
  /** Real actions, in order. Every one has `verified: true`. */
  steps: ActivityStep[]
  evidence: Evidence[]
  toolCalls: number
  /** True when at least one tool actually executed. */
  didRealWork: boolean
  /** Set when the loop could not get a usable decision out of the model. */
  brokeDown: boolean
  /** Durable facts worth remembering, supplied with the final answer. */
  memoryUpdates: string[]
  /** Set when finishing the job needs the user's sign-off first. */
  needsApproval: boolean
  approvalNote: string
}

interface Exchange {
  call: ToolCall
  observation: string
  ok: boolean
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text
}

/**
 * Ask the model for the next single action. Returns a parsed tool call, or
 * null when the model produced nothing usable.
 */
async function nextAction(
  system: string,
  task: string,
  history: Exchange[],
  turnsLeft: number,
  blocked: Set<string>,
): Promise<ToolCall | null> {
  const transcript =
    history.length === 0
      ? 'Nothing yet — this is your first action.'
      : history
          .map((h, i) => {
            const args = JSON.stringify({ ...h.call, tool: undefined })
            return `Action ${i + 1}: ${h.call.tool} ${args}\nResult: ${clip(h.observation, OBSERVATION_BUDGET)}`
          })
          .join('\n\n')

  const prompt = `Task from your teammate:
"""
${task}
"""

Your work so far:
${transcript}

Tools available:
${toolMenu(blocked)}${
    blocked.size > 0
      ? `
(${[...blocked].join(', ')} is switched off for the rest of this task — it stopped producing anything new.)`
      : ''
  }
- {"tool":"answer","reply":"...","memoryUpdates":[],"needsApproval":false,"approvalNote":""} — finish and reply.

Rules:
- Reply with ONE JSON object and nothing else. No prose, no code fences.
- Use the tools to find out what you do not already know. Do not guess a URL's
  contents — open it.
- State facts ONLY if they appear in a Result above. If the results do not
  support an answer, say so plainly in your reply.
- You have ${turnsLeft} action${turnsLeft === 1 ? '' : 's'} left before you must answer.
- When you have enough, use "answer".
- If the task needs something only the user's own private systems hold — their
  inbox, bank balance, CRM, internal files — you cannot reach it. Say so with
  "answer" straight away. Searching the public web for it wastes the turn and
  the answer is not out there.
- Do not repeat a search that already came back unhelpful. Change approach or
  answer.

On the "answer" action:
- "reply": 1-4 sentences in your own voice, grounded in the Results above.
- "memoryUpdates": 0-3 short durable facts about this person, their company or
  their preferences. Not task trivia. Empty array if nothing lasting.
- "needsApproval": true if finishing would send a message to someone else, spend
  money, publish externally, sign something, delete data, or make a hiring call.
  Then STOP before doing it, say it is ready and waiting for sign-off, and put one
  line in "approvalNote". Otherwise false.`

  let raw: string
  try {
    raw = await callLLM(system, prompt, 60000)
  } catch {
    return null
  }

  try {
    const parsed = extractJson<Record<string, unknown>>(raw)
    const tool = typeof parsed.tool === 'string' ? parsed.tool.trim() : ''
    if (tool) return { ...parsed, tool } as ToolCall

    // Well-formed JSON, wrong envelope. Models reliably produce a few variants
    // of "I am finished" — {"answer":{...}}, {"answer":"text"}, or a bare
    // {"reply":"..."} — and rejecting them threw away good answers and showed
    // canned steps instead. Accept the shapes we actually see.
    const nested = parsed.answer ?? parsed.result ?? parsed.response
    if (typeof nested === 'string' && nested.trim()) {
      return { tool: 'answer', reply: nested.trim() }
    }
    if (nested && typeof nested === 'object') {
      return { ...(nested as Record<string, unknown>), tool: 'answer' } as ToolCall
    }
    if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
      return { ...parsed, tool: 'answer' } as ToolCall
    }

    // A tool name used as the key: {"web_search":{"query":"…"}}.
    for (const name of TOOL_BY_NAME.keys()) {
      const args = parsed[name]
      if (args && typeof args === 'object') {
        return { ...(args as Record<string, unknown>), tool: name } as ToolCall
      }
    }
  } catch {
    /* not JSON — see below */
  }

  // The model often just *answers* in prose instead of wrapping it in the
  // envelope, most commonly when the honest reply is "I can't reach that".
  // Discarding it threw away a good answer and showed canned steps instead,
  // so treat clean prose as the answer it plainly is.
  const prose = raw.trim()
  if (prose && !prose.includes('{') && prose.length <= 1200) {
    return { tool: 'answer', reply: prose }
  }
  console.warn(`[agent-loop] unusable model output (${prose.length} chars): ${prose.slice(0, 200)}`)
  return null
}

/**
 * Run the loop. Never throws — a broken model or a dead tool degrades into an
 * honest outcome the caller can render, rather than a 500.
 */
export async function runAgentLoop(
  system: string,
  task: string,
  /** Tool names the user has already approved for this turn. */
  approvedActions: ReadonlySet<string> = new Set(),
): Promise<AgentOutcome> {
  const history: Exchange[] = []
  // Relying on the model to stop repeating itself does not work — measured, it
  // kept firing near-identical searches for private data that is not on the
  // public web. So the cap is enforced here instead of asked for.
  const useCount = new Map<string, number>()
  const blocked = new Set<string>()
  const steps: ActivityStep[] = []
  const evidence: Evidence[] = []
  let reply = ''
  let brokeDown = false
  let memoryUpdates: string[] = []
  let needsApproval = false
  let approvalNote = ''

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const action = await nextAction(system, task, history, MAX_TURNS - turn, blocked)

    if (!action) {
      brokeDown = true
      break
    }

    // Finished.
    if (action.tool === 'answer' || action.tool === 'done') {
      const text = typeof action.reply === 'string' ? action.reply.trim() : ''
      if (text) reply = text
      memoryUpdates = parseMemoryUpdates(action.memoryUpdates)
      needsApproval = action.needsApproval === true
      approvalNote =
        typeof action.approvalNote === 'string' ? action.approvalNote.trim().slice(0, 300) : ''
      break
    }

    const spec = TOOL_BY_NAME.get(action.tool)
    if (!spec) {
      // Unknown tool: tell the model plainly and let it correct itself. This
      // counts as a turn so a confused model cannot spin forever.
      history.push({
        call: action,
        observation: `There is no tool called "${action.tool}". Available: ${[...TOOL_BY_NAME.keys()].join(', ')}, answer.`,
        ok: false,
      })
      continue
    }

    // ── STRUCTURAL APPROVAL GATE ──
    // A tool that changes the outside world does not run on the model's say-so.
    // Measured why this cannot live in the prompt: told to wire $5,000 and to
    // delete all records — both named explicitly in the approval policy — the
    // model set needsApproval on neither. Here it has no choice.
    if (spec.sideEffecting && !approvedActions.has(spec.name)) {
      history.push({
        call: action,
        observation:
          `${spec.name} changes things outside Beuro, so it needs your teammate's approval first. ` +
          `Stop here, use "answer" with needsApproval true, and say in approvalNote exactly what you intend to do.`,
        ok: false,
      })
      needsApproval = true
      approvalNote = approvalNote || `Run ${spec.name}`
      continue
    }

    const result = await spec.run(action)

    const used = (useCount.get(spec.name) ?? 0) + 1
    useCount.set(spec.name, used)
    if (used >= REPEAT_LIMIT) blocked.add(spec.name)

    history.push({ call: action, observation: result.observation, ok: result.ok })
    steps.push({
      kind: spec.kind,
      // The tool's words, not the model's. This is the honesty guarantee.
      text: result.summary.slice(0, 240),
      evidence: result.evidence.length > 0 ? result.evidence : undefined,
      verified: true,
    })
    for (const e of result.evidence) {
      if (!evidence.some((x) => x.href === e.href)) evidence.push(e)
    }
  }

  const didRealWork = steps.length > 0

  // No reply yet, but real tool results are sitting in `history`. This happens
  // when the model fumbles a JSON turn (brokeDown) or spends every turn on
  // tools. Either way the findings are real and throwing them away would be
  // the worst outcome — so summarise from the observations. This is a plain
  // prose call, which a model that just failed at JSON can still manage.
  if (!reply && didRealWork) {
    const findings = history
      .map((h, i) => `Action ${i + 1} (${h.call.tool}):\n${clip(h.observation, OBSERVATION_BUDGET)}`)
      .join('\n\n')
    try {
      reply = (
        await callLLM(
          system,
          `Task: ${task}\n\nEverything you found:\n${findings}\n\nReply to your teammate now, in 1-4 sentences. Use ONLY facts present above. If they do not answer the task, say what you could not determine. Plain text, no JSON.`,
          45000,
        )
      ).trim()
    } catch {
      reply = ''
    }
    // The findings were real even though the model stumbled getting here.
    if (reply) brokeDown = false
  }

  if (!reply) {
    reply = didRealWork
      ? "I did the legwork but couldn't pull it into an answer — the notes are in my computer log."
      : "I couldn't get this one moving. Nothing ran, so I have nothing to report."
    brokeDown = true
  }

  // ── GROUNDING CHECK ──
  // `verified` certifies that an ACTION ran. It says nothing about whether the
  // reply drawn from it is true, and those are different claims. Measured: a
  // Bot really did read api.github.com, where stargazers_count is 119959 and
  // appears three times in what it fetched — and reported 105698, a number
  // present nowhere in the page. The free rail is weak at exact extraction
  // (our own bench scores glm-4.5-flash 0% on schema extraction), so a
  // plausible wrong figure is the expected failure, not a freak one.
  //
  // So: any sizeable figure in the reply must actually appear in something the
  // Bot read. If it does not, say so where the user will see it rather than
  // letting a fabricated number ride on a genuinely-verified step.
  if (didRealWork && reply) {
    const ungrounded = ungroundedFigures(reply, history)
    if (ungrounded.length > 0) {
      steps.push({
        kind: 'think',
        text: `Check before relying on this: ${ungrounded.slice(0, 3).join(', ')} ${
          ungrounded.length === 1 ? 'was' : 'were'
        } not found in the sources I opened.`,
      })
    }
  }

  if (didRealWork) {
    steps.push({ kind: 'done', text: 'Finished — findings below.', verified: true })
  }

  return {
    reply,
    steps,
    evidence,
    toolCalls: steps.filter((s) => s.kind !== 'done').length,
    didRealWork,
    brokeDown,
    memoryUpdates,
    needsApproval,
    approvalNote,
  }
}

/** Digits only, so "119,959" · "119959" · "119.959" all compare equal. */
function digitsOf(s: string): string {
  return s.replace(/[^\d]/g, '')
}

/**
 * Figures asserted in the reply that appear in none of the observations.
 *
 * Only numbers of 3+ digits are checked: those are the specific claims worth
 * doubting (counts, prices, versions), while small numbers are usually prose
 * ("3 options") and would be noise. Years are skipped for the same reason.
 */
function ungroundedFigures(reply: string, history: Exchange[]): string[] {
  const haystack = digitsOf(history.map((h) => h.observation).join(' '))
  if (!haystack) return []

  const out: string[] = []
  for (const match of reply.match(/\d[\d,.]{2,}/g) ?? []) {
    // Trailing separators are sentence punctuation, not part of the figure.
    const raw = match.replace(/[.,]+$/, '')
    const digits = digitsOf(raw)
    if (digits.length < 3) continue
    // A bare 4-digit year is nearly always narrative, not a claim under test.
    if (/^(19|20)\d{2}$/.test(digits)) continue
    if (haystack.includes(digits)) continue
    if (!out.includes(raw)) out.push(raw)
  }
  return out
}
