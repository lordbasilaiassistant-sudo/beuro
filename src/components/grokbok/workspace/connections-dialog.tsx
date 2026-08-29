'use client'

// ============================================================
// ConnectionsDialog — connect the company's real tools so bots
// can work with them: API keys, webhooks, email accounts, DBs.
// Secret values are masked everywhere in the UI.
// ============================================================

import { useState } from 'react'
import {
  Database,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Plug,
  Plus,
  Trash2,
  Webhook,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { Connection, ConnectionType } from '@/lib/grokbok-types'
import { cn } from '@/lib/utils'
import type { GrokbokStore } from './use-grokbok'

const TYPE_META: Record<ConnectionType, { icon: LucideIcon; label: string }> = {
  api_key: { icon: KeyRound, label: 'API key' },
  webhook: { icon: Webhook, label: 'Webhook' },
  email: { icon: Mail, label: 'Email / SMTP' },
  database: { icon: Database, label: 'Database' },
  custom: { icon: Globe, label: 'Other' },
}

const inputClasses =
  'border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40'

function ConnectionRow({
  connection,
  store,
}: {
  connection: Connection
  store: GrokbokStore
}) {
  const [confirming, setConfirming] = useState(false)
  const meta = TYPE_META[connection.type] ?? TYPE_META.custom
  const Icon = meta.icon

  return (
    <li className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
          <Icon className="size-3.5 text-zinc-400" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-100">
            {connection.name}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">
            {meta.label}
            {connection.maskedValue ? ` · ${connection.maskedValue}` : ''}
          </span>
        </span>
        {confirming ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={store.workingBotIds.length > 0}
              onClick={() => {
                setConfirming(false)
                void store.deleteConnection(connection.id)
              }}
              className="h-7 gap-1 px-2 text-[11px] text-red-400 hover:bg-red-950/60 hover:text-red-300"
            >
              <Trash2 className="size-3" /> Remove
            </Button>
          </span>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${connection.name}`}
            onClick={() => setConfirming(true)}
            className="size-8 shrink-0 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {connection.notes && (
        <p className="mt-1.5 truncate pl-[42px] text-[11px] text-zinc-500">{connection.notes}</p>
      )}
    </li>
  )
}

export function ConnectionsDialog({
  store,
  open,
  onOpenChange,
}: {
  store: GrokbokStore
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ConnectionType>('api_key')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const connections = store.state?.connections ?? []
  const valid = name.trim().length > 0

  const add = async () => {
    if (!valid || saving) return
    setSaving(true)
    const ok = await store.addConnection({
      name: name.trim(),
      type,
      ...(value.trim() ? { value: value.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    })
    setSaving(false)
    if (ok) {
      setName('')
      setType('api_key')
      setValue('')
      setNotes('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Connect your tools</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Give your bots access to the tools your company already uses. They sign in and work
            with them like you do.
          </DialogDescription>
        </DialogHeader>

        {/* Add form */}
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="conn-name" className="text-xs text-zinc-400">
                Tool name
              </Label>
              <Input
                id="conn-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stripe, Notion, CRM"
                className={cn('h-9', inputClasses)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="conn-type" className="text-xs text-zinc-400">
                Type
              </Label>
              <Select value={type} onValueChange={(v) => setType(v as ConnectionType)}>
                <SelectTrigger id="conn-type" className="h-9 border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                  {(Object.keys(TYPE_META) as ConnectionType[]).map((t) => {
                    const Icon = TYPE_META[t].icon
                    return (
                      <SelectItem key={t} value={t} className="text-sm">
                        <span className="flex items-center gap-2">
                          <Icon className="size-3.5 text-zinc-500" />
                          {TYPE_META[t].label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conn-value" className="text-xs text-zinc-400">
              Key or URL <span className="text-zinc-600">(stored securely, shown masked)</span>
            </Label>
            <Input
              id="conn-value"
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk_live_… or https://hooks.company.com/…"
              autoComplete="off"
              className={cn('h-9', inputClasses)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conn-notes" className="text-xs text-zinc-400">
              What should bots use it for? <span className="text-zinc-600">(optional)</span>
            </Label>
            <Textarea
              id="conn-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Charge records and invoices for paying customers"
              className="min-h-16 resize-none border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
            />
          </div>
          <Button
            size="sm"
            disabled={!valid || saving}
            onClick={() => void add()}
            className="h-9 w-full gap-1.5 bg-white text-black hover:bg-zinc-200 disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Add connection
          </Button>
        </div>

        {/* Existing connections */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            <Plug className="size-3" /> Connected · {connections.length}
          </p>
          {connections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">
              Nothing connected yet. Add your first tool above — bots will reference it by name
              when they work.
            </p>
          ) : (
            <ScrollArea className="max-h-56">
              <ul className="flex flex-col gap-2 pr-2">
                {connections.map((c) => (
                  <ConnectionRow key={c.id} connection={c} store={store} />
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          <p className="flex items-center gap-1 text-left text-[10px] leading-relaxed text-zinc-600">
            <Lock className="size-3 shrink-0" />
            Secrets never leave the server — even this dialog only ever sees masked values.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="ml-auto text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
