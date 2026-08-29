'use client'

// ============================================================
// GrokBok workspace state hook (zustand singleton).
// Owns: AppState fetch, thread selection, optimistic messaging,
// approval decisions, bot/thread/routine creation, and the
// simulated "Computer" activity ticker that keeps the UI alive.
// ============================================================

import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  ActivityStep,
  ApprovalInput,
  AppState,
  Bot,
  ChatMessage,
  CreateBotInput,
  CreateRoutineInput,
  ErrorResponse,
  Routine,
  RunRoutineInput,
  SendChatInput,
  Thread,
  ToggleRoutineInput,
} from '@/lib/grokbok-types'

// ---------- simulated computer activity ----------

const STEP_POOL: ActivityStep[] = [
  { kind: 'signin', text: 'Signing in to workspace tools…' },
  { kind: 'read', text: 'Reading the latest context…' },
  { kind: 'think', text: 'Planning the approach…' },
  { kind: 'tool', text: 'Working through the request…' },
  { kind: 'write', text: 'Drafting the update…' },
  { kind: 'think', text: 'Double-checking the details…' },
  { kind: 'done', text: 'Wrapping up…' },
]

const SIM_TICK_MS = 900
const SIM_LOG_MAX = 7

// ---------- internal state ----------

interface GrokbokState {
  state: AppState | null
  loading: boolean
  error: string | null
  activeThreadId: string | null
  workingBotIds: string[]
  pendingStepsByBot: Record<string, ActivityStep[]>
  refresh: () => Promise<void>
  openThread: (threadId: string) => void
  sendMessage: (content: string) => Promise<void>
  decide: (messageId: string, decision: ApprovalInput['decision']) => Promise<void>
  createBot: (input: CreateBotInput) => Promise<boolean>
  createThread: (botIds: string[], title?: string) => Promise<boolean>
  createRoutine: (botId: string, description: string) => Promise<boolean>
  toggleRoutine: (routineId: string, enabled: boolean) => Promise<boolean>
  runRoutine: (routineId: string) => Promise<boolean>
  stopSimulations: () => void
}

/** What the workspace components consume. */
export type GrokbokStore = GrokbokState & {
  activeThread: Thread | null
  threadsForSidebar: Thread[]
  botById: (botId: string) => Bot | undefined
}

// ---------- helpers ----------

async function apiJson<T>(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (data as ErrorResponse | null)?.error
    throw new Error(message ?? `Request failed (${res.status})`)
  }
  return data as T
}

function newestThreadId(state: AppState): string | null {
  if (state.threads.length === 0) return null
  const sorted = [...state.threads].sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
  )
  return sorted[0].id
}

function sortByUpdatedDesc(a: Thread, b: Thread): number {
  return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
}

// ---------- store ----------

