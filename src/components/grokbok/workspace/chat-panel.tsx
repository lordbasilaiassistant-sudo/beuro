'use client'

// ============================================================
// ChatPanel — the conversation surface.
// Bot messages carry a "Computer log" activity strip and
// approval cards; while bots work, live step text streams in.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  KeyRound,
  MessageSquare,
  PanelRight,
  PenLine,
  Plus,
  SendHorizontal,
  ShieldAlert,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { ActivityKind, ActivityStep, Bot, ChatMessage } from '@/lib/grokbok-types'
import { cn } from '@/lib/utils'
import type { GrokbokStore } from './use-grokbok'

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  signin: KeyRound,
  think: Brain,
  read: BookOpen,
  write: PenLine,
  tool: Wrench,
  done: CheckCircle2,
}

const messageEntrance = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
}

// ---------- activity strip ----------

function ActivityStrip({ steps }: { steps: ActivityStep[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? steps : steps.slice(0, 3)
  const hidden = expanded ? 0 : Math.max(0, steps.length - 3)

  return (
    <div className="mt-2 flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">
        Computer log
      </span>
      {visible.map((step, i) => {
        const Icon = KIND_ICON[step.kind] ?? Brain
        // A step that really executed is stated plainly and carries links you
        // can open. A narrated one is dimmed and italic, because nothing
        // checked it. The two must never look alike.
        const real = step.verified === true
        return (
          <span
            key={`${i}-${step.text}`}
            className={cn(
              'flex items-start gap-2 text-xs leading-relaxed',
              !real && 'italic text-zinc-500',
              real && (step.kind === 'done' ? 'text-emerald-300/90' : 'text-zinc-300'),
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 size-3 shrink-0',
                real ? (step.kind === 'done' ? 'text-emerald-400' : 'text-zinc-400') : 'text-zinc-600',
              )}
            />
            <span className="min-w-0">
              {step.text}
              {step.evidence && step.evidence.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                  {step.evidence.map((e) => (
                    <a
                      key={e.href}
                      href={e.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={e.href}
                      className="max-w-[220px] truncate rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline"
                    >
                      {e.label}
                    </a>
                  ))}
                </span>
              )}
            </span>
          </span>
        )
      })}
      {steps.some((s) => s.verified !== true) && (
        <span className="mt-1 text-[10px] text-zinc-600">
          Italic steps are described, not verified.
        </span>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="cursor-pointer self-start text-[11px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300 hover:underline"
        >
          +{hidden} more steps
        </button>
      )}
    </div>
  )
}

// ---------- approval ----------

function ApprovalCard({
  message,
  busy,
  onDecide,
}: {
  message: ChatMessage
  busy: boolean
  onDecide: (decision: 'approved' | 'rejected') => void
}) {
  return (
    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-amber-100/90">
          {message.approvalNote || message.content}
        </p>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onDecide('approved')}
          className="h-7 bg-white px-3 text-xs text-black hover:bg-zinc-200"
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onDecide('rejected')}
          className="h-7 border border-zinc-800 bg-transparent px-3 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white"
        >
          Reject
        </Button>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-amber-500/70">
          Needs your call
        </span>
      </div>
    </div>
  )
}

// ---------- messages ----------

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <motion.div {...messageEntrance} className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm leading-relaxed text-zinc-100">
        {message.content}
      </div>
    </motion.div>
  )
}

