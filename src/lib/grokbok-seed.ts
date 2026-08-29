// ============================================================
// GrokBok clone — seed data (EXACT content from worklog.md)
// Applied once inside GET /api/state when the Bot table is empty.
// ============================================================

import { db } from '@/lib/db'
import type { ActivityStep } from '@/lib/grokbok-types'

interface SeedRoutine {
  title: string
  schedule: string
  steps: string[]
}

interface SeedBot {
  name: string
  role: string
  emoji: string
  persona: string
  memories: string[]
  routines: SeedRoutine[]
}

const SEED_BOTS: SeedBot[] = [
  {
    name: 'Atlas',
    role: 'Chief of Staff',
    emoji: '🗂️',
    persona:
      'Coordinates the whole bot team. Triage, prioritization, delegation. Loops in specialists instead of doing everything itself. Calm, structured, concise.',
    memories: [
      'User prefers short bullet-point summaries in the morning.',
      'Standup notes are due every day at 9:15 AM.',
    ],
    routines: [],
  },
  {
    name: 'Nova',
    role: 'Sales Outbound',
    emoji: '📡',
    persona:
      "Researches accounts, scores intent, drafts email + LinkedIn outreach in the user's voice. Energetic, metrics-driven.",
    memories: [
      'Acme only signs annual contracts; Dana is the one who approves pricing.',
      'Never email prospects before 8 AM local time.',
    ],
    routines: [
      {
        title: 'Morning pipeline sweep',
        schedule: 'Every weekday at 8:30 AM',
        steps: [
          'Check overnight replies in the pipeline inbox',
          'Score new inbound contacts by intent',
          "Draft 5 follow-ups in user's voice",
          'Queue the drafts for 8 AM send window',
          'Post a summary in this chat',
        ],
      },
    ],
  },
  {
    name: 'Ledger',
    role: 'Expense Manager',
    emoji: '🧾',
    persona:
      'Processes receipts and invoices, flags anomalies, files weekly expense reports. Precise, dry humor.',
    memories: [
      'Meals over $75 need itemized receipts.',
      "User's card ending 4417 is the company card.",
    ],
    routines: [
      {
        title: 'Weekly expense report',
        schedule: 'Every Friday at 4:00 PM',
        steps: [
          'Collect receipts from email and Slack',
          'Match receipts to card transactions',
          'Flag anything over $75 missing itemization',
          'Compile the weekly report',
          'Send summary for approval',
        ],
      },
    ],
  },
  {
    name: 'Scout',
    role: 'Talent Scout',
    emoji: '🎯',
    persona:
      'Screens inbound candidates, schedules interviews, keeps candidates warm. Warm but efficient.',
    memories: [
      'Always offer Thursday or Friday slots for interviews.',
      "Candidate pool tagged 'must-see' goes to the user within 24h.",
    ],
    routines: [],
  },
  {
    name: 'Patch',
    role: 'Bug Reproduction',
    emoji: '🐞',
    persona:
      'Repros bugs in the product UI, writes minimal test cases, files tickets with exact steps. Methodical engineer.',
    memories: [
      'Repro env is staging.us-east; sign in with the qa-bot account.',
      'Always attach a minimal repro video to tickets.',
    ],
    routines: [
      {
        title: 'Nightly regression sweep',
        schedule: 'Every night at 2:00 AM',
        steps: [
          'Run the smoke suite on staging',
          'Capture failing screenshots',
          'Bisect the first broken commit',
          'File tickets with repro steps',
          'Post the digest in this chat',
        ],
      },
    ],
  },
]

interface SeedMessage {
  role: 'user' | 'bot'
  botName?: string
  content: string
  activity?: ActivityStep[]
  needsApproval?: boolean
  approvalStatus?: 'none' | 'pending'
  approvalNote?: string
}

interface SeedThread {
  title: string
  isGroup: boolean
  botNames: string[]
  messages: SeedMessage[]
}

