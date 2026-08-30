'use client'

// ============================================================
// Workspace shell — full-height app, no page scrolling.
// lg+: [Sidebar | ChatPanel | ComputerPane]
// below lg: sidebar in a Sheet, below xl: Computer in a Sheet.
// Top bar: account menu (sign out) + Connections + New Bot.
// ============================================================

import { useEffect, useState } from 'react'
import { KeyRound, Loader2, LogOut, Menu, Plus, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useGrokbok } from './use-grokbok'
import type { GrokbokStore } from './use-grokbok'
import { Sidebar } from './sidebar'
import { ChatPanel } from './chat-panel'
import { ComputerPane } from './computer-pane'
import { ConnectionsDialog } from './connections-dialog'
import { NewBotDialog } from './new-bot-dialog'

export function Workspace({
  onHome,
  onSignOut,
}: {
  onHome?: () => void
  onSignOut?: () => void
}) {
  const store: GrokbokStore = useGrokbok()
  const [navOpen, setNavOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [newBotOpen, setNewBotOpen] = useState(false)
  const [connectionsOpen, setConnectionsOpen] = useState(false)

  const { state, refresh, stopAllWork } = store

  useEffect(() => {
    if (!state) void refresh()
    return () => stopAllWork()
  }, [state, refresh, stopAllWork])

  if (!state) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-black text-zinc-100">
        {store.error ? (
          <>
            <p className="max-w-xs text-center text-sm text-zinc-400">{store.error}</p>
            <Button
              onClick={() => void store.refresh()}
              variant="outline"
              className="gap-2 border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-white"
            >
              <RotateCcw className="size-4" /> Retry
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="size-5 animate-spin text-zinc-500" />
            <p className="text-[11px] uppercase tracking-widest text-zinc-600">
              Booting your workspace…
            </p>
          </>
        )}
      </div>
    )
  }

  const me = store.me
  const initials = me
    ? me.name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '·'
  const connectionCount = state.connections.length

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black text-zinc-100">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 lg:hidden"
          onClick={() => setNavOpen(true)}
        >
          <Menu className="size-4" />
        </Button>

        <button
          type="button"
          onClick={onHome}
          aria-label="GrokBok home"
          className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600"
        >
          <span className="flex size-5 items-center justify-center rounded-[5px] bg-white text-[11px] font-bold text-black">
            G
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">GrokBok</span>
        </button>
        <Badge
          variant="outline"
          className="hidden border-zinc-800 text-[10px] font-normal uppercase tracking-wider text-zinc-500 sm:inline-flex"
        >
          Early beta
        </Badge>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConnectionsOpen(true)}
            className="h-8 gap-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-white"
          >
            <KeyRound className="size-4" />
            <span className="hidden sm:inline">Connections</span>
            {connectionCount > 0 && (
              <span className="text-[10px] text-zinc-500">{connectionCount}</span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNewBotOpen(true)}
            className="h-8 gap-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-white"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Bot</span>
          </Button>

          {/* Account menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              className="ml-1 flex size-8 cursor-pointer items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[11px] font-semibold text-zinc-200 transition-colors hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600"
            >
              {initials}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-56 border-zinc-800 bg-zinc-950 text-zinc-100"
            >
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm text-zinc-100">{me?.name}</span>
                <span className="block truncate text-xs text-zinc-500">{me?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onClick={() => {
                  if (onSignOut) onSignOut();
                  else void store.logout();
                }}
                className="gap-2 text-zinc-300 focus:bg-zinc-900 focus:text-zinc-100"
              >
                <LogOut className="size-3.5" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Three-column app body */}
      <main className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-zinc-800 lg:flex xl:w-72">
          <Sidebar store={store} />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <ChatPanel
            store={store}
            onToggleComputer={() => setComputerOpen(true)}
            onOpenConnections={() => setConnectionsOpen(true)}
            onOpenNewBot={() => setNewBotOpen(true)}
          />
        </section>

        <aside className="hidden w-[360px] shrink-0 border-l border-zinc-800 xl:block">
          <ComputerPane store={store} />
        </aside>
      </main>

      {/* Mobile navigation */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="w-80 border-zinc-800 bg-black p-0 text-zinc-100 sm:max-w-80 [&>button]:text-zinc-500"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            store={store}
            onNavigate={() => setNavOpen(false)}
            onOpenConnections={() => {
              setNavOpen(false)
              setConnectionsOpen(true)
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Computer pane on smaller screens */}
      <Sheet open={computerOpen} onOpenChange={setComputerOpen}>
        <SheetContent
          side="right"
          aria-describedby={undefined}
          className="w-full border-zinc-800 bg-black p-0 text-zinc-100 sm:max-w-md [&>button]:text-zinc-500"
        >
          <SheetTitle className="sr-only">Computer</SheetTitle>
          <ComputerPane store={store} />
        </SheetContent>
      </Sheet>

      <ConnectionsDialog
        store={store}
        open={connectionsOpen}
        onOpenChange={setConnectionsOpen}
      />
      <NewBotDialog store={store} open={newBotOpen} onOpenChange={setNewBotOpen} />
    </div>
  )
}
