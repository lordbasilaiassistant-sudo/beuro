// ============================================================
// Beuro — usage metering and quota (BACKEND ONLY)
//
// A turn is the unit that costs money. Measured on Workers AI 2026-08-30:
// one realistic loop call (944 prompt + 221 completion tokens, carrying a
// 3.5k-char observation) costs 161.89 neurons, and a turn is up to 5 of them
// — ~809 neurons, $0.0089 beyond the free allowance.
//
// The free allowance is 10,000 neurons/day and it is ACCOUNT-WIDE, not per
// user: about 12 turns a day across everyone. That single fact is why metering
// has to exist before this can be offered to anyone else — without it, one
// enthusiastic user spends the whole estate's daily allowance before lunch.
//
// This module deliberately does not know about money. It counts turns and
// enforces a ceiling; what a turn is worth, and who has paid, is a decision
// for whatever billing rail sits on top.
// ============================================================

import { db } from '@/lib/db'

/** Billing period key, YYYY-MM in UTC. */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Turns included per user per month before the quota bites.
 * 0 disables metering entirely (single-user self-host, the default).
 */
const MONTHLY_TURN_LIMIT = Number(process.env.MONTHLY_TURN_LIMIT || 0)

/**
 * Accounts that are never metered, by email — the operator's own.
 * Comma-separated in OWNER_EMAILS.
 */
const OWNER_EMAILS = new Set(
  (process.env.OWNER_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

export interface UsageSnapshot {
  period: string
  turns: number
  modelCalls: number
  toolCalls: number
  /** null when this account is not metered. */
  limit: number | null
  remaining: number | null
  unlimited: boolean
}

function isUnlimited(email: string | null | undefined): boolean {
  if (MONTHLY_TURN_LIMIT <= 0) return true
  return Boolean(email && OWNER_EMAILS.has(email.toLowerCase()))
}

/**
 * Read a user's usage for the current period without changing it.
 *
 * Resolves the email itself rather than taking it from the session, so callers
 * do not all have to widen what getSessionUser returns.
 */
export async function getUsage(userId: string, email?: string | null): Promise<UsageSnapshot> {
  const period = currentPeriod()
  const [row, user] = await Promise.all([
    db.usageCounter.findUnique({ where: { userId_period: { userId, period } } }),
    email === undefined
      ? db.user.findUnique({ where: { id: userId }, select: { email: true } })
      : Promise.resolve(null),
  ])
  const turns = row?.turns ?? 0
  const unlimited = isUnlimited(email ?? user?.email)

  return {
    period,
    turns,
    modelCalls: row?.modelCalls ?? 0,
    toolCalls: row?.toolCalls ?? 0,
    limit: unlimited ? null : MONTHLY_TURN_LIMIT,
    remaining: unlimited ? null : Math.max(0, MONTHLY_TURN_LIMIT - turns),
    unlimited,
  }
}

/**
 * Check the quota BEFORE doing the work. Returns null when the turn may
 * proceed, or a human-readable reason when it may not.
 *
 * Checked before rather than after on purpose: the cost is incurred by running
 * the turn, so refusing afterwards would mean paying for the work and still
 * disappointing the user.
 */
export async function checkQuota(
  userId: string,
  email?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string; usage: UsageSnapshot }> {
  const usage = await getUsage(userId, email)
  if (usage.unlimited || usage.remaining === null || usage.remaining > 0) return { ok: true }
  return {
    ok: false,
    reason:
      `You have used all ${usage.limit} turns included this month (${usage.period}). ` +
      `Each turn runs a real research loop, so they cost real money to serve.`,
    usage,
  }
}

/**
 * Record a completed turn. Never throws — metering must not be able to break a
 * turn the user already received.
 */
export async function recordTurn(
  userId: string,
  counts: { modelCalls?: number; toolCalls?: number } = {},
): Promise<void> {
  const period = currentPeriod()
  try {
    await db.usageCounter.upsert({
      where: { userId_period: { userId, period } },
      create: {
        userId,
        period,
        turns: 1,
        modelCalls: counts.modelCalls ?? 0,
        toolCalls: counts.toolCalls ?? 0,
      },
      update: {
        turns: { increment: 1 },
        modelCalls: { increment: counts.modelCalls ?? 0 },
        toolCalls: { increment: counts.toolCalls ?? 0 },
      },
    })
  } catch (error) {
    console.error('[usage] failed to record a turn (the turn itself was fine):', error)
  }
}