const useGrokbokBase = create<GrokbokState>()((set, get) => {
  const simTimers = new Map<string, ReturnType<typeof setInterval>>()
  const simIndexes = new Map<string, number>()

  const stopSimulation = (botId: string, clearLog: boolean) => {
    const timer = simTimers.get(botId)
    if (timer) {
      clearInterval(timer)
      simTimers.delete(botId)
    }
    simIndexes.delete(botId)
    if (clearLog) {
      set((s) => {
        if (!(botId in s.pendingStepsByBot)) return s
        const next = { ...s.pendingStepsByBot }
        delete next[botId]
        return { pendingStepsByBot: next }
      })
    }
  }

  const startSimulation = (botIds: string[]) => {
    for (const botId of botIds) {
      stopSimulation(botId, true)
      simIndexes.set(botId, 0)
      set((s) => ({ pendingStepsByBot: { ...s.pendingStepsByBot, [botId]: [] } }))
      const timer = setInterval(() => {
        const nextIndex = (simIndexes.get(botId) ?? 0) + 1
        simIndexes.set(botId, nextIndex)
        const step = STEP_POOL[(nextIndex - 1) % STEP_POOL.length]
        set((s) => {
          const log = s.pendingStepsByBot[botId] ?? []
          return {
            pendingStepsByBot: {
              ...s.pendingStepsByBot,
              [botId]: [...log, step].slice(-SIM_LOG_MAX),
            },
          }
        })
      }, SIM_TICK_MS)
      simTimers.set(botId, timer)
    }
  }

  return {
    state: null,
    loading: false,
    error: null,
    activeThreadId: null,
    workingBotIds: [],
    pendingStepsByBot: {},

    refresh: async () => {
      const isFirstLoad = !get().state
      if (isFirstLoad) set({ loading: true, error: null })
      try {
        const res = await fetch('/api/state')
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          const message = (data as ErrorResponse | null)?.error
          throw new Error(message ?? `Failed to load workspace (${res.status})`)
        }
        const next = data as AppState
        set((s) => {
          const keep = s.activeThreadId && next.threads.some((t) => t.id === s.activeThreadId)
          return {
            state: next,
            loading: false,
            error: null,
            activeThreadId: keep ? s.activeThreadId : newestThreadId(next),
          }
        })
      } catch (err) {
        set({
          loading: false,
          error: err instanceof Error ? err.message : 'Something went wrong',
        })
      }
    },

    openThread: (threadId) => set({ activeThreadId: threadId }),

    sendMessage: async (content) => {
      const text = content.trim()
      const s = get()
      const thread = s.state?.threads.find((t) => t.id === s.activeThreadId)
      if (!text || !thread || s.workingBotIds.length > 0) return

      const members = [...thread.botIds]
      const tempId = `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const optimistic: ChatMessage = {
        id: tempId,
        threadId: thread.id,
        role: 'user',
        botId: null,
        content: text,
        activity: [],
        needsApproval: false,
        approvalStatus: 'none',
        approvalNote: '',
        createdAt: new Date().toISOString(),
      }

      set((st) => ({
        state: st.state
          ? {
              ...st.state,
              threads: st.state.threads.map((t) =>
                t.id === thread.id
                  ? { ...t, messages: [...t.messages, optimistic], updatedAt: optimistic.createdAt }
                  : t,
              ),
            }
          : st.state,
        workingBotIds: members,
      }))
      startSimulation(members)

      try {
        const body: SendChatInput = { threadId: thread.id, content: text }
        await apiJson('/api/chat', body)
        await get().refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Message failed to send')
        set((st) => ({
          state: st.state
            ? {
                ...st.state,
                threads: st.state.threads.map((t) =>
                  t.id === thread.id
                    ? { ...t, messages: t.messages.filter((m) => m.id !== tempId) }
                    : t,
                ),
              }
            : st.state,
        }))
      } finally {
        members.forEach((id) => stopSimulation(id, true))
        set({ workingBotIds: [] })
      }
    },

    decide: async (messageId, decision) => {
      const s = get()
      const thread = s.state?.threads.find((t) => t.id === s.activeThreadId)
      const message = thread?.messages.find((m) => m.id === messageId)
      if (!thread || !message || message.approvalStatus !== 'pending') return

      const botId = message.botId
      set((st) => ({
        state: st.state
          ? {
              ...st.state,
              threads: st.state.threads.map((t) =>
                t.id === thread.id
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === messageId ? { ...m, approvalStatus: decision } : m,
                      ),
                    }
                  : t,
              ),
            }
          : st.state,
        workingBotIds: botId ? [botId] : [],
      }))
      if (botId) startSimulation([botId])

      try {
        const body: ApprovalInput = { threadId: thread.id, messageId, decision }
        await apiJson('/api/chat', body)
        await get().refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not record your decision')
        set((st) => ({
          state: st.state
            ? {
                ...st.state,
                threads: st.state.threads.map((t) =>
                  t.id === thread.id
                    ? {
                        ...t,
                        messages: t.messages.map((m) =>
                          m.id === messageId ? { ...m, approvalStatus: 'pending' as const } : m,
                        ),
                      }
                    : t,
                ),
              }
            : st.state,
        }))
      } finally {
        if (botId) stopSimulation(botId, true)
        set({ workingBotIds: [] })
      }
    },

    createBot: async (input) => {
      try {
        const data = await apiJson<{ bot: Bot }>('/api/bots', input)
        await get().refresh()
        toast.success(`${data.bot.name} joined your team`, { description: data.bot.role })
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create bot')
        return false
      }
    },

    createThread: async (botIds, title) => {
      if (botIds.length === 0) return false
      try {
        const data = await apiJson<{ thread: Thread }>(
          '/api/threads',
          title ? { botIds, title } : { botIds },
        )
        await get().refresh()
        set({ activeThreadId: data.thread.id })
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not start the chat')
        return false
      }
    },

    createRoutine: async (botId, description) => {
      const text = description.trim()
      if (!text) return false
      try {
        const body: CreateRoutineInput = { botId, description: text }
        const data = await apiJson<{ routine: Routine }>('/api/routines', body)
        await get().refresh()
        toast.success(`${data.routine.title} scheduled`, { description: data.routine.schedule })
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save the routine')
        return false
      }
    },

    toggleRoutine: async (routineId, enabled) => {
      try {
        const body: ToggleRoutineInput = { id: routineId, enabled }
        await apiJson('/api/routines', body, 'PATCH')
        await get().refresh()
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update the routine')
        return false
      }
    },

    runRoutine: async (routineId) => {
      const s = get()
      let routine: Routine | undefined
      for (const bot of s.state?.bots ?? []) {
        const found = bot.routines.find((r) => r.id === routineId)
        if (found) {
          routine = found
          break
        }
      }
      if (!routine) return false

      const botId = routine.botId
      set({ workingBotIds: [botId] })
      startSimulation([botId])

      try {
        const body: RunRoutineInput = { routineId }
        await apiJson('/api/routines/run', body)
        await get().refresh()
        const botName = get().state?.bots.find((b) => b.id === botId)?.name ?? 'Bot'
        const dm = get().state?.threads.find(
          (t) => !t.isGroup && t.botIds.length === 1 && t.botIds[0] === botId,
        )
        if (dm) set({ activeThreadId: dm.id })
        toast.success(`${botName} finished “${routine.title}”`)
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Routine run failed')
        return false
      } finally {
        stopSimulation(botId, true)
        set({ workingBotIds: [] })
      }
    },

    stopSimulations: () => {
      for (const botId of [...simTimers.keys()]) stopSimulation(botId, true)
      set({ workingBotIds: [] })
    },
  }
})

// ---------- public hook with derived helpers ----------

export function useGrokbok(): GrokbokStore {
  const core = useGrokbokBase()
  const { state, activeThreadId } = core

  const activeThread = useMemo<Thread | null>(
    () => state?.threads.find((t) => t.id === activeThreadId) ?? null,
    [state, activeThreadId],
  )

  const threadsForSidebar = useMemo<Thread[]>(() => {
    if (!state) return []
    return [...state.threads].sort(sortByUpdatedDesc)
  }, [state])

  const botById = useCallback(
    (botId: string) => state?.bots.find((b) => b.id === botId),
    [state],
  )

  return { ...core, activeThread, threadsForSidebar, botById }
}
