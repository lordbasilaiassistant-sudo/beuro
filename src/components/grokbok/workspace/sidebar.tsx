'use client'

// ============================================================
// Sidebar — Bots roster + chat threads + creation actions.
// Clicking a bot opens (or creates) its DM thread.
// ============================================================

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { KeyRound, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Bot, BotStatus } from '@/lib/grokbok-types'
import { cn } from '@/lib/utils'
import type { GrokbokStore } from './use-grokbok'
import { NewBotDialog } from './new-bot-dialog'
import { NewThreadDialog } from './new-thread-dialog'

function relTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

function StatusDot({ status, label }: { status: BotStatus; label: string }) {
  if (status === 'working') {
    return (
      <span title={label} className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
    )
  }
  if (status === 'waiting_approval') {
    return <span title={label} className="size-2 shrink-0 rounded-full bg-amber-400" />
  }
  return <span title={label} className="size-2 shrink-0 rounded-full bg-zinc-600" />
}

const STATUS_LABEL: Record<BotStatus, string> = {
  idle: 'Idle',
  working: 'Working',
  waiting_approval: 'Needs approval',
}

export function Sidebar({
  store,
  onNavigate,
  onOpenConnections,
}: {
  store: GrokbokStore
  onNavigate?: () => void
  onOpenConnections?: () => void
}) {
  const [newBotOpen, setNewBotOpen] = useState(false)
  const [newThreadOpen, setNewThreadOpen] = useState(false)

  const bots = store.state?.bots ?? []
  const threads = store.threadsForSidebar

  const openBotDm = (bot: Bot) => {
    const dm = store.state?.threads.find(
      (t) => !t.isGroup && t.botIds.length === 1 && t.botIds[0] === bot.id,
    )
    if (dm) store.openThread(dm.id)
    else void store.createThread([bot.id])
    onNavigate?.()
  }

  return (
    <div className="flex h-full w-full flex-col bg-black">
      {/* Bots */}
      <div className="flex shrink-0 items-center gap-1.5 px-4 pb-2 pt-4">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Bots
        </span>
        <span className="text-[11px] text-zinc-600">· {bots.length}</span>
      </div>
      <ScrollArea className="max-h-[38%] shrink-0 px-2">
        <div className="flex flex-col gap-0.5 pb-1">
          {bots.length === 0 && (
            <p className="px-2 py-3 text-xs text-zinc-600">
              No bots yet — create your first teammate below.
            </p>
          )}
          {bots.map((bot) => {
            const dm = store.state?.threads.find(
              (t) => !t.isGroup && t.botIds.length === 1 && t.botIds[0] === bot.id,
            )
            const active = Boolean(dm && store.activeThread?.id === dm.id)
            const liveWorking = store.workingBotIds.includes(bot.id)
            const status = liveWorking ? ('working' as BotStatus) : bot.status
            return (
              <button
                key={bot.id}
                type="button"
                onClick={() => openBotDm(bot)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-600',
                  active ? 'bg-zinc-900' : 'hover:bg-zinc-900/60',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-base">
                  {bot.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {bot.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">{bot.role}</span>
                </span>
                <StatusDot status={status} label={STATUS_LABEL[status]} />
              </button>
            )
          })}
        </div>
      </ScrollArea>

      {/* Threads */}
      <div className="flex shrink-0 items-center gap-1.5 px-4 pb-2 pt-4">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Threads
        </span>
        <span className="text-[11px] text-zinc-600">· {threads.length}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-0.5 pb-2">
          {threads.length === 0 && (
            <p className="px-2 py-3 text-xs text-zinc-600">No chats yet — say hi to a bot.</p>
          )}
          {threads.map((thread) => {
            const primaryBot = store.botById(thread.botIds[0] ?? '')
            const active = store.activeThread?.id === thread.id
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  store.openThread(thread.id)
                  onNavigate?.()
                }}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-600',
                  active ? 'bg-zinc-900' : 'hover:bg-zinc-900/60',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
                  {thread.isGroup ? (
                    <Users className="size-3.5 text-zinc-400" />
                  ) : (
                    <span className="text-sm">{primaryBot?.emoji ?? '💬'}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-200">{thread.title}</span>
                  <span className="block truncate text-[11px] text-zinc-600">
                    {relTime(thread.updatedAt)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-800 p-3">
        <Button
          variant="ghost"
          onClick={() => {
            onOpenConnections?.()
            onNavigate?.()
          }}
          className="w-full justify-start gap-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
        >
          <KeyRound className="size-4" />
          Connections
          {store.state && store.state.connections.length > 0 && (
            <span className="ml-auto text-[10px] text-zinc-600">
              {store.state.connections.length}
            </span>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => setNewBotOpen(true)}
          className="w-full justify-start gap-2 border-zinc-800 bg-transparent text-sm text-zinc-200 hover:bg-zinc-900 hover:text-white"
        >
          <Plus className="size-4" /> New Bot
        </Button>
        <Button
          variant="ghost"
          onClick={() => setNewThreadOpen(true)}
          className="w-full justify-start gap-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
        >
          <Users className="size-4" /> Group chat
        </Button>
      </div>

      <NewBotDialog
        store={store}
        open={newBotOpen}
        onOpenChange={setNewBotOpen}
        onCreated={onNavigate}
      />
      <NewThreadDialog
        store={store}
        open={newThreadOpen}
        onOpenChange={setNewThreadOpen}
        onCreated={onNavigate}
      />
    </div>
  )
}
