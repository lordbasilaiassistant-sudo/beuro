---
name: verify
description: Build, run and drive Beuro to observe a change at its real surface (the HTTP API). Use when verifying a diff in this repo.
---

# Verifying Beuro

Surface is the Next.js server's HTTP API. There is no test suite worth running —
drive the routes.

## Handle

```bash
npm install                 # bun is in package.json but is NOT installed here; npm works
npx prisma generate
npx prisma db push          # DATABASE_URL is relative to prisma/, so ../db/custom.db
npx next dev -p 3131 > /tmp/dev.log 2>&1 &
sleep 14                    # first compile is slow; probe /api until it answers
```

Windows: kill a server with
`netstat -ano | grep ':3131' | grep LISTENING | awk '{print $5}' | xargs -I{} taskkill //PID {} //F`

## Drive it

Every meaningful path needs a session cookie. Signup first, keep the jar.

```bash
curl -s localhost:3131/api                       # health + which LLM rail is live
curl -s -c jar -X POST localhost:3131/api/auth/signup -H 'content-type: application/json' \
  -d '{"email":"v@example.com","name":"Vera","company":"QA","password":"verifypass123"}'
curl -s -b jar -X POST localhost:3131/api/bots -H 'content-type: application/json' \
  -d '{"name":"Ledger","role":"reconcile invoices"}'      # calls the LLM for the persona
curl -s -b jar http://localhost:3131/api/state            # ids for bots/threads
curl -s -b jar -X POST localhost:3131/api/threads -H 'content-type: application/json' \
  -d '{"botIds":["<botId>"]}'
curl -s -b jar -X POST localhost:3131/api/chat -H 'content-type: application/json' \
  -d '{"threadId":"<id>","content":"..."}'                # the main LLM path
```

`/api/bots` needs **both** `name` and `role` — there is no `prompt` field.

## Gotchas that cost time

- **Inference failures are invisible from the response.** Every LLM route
  catches and substitutes a canned persona ("You are a diligent AI teammate.")
  or a canned reply ("On it — I'll take this from here…") with generic activity
  steps. A 200 does NOT mean the model ran. Always confirm against `dev.log`
  (`grep -iE "LLM failed|Error:"`) and check the output references something
  from your prompt.
- **Swap rails with env on the dev command**, no code edit:
  `GLM_BASE=http://127.0.0.1:9` (dead rail, tests degradation) or
  `LLM_PROVIDER=openai LLM_BASE_URL=... LLM_MODEL=... LLM_API_KEY=...`.
- **Groq model names go stale.** A 404 `model_not_found` is the account, not the
  code — list reachable models with
  `curl $LLM_BASE_URL/models -H "Authorization: Bearer $KEY"`.
- The free GLM rail is **serial**; the provider queues every call. Firing N
  parallel requests should show N staggered completions, not N failures.
- `rev` does not exist in this Git Bash. `bun` does not either.
- `examples/` is excluded from tsconfig (needs socket.io, not a dependency).
