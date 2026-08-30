'use client'

// ============================================================
// Beuro workspace state hook (zustand singleton).
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
  AuthResponse,
  AuthUser,
  Bot,
  ChatMessage,
  ConnectionResponse,
  ConnectionsResponse,
  CreateBotInput,
  CreateConnectionInput,
  CreateRoutineInput,
  ErrorResponse,
  LoginInput,
  MeResponse,
  Routine,
  RunRoutineInput,
  SendChatInput,
  SignupInput,
  Thread,
  ToggleRoutineInput,
} from '@/lib/grokbok-types'

// ---------- live "working" signal ----------
//
// This used to tick a hardcoded list of invented steps ("Signing in to
// workspace tools…") into the Computer terminal while a request was in
// flight. None of it was real, and it sat in the exact pane whose whole job
// is to show what the Bot is actually doing.
//
// Real steps now come back from the server, written by the tools that ran.
// While we wait, we show only something we genuinely know: that it started,
// and how long ago. No invented actions.

// ---------- internal state ----------

interface GrokbokState {
  me: AuthUser | null
  authChecked: boolean
  state: AppState | null
  loading: boolean
  error: string | null
  activeThreadId: string | null
  workingBotIds: string[]
  /** botId → epoch ms when this bot started the current turn. */
  workingSinceByBot: Record<string, number>
  loadMe: () => Promise<void>
  signup: (input: SignupInput) => Promise<boolean>
  login: (input: LoginInput) => Promise<boolean>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  openThread: (threadId: string) => void
  sendMessage: (content: string) => Promise<void>
  decide: (messageId: string, decision: ApprovalInput['decision']) => Promise<void>
  createBot: (input: CreateBotInput) => Promise<boolean>
  deleteBot: (botId: string) => Promise<boolean>
  createThread: (botIds: string[], title?: string) => Promise<boolean>
  createRoutine: (botId: string, description: string) => Promise<boolean>
  toggleRoutine: (routineId: string, enabled: boolean) => Promise<boolean>
  runRoutine: (routineId: string) => Promise<boolean>
  addConnection: (input: CreateConnectionInput) => Promise<boolean>
  deleteConnection: (connectionId: string) => Promise<boolean>
  stopAllWork: () => void
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
  const markWorking = (botIds: string[]) => {
    const now = Date.now()
    set((s) => {
      const next = { ...s.workingSinceByBot }
      for (const id of botIds) next[id] = now
      return { workingSinceByBot: next }
    })
  }

  const clearWorking = (botIds: string[]) => {
    set((s) => {
      const next = { ...s.workingSinceByBot }
      for (const id of botIds) delete next[id]
      return { workingSinceByBot: next }
    })
  }

  return {
    me: null,
    authChecked: false,
    state: null,
    loading: false,
    error: null,
    activeThreadId: null,
    workingBotIds: [],
    workingSinceByBot: {},

    loadMe: async () => {
      try {
        const res = await fetch('/api/auth/me')
        const data = (await res.json().catch(() => null)) as MeResponse | null
        set({ me: data?.user ?? null, authChecked: true })
      } catch {
        set({ me: null, authChecked: true })
      }
    },

    signup: async (input) => {
      try {
        const data = await apiJson<AuthResponse>('/api/auth/signup', input)
        set({ me: data.user, state: null, activeThreadId: null })
        toast.success(`Welcome to Beuro, ${data.user.name.split(' ')[0]}`)
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create the account')
        return false
      }
    },

    login: async (input) => {
      try {
        const data = await apiJson<AuthResponse>('/api/auth/login', input)
        set({ me: data.user, state: null, activeThreadId: null })
        toast.success(`Welcome back, ${data.user.name.split(' ')[0]}`)
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not sign in')
        return false
      }
    },

    logout: async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' })
      } catch {
        /* clear locally regardless */
      }
      clearWorking(Object.keys(get().workingSinceByBot))
      set({
        me: null,
        state: null,
        activeThreadId: null,
        workingBotIds: [],
        workingSinceByBot: {},
      })
      toast.success('Signed out')
    },

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
      markWorking(members)

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
        clearWorking(members)
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
      if (botId) markWorking([botId])

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
        if (botId) clearWorking([botId])
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

    deleteBot: async (botId) => {
      const bot = get().state?.bots.find((b) => b.id === botId)
      if (!bot) return false
      try {
        const res = await fetch(`/api/bots?id=${encodeURIComponent(botId)}`, { method: 'DELETE' })
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => null)
          throw new Error((data as ErrorResponse | null)?.error ?? 'Could not remove the bot')
        }
        await get().refresh()
        toast.success(`${bot.name} has been removed from your team`)
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove the bot')
        return false
      }
    },

    addConnection: async (input) => {
      try {
        const data = await apiJson<ConnectionResponse>('/api/connections', input)
        await get().refresh()
        toast.success(`${data.connection.name} connected`, {
          description: 'Your bots can now work with this tool.',
        })
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not add the connection')
        return false
      }
    },

    deleteConnection: async (connectionId) => {
      try {
        const res = await fetch(`/api/connections?id=${encodeURIComponent(connectionId)}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => null)
          throw new Error((data as ErrorResponse | null)?.error ?? 'Could not remove the connection')
        }
        await get().refresh()
        toast.success('Connection removed')
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove the connection')
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
      markWorking([botId])

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
        clearWorking([botId])
        set({ workingBotIds: [] })
      }
    },

    stopAllWork: () => {
      clearWorking(Object.keys(get().workingSinceByBot))
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
