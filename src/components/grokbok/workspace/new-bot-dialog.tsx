'use client'

// ============================================================
// NewBotDialog — hire a new AI teammate.
// ============================================================

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import type { CreateBotInput } from '@/lib/grokbok-types'
import { cn } from '@/lib/utils'
import type { GrokbokStore } from './use-grokbok'

const EMOJIS = [
  '🗂️',
  '📡',
  '🧾',
  '🎯',
  '🐞',
  '📊',
  '📬',
  '🛠️',
  '🧠',
  '💼',
  '🔍',
  '📈',
  '✅',
  '🗓️',
  '🚀',
  '🧪',
  '📎',
  '🤖',
  '💡',
  '🔒',
  '🧭',
  '📦',
  '⚡',
  '🎓',
]

/** Quick-start roles so hiring a teammate takes seconds. */
const ROLE_IDEAS: { role: string; emoji: string }[] = [
  { role: 'Sales Outbound', emoji: '📈' },
  { role: 'Talent Scout', emoji: '🔍' },
  { role: 'Expense Manager', emoji: '🧾' },
  { role: 'Customer Support', emoji: '📬' },
  { role: 'Chief of Staff', emoji: '🗂️' },
  { role: 'Bug Reproduction', emoji: '🐞' },
]

export function NewBotDialog({
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
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [persona, setPersona] = useState('')
  const [saving, setSaving] = useState(false)

  const valid = name.trim().length > 0 && role.trim().length > 0

  const create = async () => {
    if (!valid || saving) return
    setSaving(true)
    const input: CreateBotInput = {
      name: name.trim(),
      role: role.trim(),
      emoji,
      ...(persona.trim() ? { persona: persona.trim() } : {}),
    }
    const ok = await store.createBot(input)
    setSaving(false)
    if (ok) {
      setName('')
      setRole('')
      setEmoji('🤖')
      setPersona('')
      onOpenChange(false)
      onCreated?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Hire a new Bot</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Bots get their own Computer, memory and routines — and work 24/7 like a teammate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="new-bot-name" className="text-xs text-zinc-400">
              Name
            </Label>
            <Input
              id="new-bot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Atlas"
              className="border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="new-bot-role" className="text-xs text-zinc-400">
              Role
            </Label>
            <Input
              id="new-bot-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Expense Manager"
              className="border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {ROLE_IDEAS.map((idea) => (
                <button
                  key={idea.role}
                  type="button"
                  onClick={() => {
                    setRole(idea.role)
                    setEmoji(idea.emoji)
                  }}
                  aria-label={`Use role ${idea.role}`}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    role === idea.role
                      ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                      : 'border-zinc-800 bg-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                  )}
                >
                  {idea.emoji} {idea.role}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs text-zinc-400">Emoji</Label>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  aria-label={`Pick emoji ${e}`}
                  aria-pressed={emoji === e}
                  className={cn(
                    'flex cursor-pointer items-center justify-center rounded-lg border text-base transition-all',
                    emoji === e
                      ? 'border-zinc-100 bg-zinc-800 ring-2 ring-zinc-100 ring-offset-2 ring-offset-zinc-950'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600',
                  )}
                >
                  <span className="flex size-8 items-center justify-center sm:size-9">{e}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="new-bot-persona" className="text-xs text-zinc-400">
              Persona <span className="text-zinc-600">(optional)</span>
            </Label>
            <Textarea
              id="new-bot-persona"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="How should it talk and work?"
              className="min-h-20 resize-none border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
            />
            <p className="text-[11px] text-zinc-600">
              Leave blank and Beuro will figure them out.
            </p>
          </div>
        </div>

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
            disabled={!valid || saving}
            onClick={() => void create()}
            className="gap-1.5 bg-white text-black hover:bg-zinc-200"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Create Bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
