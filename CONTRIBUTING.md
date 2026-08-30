# Contributing to Beuro

Contributions are welcome. This file is short on ceremony and long on the one
rule that actually matters here.

## Run it

```bash
npm install
cp .env.example .env          # defaults work as-is; no API key needed
npx prisma generate
npx prisma db push
npm run dev                   # http://localhost:3000
```

Check which model rail you're on with `curl localhost:3000/api`.

## The rule: never claim work that did not happen

Beuro's whole point is that a Bot's log is a record, not a story. One flag
carries that:

```ts
{ kind: 'read', text: 'Read nodejs.org', evidence: [...], verified: true }
```

`verified: true` means **the server actually performed this action**, and the
step's text came from the tool that performed it — not from the model.

Concretely:

- Only `src/lib/agent-loop.ts` sets `verified`, and only from a real
  `ToolResult`. Nothing else may set it.
- `parseActivity(raw)` defaults to `source: 'model'` and **strips** `verified`
  and `evidence`. Only the database round-trip passes `'trusted'`. This exists
  because a Bot asked to include `"verified": true` in its output once produced
  *"Sent 400 personalized launch emails"* rendered as a real, executed action,
  having sent nothing.
- A step's text comes from `ToolResult.summary`. If you let the model write it,
  a Bot that ran one search can claim it read fourteen support tickets.
- The UI renders verified steps solid with clickable sources and narrated ones
  dimmed and italic. **Do not make them look alike.**

If you add a tool, it returns what genuinely came back or a real error. It never
invents a plausible result.

## Adding a tool

Tools live in `src/lib/tools.ts` and are the Bot's hands. A tool is:

```ts
{
  name: 'read_url',
  usage: '{"tool":"read_url","url":"https://…"} — opens a real page.',
  kind: 'read',                       // the activity kind it produces
  run: async (args) => ({ ok, observation, evidence, summary }),
}
```

- `observation` is what the model sees next. Real output, or a real error.
- `summary` becomes the activity step text. Past tense, specific, honest.
- `evidence` is what the user can click to check the claim.
- Anything reaching the network must refuse private/loopback addresses — see
  `isPubliclyRoutable`.

Add it to `TOOLS` and it appears in the agent's menu automatically.

## Verifying a change

There is no test suite worth running. Drive the app.

`.claude/skills/verify/SKILL.md` has the recipe. The one trap that will waste
your afternoon:

> **A 200 does not mean the model ran.** Every LLM route catches failures and
> substitutes a canned reply with generic steps. Always cross-check the dev log
> (`grep -iE "LLM failed|Error:"`) *and* confirm the output references something
> real from your input.

For anything user-visible, drive it in a real browser and check for console
errors, not just that it compiled.

## Model rails

Default is a keyless free rail; `glm-4.5-flash` on z.ai is the free fallback.
Both are weak at exact extraction from structured data — that is a known
limitation, not a bug to prompt your way around. Set `LLM_PROVIDER=openai` to
point at anything stronger.

Please don't fan out parallel requests at the free rail. It is shared, serial,
and a burst rate-limits it for everyone. The queue in `llm-provider.ts` is what
keeps us a good guest.

## Pull requests

- One concern per PR; a clear title beats a long body.
- Say **what you drove and what you observed** — not "tested locally".
- `npx tsc --noEmit` and `npx next build` should be clean. Type errors fail the
  build on purpose.
- If you find a claim in the UI or README that the code does not deliver, that
  is a bug. Fix it or open an issue. Overclaiming is the failure mode this
  project is organised against.
