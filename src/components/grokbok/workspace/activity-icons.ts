// Shared icon map for activity kinds.
//
// This lived in both chat-panel.tsx and computer-pane.tsx as identical copies.
// Two copies of an exhaustive Record<ActivityKind, …> means adding a kind
// compiles in one file and fails in the other — or worse, silently falls back
// to the default icon in whichever copy was missed.
import { BookOpen, Brain, CheckCircle2, KeyRound, PenLine, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityKind } from '@/lib/grokbok-types'

export const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  signin: KeyRound,
  think: Brain,
  read: BookOpen,
  write: PenLine,
  tool: Wrench,
  done: CheckCircle2,
}
