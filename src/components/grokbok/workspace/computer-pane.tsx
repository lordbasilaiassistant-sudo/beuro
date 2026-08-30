'use client'

// ============================================================
// ComputerPane — the selected bot's cloud Computer:
// live activity terminal, memory, and scheduled routines.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import {
  Brain,
  CheckCircle2,
  BookOpen,
  ChevronDown,
  Clock,
  Cpu,
  KeyRound,
  Loader2,
  PenLine,
  Plus,
  Repeat,
  Sparkle,
  UserMinus,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ActivityKind, ActivityStep, Bot, BotStatus, Routine } from '@/lib/grokbok-types'
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

function relTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

const STATUS_LABEL: Record<BotStatus, string> = {
  idle: 'Idle',
  working: 'Working',
  waiting_approval: 'Needs approval',
}

// ---------- sub cards ----------

function LiveActivityCard({
  store,
  botId,
  working,
  lastBotMessage,
}: {
  store: GrokbokStore
  botId: string
  working: boolean
  lastBotMessage: { id: string; createdAt: string; activity: ActivityStep[] } | null
}) {
  // Elapsed time is the only thing we truthfully know mid-turn, so it is the
  // only thing the terminal shows. Real steps arrive when the turn lands.
  const workingSince = store.workingSinceByBot[botId]
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!workingSince) {
      setElapsed(0)
      return
    }
    setElapsed(Math.floor((Date.now() - workingSince) / 1000))
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - workingSince) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [workingSince])

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          {working ? (
            <>
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              {/* Not "24/7" — nothing runs while the app is down. It will be
                  true once routines move to a scheduler; until then, don't
                  claim it. */}
              Working
            </>
          ) : lastBotMessage ? (
            <>Last run {relTime(lastBotMessage.createdAt)}</>
          ) : (
            <>No runs yet</>
          )}
        </span>
        <Cpu className="size-3 text-zinc-600" />
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {working ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-zinc-300">
              <span className="text-zinc-600">›</span>
              <span>
                Working
                {elapsed > 0 && (
                  <span className="text-zinc-500">
                    {' '}
                    · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                  </span>
                )}
              </span>
              <span className="ml-0.5 inline-block size-1.5 animate-pulse rounded-[2px] bg-emerald-400" />
            </div>
            <span className="text-[10px] text-zinc-600">
              Steps appear here once they have actually run.
            </span>
          </div>
        ) : lastBotMessage && lastBotMessage.activity.length > 0 ? (
          <motion.div
            key={lastBotMessage.id}
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
            className="flex flex-col gap-1"
          >
            {lastBotMessage.activity.map((step, i) => {
              const Icon = KIND_ICON[step.kind] ?? Brain
              // Same rule as the chat log: executed steps read solid and carry
              // their sources; described steps are dimmed and italic.
              const real = step.verified === true
              return (
                <motion.div
                  key={`${i}-${step.text}`}
                  variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}
                  className={cn(
                    'flex items-start gap-2',
                    !real && 'italic text-zinc-600',
                    real && (step.kind === 'done' ? 'text-emerald-300/90' : 'text-zinc-300'),
                  )}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 size-3 shrink-0',
                      real
                        ? step.kind === 'done'
                          ? 'text-emerald-400'
                          : 'text-zinc-400'
                        : 'text-zinc-700',
                    )}
                  />
                  <span className="min-w-0">
                    {step.text}
                    {step.evidence && step.evidence.length > 0 && (
                      <span className="mt-1 flex flex-col gap-0.5">
                        {step.evidence.map((e) => (
                          <a
                            key={e.href}
                            href={e.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={e.href}
                            className="truncate text-[10px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-200 hover:underline"
                          >
                            › {e.href.replace(/^https?:\/\//, '')}
                          </a>
                        ))}
                      </span>
                    )}
                  </span>
                </motion.div>
              )
            })}
          </motion.div>
        ) : (
          <div className="flex items-center gap-2 text-zinc-600">
            <span>›</span>
            <span>Waiting for its first job…</span>
          </div>
        )}
      </div>
    </section>
  )
}

