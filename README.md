# Food Diary Recommender

A personal PWA for logging meals out with friends and recommending places that suit everyone at the table.

Next.js (App Router) on Vercel, with Supabase for the database, auth, storage and background jobs.

## Run locally

Needs Node 24 and Docker.

```bash
npm install
cp .env.example .env.local   # then fill in the values from `npx supabase status`
npx supabase start           # local Postgres, Auth and Storage
npm run dev                  # http://localhost:3000
```

## Before every commit

```bash
npm run lint && npm run typecheck && npm test
```

## Layout

- `app/`: screens and `app/api/**/route.ts` (Node, Vercel)
- `components/`: shared UI components
- `lib/`: server helpers, `lib/scoring/`, generated `lib/db/types.ts`
- `public/`: PWA manifest and icons
- `supabase/`: config, migrations, seed, pgTAP tests and Edge Functions (Deno; never imported by the app)
- `tests/`: repo-wide config checks. Unit tests sit next to the code they test.
