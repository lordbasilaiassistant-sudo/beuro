'use client'

// ============================================================
// AuthPanel — create an account or sign in.
// Your workspace starts empty: no demo bots, no fake data.
// ============================================================

import { useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LoginInput, SignupInput } from '@/lib/grokbok-types'
import { cn } from '@/lib/utils'
import type { GrokbokStore } from '../workspace/use-grokbok'

export type AuthMode = 'signin' | 'signup'

const inputClasses =
  'h-11 border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40'

export function AuthPanel({
  store,
  initialMode,
  onBack,
}: {
  store: GrokbokStore
  initialMode: AuthMode
  onBack: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-black px-4 py-10 text-zinc-100">
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="size-3.5" /> Back to grokbok.com
        </button>

        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-[7px] bg-white"
          >
            <span className="size-2.5 rounded-full bg-black" />
          </span>
          <span className="text-lg font-semibold tracking-tight">GrokBok</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
          {mode === 'signup'
            ? 'Hire AI teammates, connect your tools, and hand them real work. You start from a clean slate — nothing is pre-made.'
            : 'Sign in to your bots, your tools and your work.'}
        </p>

        <div className="mt-6">
          {mode === 'signup' ? (
            <SignupForm store={store} onSwitch={() => setMode('signin')} />
          ) : (
            <SigninForm store={store} onSwitch={() => setMode('signup')} />
          )}
        </div>
      </div>
    </main>
  )
}

function SignupForm({
  store,
  onSwitch,
}: {
  store: GrokbokStore
  onSwitch: () => void
}) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const valid =
    name.trim().length > 0 &&
    email.trim().length > 3 &&
    password.length >= 8

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    const input: SignupInput = {
      name: name.trim(),
      email: email.trim(),
      password,
      ...(company.trim() ? { company: company.trim() } : {}),
    }
    // On success the page-level view switches to the workspace (me is set).
    await store.signup(input)
    setSaving(false)
  }

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="auth-name" className="text-xs text-zinc-400">
          Your name
        </Label>
        <Input
          id="auth-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Dana Reed"
          className={inputClasses}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="auth-company" className="text-xs text-zinc-400">
          Company <span className="text-zinc-600">(optional)</span>
        </Label>
        <Input
          id="auth-company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          autoComplete="organization"
          placeholder="Acme Corp"
          className={inputClasses}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="auth-email" className="text-xs text-zinc-400">
          Work email
        </Label>
        <Input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@company.com"
          className={inputClasses}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="auth-password" className="text-xs text-zinc-400">
          Password
        </Label>
        <Input
          id="auth-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className={inputClasses}
        />
      </div>
      <Button
        type="submit"
        disabled={!valid || saving}
        className="mt-1.5 h-11 w-full gap-1.5 rounded-lg bg-white text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-40"
      >
        {saving && <Loader2 className="size-4 animate-spin" />}
        Create account
      </Button>
      <p className="text-center text-xs text-zinc-500">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="cursor-pointer text-zinc-200 underline-offset-2 hover:underline"
        >
          Sign in
        </button>
      </p>
    </form>
  )
}

function SigninForm({
  store,
  onSwitch,
}: {
  store: GrokbokStore
  onSwitch: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const valid = email.trim().length > 3 && password.length > 0

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    const input: LoginInput = { email: email.trim(), password }
    // On success the page-level view switches to the workspace (me is set).
    await store.login(input)
    setSaving(false)
  }

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="signin-email" className="text-xs text-zinc-400">
          Email
        </Label>
        <Input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@company.com"
          className={inputClasses}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="signin-password" className="text-xs text-zinc-400">
          Password
        </Label>
        <Input
          id="signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
          className={inputClasses}
        />
      </div>
      <Button
        type="submit"
        disabled={!valid || saving}
        className={cn(
          'mt-1.5 h-11 w-full gap-1.5 rounded-lg bg-white text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-40',
        )}
      >
        {saving && <Loader2 className="size-4 animate-spin" />}
        Sign in
      </Button>
      <p className="text-center text-xs text-zinc-500">
        New to GrokBok?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="cursor-pointer text-zinc-200 underline-offset-2 hover:underline"
        >
          Create an account
        </button>
      </p>
    </form>
  )
}
