'use client'

// ============================================================
// NewThreadDialog — start a DM or a group chat.
// 1 bot = direct chat · 2+ bots = they coordinate themselves.
// ============================================================

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { GrokbokStore } from './use-grokbok'

export function NewThreadDialog({
  store,
  open,
  onOpenChange,
  onCreated,
}: {
  store: GrokbokStore
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const bots = store.state?.bots ?? []
  const isGroup = selected.length >= 2

  const toggle = (botId: string) => {
    setSelected((prev) =>
      prev.includes(botId) ? prev.filter((id) => id !== botId) : [...prev, botId],
    )
  }

  const create = async () => {
    if (selected.length === 0 || saving) return
    setSaving(true)
    const ok = await store.createThread(selected, title.trim() || undefined)
    setSaving(false)
    if (ok) {
      setSelected([])
      setTitle('')
      onOpenChange(false)
      onCreated?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Start a chat</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            1 bot = direct chat · 2+ bots = they coordinate themselves.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-64">
          <div className="flex flex-col gap-1.5 pr-2">
            {bots.length === 0 && (
              <p className="px-1 py-3 text-xs text-zinc-600">
                No bots yet — create one first.
              </p>
            )}
            {bots.map((bot) => {
              const isSelected = selected.includes(bot.id)
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => toggle(bot.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                    isSelected
                      ? 'border-zinc-600 bg-zinc-900'
                      : 'border-zinc-800/80 bg-transparent hover:bg-zinc-900/60',
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm">
                    {bot.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {bot.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">{bot.role}</span>
                  </span>
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isSelected
                        ? 'border-zinc-100 bg-zinc-100 text-black'
                        : 'border-zinc-700 text-transparent',
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                </button>
              )
            })}
          </div>
        </ScrollArea>

        {isGroup && (
          <div className="grid gap-1.5">
            <Label htmlFor="group-chat-title" className="text-xs text-zinc-400">
              Group chat name <span className="text-zinc-600">(optional)</span>
            </Label>
            <Input
              id="group-chat-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Launch Coordination"
              className="border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={selected.length === 0 || saving}
            onClick={() => void create()}
            className="gap-1.5 bg-white text-black hover:bg-zinc-200"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {isGroup ? 'Create group chat' : 'Create chat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