function MemoryCard({ bot }: { bot: Bot }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
          <Brain className="size-3.5 text-zinc-400" /> Memory
        </span>
        <span className="text-[10px] text-zinc-600">{bot.memories.length} remembered</span>
      </header>
      {bot.memories.length > 0 ? (
        <ScrollArea className="mt-2 max-h-40">
          <ul className="flex flex-col gap-1.5 pr-2">
            {bot.memories.map((mem) => (
              <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-300">
                <Sparkle className="mt-0.5 size-3 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1">{mem.content}</span>
                {mem.source === 'chat' && (
                  <Badge
                    variant="outline"
                    className="h-4 shrink-0 border-zinc-800 px-1 text-[9px] font-normal text-zinc-500"
                  >
                    chat
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      ) : (
        <p className="mt-2 text-xs italic text-zinc-600">+ Memory updates itself as you chat.</p>
      )}
    </section>
  )
}

function RoutineRow({
  routine,
  store,
  busy,
}: {
  routine: Routine
  store: GrokbokStore
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-zinc-100">{routine.title}</span>
        <Switch
          checked={routine.enabled}
          disabled={busy}
          onCheckedChange={(v) => void store.toggleRoutine(routine.id, v)}
          aria-label={`Toggle ${routine.title}`}
          className="data-[state=checked]:bg-zinc-100 data-[state=unchecked]:bg-zinc-700"
        />
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Clock className="size-3 shrink-0" />
        <span className="truncate">{routine.schedule}</span>
        {routine.lastRunAt && (
          <span className="shrink-0 text-zinc-600">· last run {relTime(routine.lastRunAt)}</span>
        )}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300">
            <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
            {routine.steps.length} steps
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="ml-1 mt-1.5 flex flex-col gap-1 border-l border-zinc-800 pl-3">
              {routine.steps.map((step, i) => (
                <li key={`${i}-${step}`} className="flex gap-2 text-[11px] leading-relaxed text-zinc-400">
                  <span className="shrink-0 text-zinc-600">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void store.runRoutine(routine.id)}
          className="ml-auto h-6 shrink-0 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          Run now
        </Button>
      </div>
    </li>
  )
}

function RoutinesCard({ store, bot, busy }: { store: GrokbokStore; bot: Bot; busy: boolean }) {
  const [teachOpen, setTeachOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const text = description.trim()
    if (!text || saving) return
    setSaving(true)
    const ok = await store.createRoutine(bot.id, text)
    setSaving(false)
    if (ok) {
      setDescription('')
      setTeachOpen(false)
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
          <Repeat className="size-3.5 text-zinc-400" /> Routines
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTeachOpen(true)}
          className="h-6 gap-1 px-2 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Plus className="size-3" /> Teach a task
        </Button>
      </header>

      {bot.routines.length === 0 ? (
        <p className="mt-2 text-xs italic text-zinc-600">
          No routines yet — teach one and it runs on a schedule.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {bot.routines.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} store={store} busy={busy} />
          ))}
        </ul>
      )}

      <Dialog open={teachOpen} onOpenChange={setTeachOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Teach {bot.name} a routine</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Complete a workflow once — your Bot saves it as a routine and repeats it on a
              schedule.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Every Monday, pull the weekly numbers from the dashboard and post a summary here…"
            className="min-h-24 resize-none border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
          />
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTeachOpen(false)}
              className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!description.trim() || saving}
              onClick={() => void save()}
              className="gap-1.5 bg-white text-black hover:bg-zinc-200"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save routine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ---------- main pane ----------

export function ComputerPane({ store }: { store: GrokbokStore }) {
  const [fireOpen, setFireOpen] = useState(false)
  const thread = store.activeThread
  const bot = thread ? store.botById(thread.botIds[0] ?? '') : undefined

  const lastBotMessage = useMemo(() => {
    if (!thread || !bot) return null
    const list = thread.messages.filter((m) => m.role === 'bot' && m.botId === bot.id)
    return list.length > 0 ? list[list.length - 1] : null
  }, [thread, bot])

  if (!bot) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black p-6">
        <div className="flex w-full max-w-[280px] flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-800 p-8 text-center">
          <Cpu className="size-5 text-zinc-600" />
          <p className="text-sm text-zinc-400">No bot selected</p>
          <p className="text-xs leading-relaxed text-zinc-600">
            Pick a chat to see its Computer — live activity, memory and routines.
          </p>
        </div>
      </div>
    )
  }

  const liveWorking = store.workingBotIds.includes(bot.id)
  const status: BotStatus = liveWorking ? 'working' : bot.status
  const busy = store.workingBotIds.length > 0

  const statusDotClass =
    status === 'working'
      ? 'bg-emerald-400 animate-pulse'
      : status === 'waiting_approval'
        ? 'bg-amber-400'
        : 'bg-zinc-600'

  return (
    <div className="flex h-full w-full flex-col bg-black">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Computer
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className={cn('size-1.5 rounded-full', statusDotClass)} />
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-base">
            {bot.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{bot.name}</p>
            <p className="truncate text-xs text-zinc-500">{bot.role} · always-on machine</p>
          </div>
          <AlertDialog open={fireOpen} onOpenChange={setFireOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${bot.name} from your team`}
                disabled={busy}
                className="size-8 shrink-0 text-zinc-600 hover:bg-zinc-900 hover:text-red-400"
              >
                <UserMinus className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sm">
                  Remove {bot.name} from your team?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs leading-relaxed text-zinc-500">
                  {bot.name} will stop working immediately. Their memories, routines and chat
                  history will be permanently deleted. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100">
                  Keep them
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void store.deleteBot(bot.id)}
                  className="bg-red-600 text-white hover:bg-red-500"
                >
                  Remove {bot.name}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Cards */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          <LiveActivityCard
            store={store}
            botId={bot.id}
            working={liveWorking}
            lastBotMessage={lastBotMessage}
          />
          <MemoryCard bot={bot} />
          <RoutinesCard store={store} bot={bot} busy={busy} />
        </div>
      </ScrollArea>
    </div>
  )
}