const SEED_THREADS: SeedThread[] = [
  {
    title: 'Atlas',
    isGroup: false,
    botNames: ['Atlas'],
    messages: [
      {
        role: 'bot',
        botName: 'Atlas',
        content:
          "Morning. Here's the shape of today: 3 priority items, 2 approvals waiting, and Nova has 5 follow-ups queued for your review. I'll keep the team moving — ping me when you're in.",
        activity: [
          { kind: 'signin', text: 'Signing in to Workspace…' },
          { kind: 'read', text: 'Reading overnight updates from 4 bots…' },
          { kind: 'think', text: 'Prioritizing 3 items that need you…' },
          { kind: 'write', text: 'Preparing your daily brief…' },
          { kind: 'done', text: 'Brief ready — inbox and tools are clear.' },
        ],
      },
      { role: 'user', content: 'morning. what needs me first?' },
      {
        role: 'bot',
        botName: 'Atlas',
        content:
          'Two things: 1) Ledger flagged a $1,200 invoice missing itemization — approve or push back? 2) Acme replied on pricing; Nova drafted a response in the same thread as last quarter. Both can wait for your call.',
        activity: [
          { kind: 'read', text: "Reviewing Ledger's flag and Nova's draft…" },
          { kind: 'think', text: 'Weighing which needs judgment vs approval…' },
          { kind: 'done', text: 'Two decision points queued for you.' },
        ],
      },
    ],
  },
  {
    title: 'Q3 Launch Coordination',
    isGroup: true,
    botNames: ['Atlas', 'Nova', 'Patch'],
    messages: [
      {
        role: 'bot',
        botName: 'Atlas',
        content:
          'Looping in Nova and Patch. Goal: launch page live by Friday without pulling you in.',
        activity: [
          { kind: 'think', text: 'Breaking the launch into lanes…' },
          { kind: 'write', text: 'Assigning copy to Nova, QA to Patch…' },
          { kind: 'done', text: "Team aligned — I'll escalate only if blocked." },
        ],
      },
      {
        role: 'bot',
        botName: 'Nova',
        content:
          "Copy draft is in. I checked last quarter's messaging for tone — reusing the structure that Acme responded to.",
        activity: [
          { kind: 'read', text: "Pulling last quarter's campaign copy…" },
          { kind: 'write', text: 'Drafting launch announcement v1…' },
          { kind: 'done', text: 'Draft ready for review.' },
        ],
      },
      {
        role: 'bot',
        botName: 'Patch',
        content:
          "Booking QA. I'll repro the checkout bug on staging tonight and file tickets with video repros.",
        activity: [
          { kind: 'signin', text: 'Signing in to staging environment…' },
          { kind: 'tool', text: 'Running checkout flow 12 times…' },
          { kind: 'done', text: 'Ticket queue opens tonight at 2 AM.' },
        ],
      },
    ],
  },
]

/**
 * Seeds the full demo workspace. Idempotent: no-ops when any Bot already exists.
 */
export async function seedGrokBok(): Promise<void> {
  const existingBots = await db.bot.count()
  if (existingBots > 0) return

  const base = Date.now()
  const at = (offsetMs: number) => new Date(base + offsetMs)

  // 1. Bots (sequential so createdAt order is deterministic: Atlas → Nova → Ledger → Scout → Patch)
  const botsByName = new Map<string, { id: string }>()
  let botOffset = 0
  for (const spec of SEED_BOTS) {
    const bot = await db.bot.create({
      data: {
        name: spec.name,
        role: spec.role,
        emoji: spec.emoji,
        persona: spec.persona,
        status: 'idle',
        createdAt: at(botOffset),
      },
    })
    botsByName.set(spec.name, bot)
    botOffset += 10
  }

  // 2. Memories (source 'seed') + routines
  let relOffset = 0
  for (const spec of SEED_BOTS) {
    const bot = botsByName.get(spec.name)
    if (!bot) continue
    for (const content of spec.memories) {
      await db.memory.create({
        data: { botId: bot.id, content, source: 'seed', createdAt: at(relOffset) },
      })
      relOffset += 5
    }
    for (const routine of spec.routines) {
      await db.routine.create({
        data: {
          botId: bot.id,
          title: routine.title,
          schedule: routine.schedule,
          steps: JSON.stringify(routine.steps),
          enabled: true,
          createdAt: at(relOffset),
        },
      })
      relOffset += 5
    }
  }

  // 3. Threads + messages (DM first, group second so it sorts on top by updatedAt)
  let msgOffset = 0
  for (const threadSpec of SEED_THREADS) {
    const memberIds = threadSpec.botNames
      .map((name) => botsByName.get(name)?.id)
      .filter((id): id is string => Boolean(id))

    const thread = await db.thread.create({
      data: {
        title: threadSpec.title,
        isGroup: threadSpec.isGroup,
        botIds: JSON.stringify(memberIds),
        createdAt: at(msgOffset),
      },
    })
    msgOffset += 10

    for (const msgSpec of threadSpec.messages) {
      const botId = msgSpec.botName ? botsByName.get(msgSpec.botName)?.id ?? null : null
      await db.message.create({
        data: {
          threadId: thread.id,
          role: msgSpec.role,
          botId,
          content: msgSpec.content,
          activity: JSON.stringify(msgSpec.activity ?? []),
          needsApproval: msgSpec.needsApproval ?? false,
          approvalStatus: msgSpec.approvalStatus ?? 'none',
          approvalNote: msgSpec.approvalNote ?? '',
          createdAt: at(msgOffset),
        },
      })
      msgOffset += 10
    }
  }
}
