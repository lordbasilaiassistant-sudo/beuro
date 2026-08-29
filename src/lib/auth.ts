// ============================================================
// GrokBok — auth helpers (BACKEND ONLY)
// Passwords: node:crypto scrypt with per-user random salt.
// Sessions: HMAC-SHA256 signed token in an httpOnly cookie.
// No external dependencies, no plaintext secrets in the DB.
// ============================================================

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { db } from '@/lib/db'
import type { AuthUser } from '@/lib/grokbok-types'

export const SESSION_COOKIE = 'grokbok_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const SCRYPT_KEYLEN = 64

// ---------- password hashing ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, hash] = parts
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

// ---------- session signing ----------

/**
 * The signing secret: env AUTH_SECRET if set, otherwise a random key
 * generated once and persisted next to the database.
 */
function getSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) {
    return process.env.AUTH_SECRET
  }
  const secretPath = path.join(process.cwd(), 'db', 'auth-secret.key')
  try {
    if (existsSync(secretPath)) {
      const existing = readFileSync(secretPath, 'utf8').trim()
      if (existing.length >= 16) return existing
    }
    const secret = randomBytes(32).toString('hex')
    writeFileSync(secretPath, secret, { mode: 0o600 })
    return secret
  } catch {
    // Read-only FS fallback — same-process consistency is still enforced.
    return 'grokbok-fallback-secret-do-not-use-in-prod'
  }
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

/** Opaque, tamper-proof token: base64url(JSON payload) + '.' + HMAC. */
export function createSessionToken(userId: string): string {
  const payload = base64url(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_SECONDS * 1000 }),
  )
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: unknown
      exp?: unknown
    }
    if (typeof data.uid !== 'string' || typeof data.exp !== 'number') return null
    if (Date.now() > data.exp) return null
    return data.uid
  } catch {
    return null
  }
}

// ---------- cookie + request helpers ----------

export function sessionCookieValue(token: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
  if (process.env.NODE_ENV === 'production') attrs.push('Secure')
  return attrs.join('; ')
}

export function clearedSessionCookieValue(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

/** Extract the signed-in user row from the request cookie, or null. */
export async function getSessionUser(req: Request): Promise<{ id: string } | null> {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  if (!match) return null
  const token = match.slice(SESSION_COOKIE.length + 1)
  const userId = verifySessionToken(token)
  if (!userId) return null
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  return user
}

export function toAuthUser(row: {
  id: string
  email: string
  name: string
  company: string
  createdAt: Date
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Shared 401 body. */
export function unauthorized() {
  return Response.json({ error: 'You need to sign in first' }, { status: 401 })
}