function BotMessage({
  message,
  bot,
  busy,
  onDecide,
}: {
  message: ChatMessage
  bot: Bot
  busy: boolean
  onDecide: (messageId: string, decision: 'approved' | 'rejected') => void
}) {
  return (
    <motion.div {...messageEntrance} className="flex justify-start">
      <div className="flex max-w-[85%] gap-2.5">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm">
          {bot.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-zinc-100">{bot.name}</span>
            <span className="truncate text-[11px] text-zinc-600">Bot · {bot.role}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
            {message.content}
          </p>
          {message.activity.length > 0 && <ActivityStrip steps={message.activity} />}
          {message.needsApproval && message.approvalStatus === 'pending' ? (
            <ApprovalCard message={message} busy={busy} onDecide={(d) => onDecide(message.id, d)} />
          ) : message.approvalStatus === 'approved' || message.approvalStatus === 'rejected' ? (
            <div className="mt-2">
              <Badge
                variant="outline"
                className={cn(
                  'gap-1',
                  message.approvalStatus === 'approved'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400',
                )}
              >
                {message.approvalStatus === 'approved' ? (
                  <Check className="size-3" />
                ) : (
                  <X className="size-3" />
                )}
                {message.approvalStatus === 'approved' ? 'Approved' : 'Rejected'}
              </Badge>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

function WorkingRow({ bot, stepText }: { bot: Bot; stepText?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex justify-start"
    >
      <div className="flex gap-2.5">
        <div className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-zinc-900 text-sm">
          <span className="animate-pulse">{bot.emoji}</span>
          <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-emerald-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-zinc-100">{bot.name}</span>
            <span className="truncate text-[11px] text-zinc-600">Bot · {bot.role}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            <span className="flex items-center gap-0.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1 animate-bounce rounded-full bg-zinc-500"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
            <span>{stepText ?? 'Working…'}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ---------- main panel ----------

export function ChatPanel({
  store,
  onToggleComputer,
  onOpenConnections,
  onOpenNewBot,
}: {
  store: GrokbokStore
  onToggleComputer?: () => void
  onOpenConnections?: () => void
  onOpenNewBot?: () => void
}) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const thread = store.activeThread
  const bots = store.state?.bots ?? []

  const messages = thread
    ? [...thread.messages].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      )
    : []

  const threadBots: Bot[] = thread
    ? thread.botIds
        .map((id) => store.botById(id))
        .filter((b): b is Bot => Boolean(b))
    : []

  const workingIds: string[] = thread
    ? thread.botIds.filter(
        (id) => store.workingBotIds.includes(id) || store.botById(id)?.status === 'working',
      )
    : []

  const busy = store.workingBotIds.length > 0
  const primaryBot = threadBots[0]

  const lastStepFor = (botId: string): string | undefined => {
    const log = store.pendingStepsByBot[botId]
    return log && log.length > 0 ? log[log.length - 1].text : undefined
  }

  const openBotDm = (bot: Bot) => {
    const dm = store.state?.threads.find(
      (t) => !t.isGroup && t.botIds.length === 1 && t.botIds[0] === bot.id,
    )
    if (dm) store.openThread(dm.id)
    else void store.createThread([bot.id])
  }

  const send = () => {
    const text = draft.trim()
    if (!text || busy || !thread) return
    setDraft('')
    void store.sendMessage(text)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, workingIds.length, thread?.id])

  const anyWaitingApproval = threadBots.some((b) => b.status === 'waiting_approval')
  const anyWorking = workingIds.length > 0

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
        {thread ? (
          <>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-zinc-100">{thread.title}</h2>
              <div className="flex min-w-0 items-center gap-1 truncate text-[11px] text-zinc-500">
                {threadBots.map((b, i) => (
                  <span key={b.id} className="truncate">
                    {i > 0 && <span className="mr-1 text-zinc-700">·</span>}
                    {b.emoji} {b.name}
                  </span>
                ))}
              </div>
            </div>
            {anyWaitingApproval ? (
              <Badge
                variant="outline"
                className="hidden border-amber-500/40 bg-amber-500/10 text-amber-300 sm:inline-flex"
              >
                <span className="size-1.5 rounded-full bg-amber-400" /> Needs approval
              </Badge>
            ) : anyWorking ? (
              <Badge
                variant="outline"
                className="hidden border-emerald-500/40 bg-emerald-500/10 text-emerald-300 sm:inline-flex"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Working…
              </Badge>
            ) : null}
            {onToggleComputer && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Show Computer"
                onClick={onToggleComputer}
                className="size-8 shrink-0 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 xl:hidden"
              >
                <PanelRight className="size-4" />
              </Button>
            )}
          </>
        ) : (
          <h2 className="text-sm font-semibold text-zinc-300">GrokBok</h2>
        )}
      </header>

      {/* Messages */}
      {thread ? (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
              {messages.length === 0 && workingIds.length === 0 && (
                <div className="flex flex-1 items-center justify-center py-16">
                  <div className="max-w-xs text-center">
                    <p className="text-sm text-zinc-400">
                      {thread.isGroup
                        ? 'Start of the group chat.'
                        : `Start of your chat with ${primaryBot?.name ?? 'your bot'}.`}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Give real work — bots run on their own Computer and check in when they need
                      you.
                    </p>
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <UserMessage key={m.id} message={m} />
                ) : (
                  (() => {
                    const bot = m.botId ? store.botById(m.botId) : undefined
                    if (!bot) return null
                    return (
                      <BotMessage
                        key={m.id}
                        message={m}
                        bot={bot}
                        busy={busy}
                        onDecide={(id, decision) => void store.decide(id, decision)}
                      />
                    )
                  })()
                ),
              )}

              <AnimatePresence initial={false}>
                {workingIds.map((botId) => {
                  const bot = store.botById(botId)
                  if (!bot) return null
                  return (
                    <WorkingRow
                      key={`working-${botId}`}
                      bot={bot}
                      stepText={lastStepFor(botId)}
                    />
                  )
                })}
              </AnimatePresence>

              <div ref={bottomRef} aria-hidden />
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="shrink-0 border-t border-zinc-800 p-3">
            <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
              <Textarea
                value={draft}
                rows={1}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder={
                  thread.isGroup
                    ? 'Message the team like teammates…'
                    : `Message ${primaryBot?.name ?? 'your bot'} like a teammate…`
                }
                aria-label="Message"
                className="min-h-[44px] max-h-32 resize-none overflow-y-auto border-zinc-800 bg-zinc-900/60 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
              />
              <Button
                size="icon"
                onClick={send}
                disabled={!draft.trim() || busy}
                aria-label="Send message"
                className="size-11 shrink-0 rounded-xl bg-white text-black hover:bg-zinc-200 disabled:opacity-40"
              >
                <SendHorizontal className="size-4" />
              </Button>
            </div>
            <p className="mx-auto mt-2 w-full max-w-3xl text-[11px] text-zinc-600">
              Bots work on their own Computer and ask for approval when needed.
            </p>
          </div>
        </>
      ) : (
        /* Empty state — no thread selected */
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          {bots.length === 0 ? (
            /* Fresh workspace onboarding — no bots yet */
            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
                  <span className="text-base font-bold text-zinc-100">G</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-100">
                    Welcome{store.me ? `, ${store.me.name.split(' ')[0]}` : ''} — your workspace
                    is live
                  </p>
                  <p className="text-xs text-zinc-500">Nothing here yet. Build your team:</p>
                </div>
              </div>
              <ol className="mt-5 flex flex-col gap-3">
                <li className="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[11px] font-semibold text-zinc-300">
                    1
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">Connect your tools</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                      API keys, inboxes, webhooks — bots sign in and use them like you do.
                      {store.state && store.state.connections.length > 0 && (
                        <span className="text-zinc-400">
                          {' '}
                          {store.state.connections.length} connected so far.
                        </span>
                      )}
                    </p>
                    {onOpenConnections && (
                      <Button
                        size="sm"
                        onClick={onOpenConnections}
                        className="mt-2 h-8 gap-1.5 bg-white text-xs text-black hover:bg-zinc-200"
                      >
                        <KeyRound className="size-3.5" /> Open Connections
                      </Button>
                    )}
                  </div>
                </li>
                <li className="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[11px] font-semibold text-zinc-300">
                    2
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">Hire your first Bot</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                      Sales, support, ops — pick a role, it gets its own Computer and works 24/7.
                    </p>
                    {onOpenNewBot && (
                      <Button
                        size="sm"
                        onClick={onOpenNewBot}
                        className="mt-2 h-8 gap-1.5 bg-white text-xs text-black hover:bg-zinc-200"
                      >
                        <Plus className="size-3.5" /> New Bot
                      </Button>
                    )}
                  </div>
                </li>
                <li className="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[11px] font-semibold text-zinc-300">
                    3
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">Give it real work</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                      Message it like a colleague. It checks in when it needs your call.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          ) : (
            <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950">
                <MessageSquare className="size-5 text-zinc-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  Select a Bot or start a group chat
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Your AI teammates work 24/7 on their own Computer — message them like
                  colleagues.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {bots.slice(0, 6).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openBotDm(b)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    <span>{b.emoji}</span>
                    {b.name}
                  </button>
                ))}
              </div>
              {onOpenNewBot && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenNewBot}
                  className="h-8 gap-1.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                >
                  <Users className="size-3.5" /> New Bot or group chat
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
