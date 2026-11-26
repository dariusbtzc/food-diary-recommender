# Food Diary Recommender

A personal PWA for logging meals out with friends and recommending places that suit everyone at the table.

Next.js (App Router) on Vercel, with Supabase for the database, auth, storage and background jobs. Meals are parsed in the background by a Supabase Edge Function (Deno) that calls Claude Haiku.

## Requirements

- Node 24
- Docker (for the local Supabase stack)
- Deno 2 (for `supabase/functions/`). Install it with Deno's installer (`curl -fsSL https://deno.land/install.sh | sh`), which puts it in `~/.deno/bin`. Homebrew may not be able to build it.

The Supabase CLI is a dev dependency, so always run it through `npx`.

## Run locally

```bash
npm install
npx supabase start                                  # local Postgres, Auth, Storage and Edge Runtime
cp .env.example .env.local                          # fill in the Supabase values from `npx supabase status`
npm run dev                                         # http://localhost:3000
```

### Background parsing (optional)

You only need this to see logged meals get parsed locally.

1. Create `supabase/functions/.env` with `ANTHROPIC_API_KEY` and `PARSE_WORKER_SECRET` (the names are in `.env.example`; it is gitignored).
2. Serve the functions: `npx supabase functions serve`.
3. Open local Studio (http://127.0.0.1:54323), paste `supabase/snippets/vault-setup.sql` into the SQL editor, replace the placeholders (local URL `http://kong:8000/functions/v1` and the same `PARSE_WORKER_SECRET`), and run it.

Vault is emptied by every `npx supabase db reset`, so run step 3 again after each one.

## Schema changes

```bash
npx supabase migration new <name>                       # write the SQL, with RLS for any new table
npx supabase db reset                                   # apply migrations and seed
npx supabase gen types typescript --local > lib/db/types.ts
npx supabase test db                                    # pgTAP tests in supabase/tests/
```

Never hand-edit `lib/db/types.ts`.

## Before every commit

```bash
npm run lint && npm run typecheck && npm test
```

If the commit touches `supabase/functions/`, also run:

```bash
npm run check:functions && npm run test:functions    # Deno lint, type check and tests
```

### Parse prompt golden set

After any change to `supabase/functions/parse-meal/prompt.ts` or `schema.ts`, run:

```bash
npm run test:prompt
```

This runs the real prompt on the golden set in `supabase/functions/parse-meal/golden/` and prints a match table. It uses the real Anthropic key from `supabase/functions/.env`, costs about USD 0.01 a run, and isn't part of the pre-commit checks.

## Repo structure

```text
.
├── app/                          # Next.js App Router (Node, deployed to Vercel)
│   ├── (tabs)/                   # tabbed screens: home + quick log, diary, people, recommend
│   ├── api/
│   │   ├── cron/keep-alive/      # daily Vercel cron (see vercel.json)
│   │   └── meals/                # create a meal; signed photo upload URL
│   ├── auth/callback/            # Supabase auth callback
│   └── login/                    # login screen and server actions
├── components/                   # shared UI (TabBar, Chip, StarRating, PhotoPicker, service worker)
├── lib/                          # server and shared helpers; unit tests sit next to the code
│   ├── auth/                     # safe redirect handling
│   ├── cron/                     # cron bearer-token check
│   ├── db/types.ts               # generated Supabase types (never hand-edit)
│   ├── meals/                    # meal creation, payload, meal-type inference
│   ├── photos/                   # client-side compression and upload
│   ├── supabase/                 # browser, server, anon and proxy clients; env
│   ├── validation/               # Zod schemas for external input
│   └── cuisines.ts               # cuisine list (mirrored in supabase/functions/_shared/)
├── public/                       # PWA manifest, service worker and icons
├── supabase/
│   ├── config.toml               # local stack and function config
│   ├── migrations/               # schema, RLS, RPCs, parse queue and crons
│   ├── tests/                    # pgTAP tests (`npx supabase test db`)
│   ├── snippets/vault-setup.sql  # sets the Vault secrets the parse queue needs
│   ├── seed.sql
│   └── functions/                # Edge Functions (Deno; never imported by the app)
│       ├── deno.json, deno.lock
│       ├── _shared/              # admin client, worker auth, cuisine list
│       └── parse-meal/           # queue worker: prompt, schema, parse, store, golden set
├── tests/                        # repo-wide config checks
├── proxy.ts                      # Next.js proxy (session refresh)
├── vercel.json                   # region and crons
└── .env.example                  # env variable names only
```

Next.js and `supabase/functions/` never import from each other, so code that both need (such as the cuisine list) lives in both, and a repo test checks the copies match.
