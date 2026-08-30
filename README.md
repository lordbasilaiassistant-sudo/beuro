# Beuro

AI teammates that do real work on their own computers — hire a bot, give it a
job, watch it think, sign in, read, and write its way through the task.

Next.js 16 · React 19 · Prisma/SQLite · Tailwind v4 · shadcn/ui.

---

## It needs no API key

Inference runs through a **pluggable provider** with a keyless free rail as the
default. There is one inference chokepoint in the whole codebase —
`chatCompletion()` in `src/lib/llm-provider.ts` — so swapping models is a
one-file change, not a refactor.

```
src/lib/llm-provider.ts   ← the only place that talks to a model
src/lib/grokbok-llm.ts    ← callLLM() + JSON repair + activity parsing
```

### Providers

| `LLM_PROVIDER` | What it is | Key needed |
|---|---|---|
| `glm` *(default)* | Free chat via a Z.ai-hosted Web Dev SDK deployment. The platform supplies model access. | **none** |
| `openai` | Any OpenAI-compatible `POST /chat/completions` — Z.ai paid, Groq, OpenRouter, Ollama, vLLM, OpenAI. | usually |

```bash
# Free rail (default) — nothing to configure.
LLM_PROVIDER=glm

# Or point it at anything OpenAI-compatible:
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=openai/gpt-oss-120b
LLM_API_KEY=...
```

Model names go stale — Groq decommissions them. If you get
`llm: HTTP 404 ... model_not_found`, list what your account can actually
reach (`curl $LLM_BASE_URL/models -H "Authorization: Bearer $LLM_API_KEY"`)
and set `LLM_MODEL` to one of those.

Check which rail is live:

```bash
curl localhost:3000/api
# {"ok":true,"service":"beuro","llm":{"provider":"glm-free","keyed":false,...}}
```

### ⚠️ The free rail is serial

Measured against the live deployment: concurrency 1 → 1/1, 2 → 2/2, 3 → 2/3,
**4 → 0/4**. A burst of ten parallel calls rate-limited the *entire*
deployment for over 60 seconds across every endpoint — the quota is shared and
we are a guest on it.

`llm-provider.ts` therefore puts every request in the process through one queue
with a floor gap and backs off hard on a rate limit. **Never `Promise.all` it.**
An upstream 429 arrives as an HTTP 500 with `status 429` in the *body*, so
status codes alone will mislead you.

It is a preview deployment with no SLA and a URL that rotates — override with
`GLM_BASE`. For anything a customer touches, set `LLM_PROVIDER=openai` and
point it at a rail you control.

---

## Run it

```bash
npm install
cp .env.example .env          # defaults work as-is
npx prisma generate
npx prisma db push
npm run dev                   # http://localhost:3000
```

Sign up in the UI, hire a bot, open a thread. No demo data and no shared
state — every account owns its own bots, threads, memories, routines and
connections.

## Build

```bash
npx next build                # type errors fail the build, on purpose
npm start
```

## Layout

```
src/app/api/          auth · bots · chat · threads · routines · connections · state
src/components/grokbok/
  landing/            marketing page
  workspace/          sidebar · chat panel · computer pane · dialogs
src/lib/
  llm-provider.ts     ← model rail (the swap point)
  grokbok-llm.ts      callLLM + JSON repair + activity/memory parsing
  auth.ts             scrypt passwords, HMAC session cookies, zero deps
  db.ts               Prisma client singleton
prisma/schema.prisma  User · Bot · Thread · Message · Memory · Routine · Connection
```

`.zscripts/` and `Caddyfile` are the Z.ai platform's own build/serve scripts and
are not needed to run Beuro locally.

## Notes

- Passwords are scrypt with a per-user random salt; sessions are HMAC-SHA256 in
  an httpOnly cookie. No auth dependency, no plaintext secrets in the DB.
- `AUTH_SECRET` is read from env when it is ≥16 chars, otherwise a random key is
  generated once and persisted beside the database. **Set it in production.**
- Free-model output is fine for drafts, triage and extraction. It should never
  be the gate on money- or customer-facing decisions.
