# Hunterr

> An AI job-discovery agent for engineers - built with Next.js 16 + Claude Sonnet 4.6.

Hunterr crawls 25+ public ATS boards (Greenhouse, Lever, Ashby), filters roles by skills, location, and posted date, then sends the survivors to Claude alongside your resume for a structured fit analysis (score, verdict, strengths, gaps). Results land in an auth-gated dashboard you can browse on desktop or phone.

🔒 **Private alpha — invite only.** There is no public signup. Accounts are created from the CLI by the admin.

> **Live demo:** _coming soon_ (Vercel deploy pending)

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS v4, shadcn/ui (Base UI primitives) |
| Auth | Auth.js v5 (Credentials provider, JWT sessions, bcryptjs) |
| Database | Drizzle ORM + SQLite (local) — Postgres on deploy |
| AI | Anthropic SDK + Claude Sonnet 4.6 (prompt caching + structured outputs) *— pipeline port in progress* |
| Deploy | Vercel (hobby tier) *— planned* |

---

## Run locally

### Prerequisites

- **Node.js 20+** (24 LTS recommended — required for `--env-file` flag)
- **npm 10+**
- macOS or Linux. Windows works via WSL.

### 1. Install dependencies

```bash
git clone <repo-url>
cd hunterr-web
npm install
```

### 2. Set up environment variables

Create `.env.local` at the project root:

```bash
DATABASE_URL=./local.db
AUTH_SECRET=<paste-32-char-random-secret>
```

Generate `AUTH_SECRET` with:

```bash
openssl rand -base64 32
```

### 3. Initialize the database

```bash
npm run db:push
```

This creates `local.db` (SQLite) and applies the Drizzle schema (the `users` table for now).

### 4. Create your first user

There is no signup page — accounts are created via CLI:

```bash
npm run create-user -- you@example.com yourpassword "Your Name"
```

The name is optional. Email gets normalized to lowercase before storage.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Sign in**, and use the credentials from step 4.

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server with Turbopack on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply the current Drizzle schema to the database (dev iteration) |
| `npm run db:studio` | Open Drizzle Studio in the browser for visual DB inspection |
| `npm run create-user -- <email> <password> [name]` | Create a new user account |

---

## Project structure

```
hunterr-web/
├── drizzle.config.ts          # Drizzle ORM config
├── scripts/
│   └── create-user.ts         # CLI to create user accounts
├── src/
│   ├── app/
│   │   ├── api/auth/[...nextauth]/route.ts   # Auth.js v5 endpoints
│   │   ├── dashboard/page.tsx                # Auth-gated dashboard (placeholder)
│   │   ├── signin/
│   │   │   ├── page.tsx                      # Sign-in page (server component)
│   │   │   ├── sign-in-form.tsx              # Client component using server action
│   │   │   └── actions.ts                    # Server action calling signIn()
│   │   ├── layout.tsx                        # Root layout (dark mode, fonts)
│   │   └── page.tsx                          # Public landing page
│   ├── auth.config.ts         # Edge-safe Auth.js config (used by middleware)
│   ├── auth.ts                # Full Auth.js config (DB lookup + bcrypt)
│   ├── middleware.ts          # Route protection for /dashboard
│   ├── components/ui/         # shadcn/ui components (Button, Card, Input, Label)
│   ├── lib/db/
│   │   ├── schema.ts          # Drizzle schema (users table)
│   │   └── index.ts           # Drizzle client (better-sqlite3)
│   └── types/next-auth.d.ts   # Augments Session.user.id
├── local.db                   # SQLite database (gitignored)
└── .env.local                 # Environment variables (gitignored)
```

---

## How auth works

- **Auth.js v5** (`next-auth@5.0.0-beta`) with the **Credentials provider**.
- The config is **split into two files**:
  - `src/auth.config.ts` — edge-safe, no DB imports. Used by `src/middleware.ts`, which runs on the Edge runtime.
  - `src/auth.ts` — full config including the `authorize()` callback that hits the DB. Used by the API route handler and server actions.
- **JWT sessions** — no DB round-trip per request.
- **bcryptjs** for password hashing — pure JS, Vercel-compatible, no native compilation.
- **Middleware** redirects unauthenticated requests for `/dashboard/*` to `/signin?callbackUrl=...`, and redirects already-authenticated users away from `/signin`.

The invite-only contract: there is no signup route. Accounts only exist if an admin runs `npm run create-user`.

---

## Status & roadmap

### ✅ Done

- Landing page (`/`) with hero, "How it works", tech stack, footer
- Sign-in page (`/signin`) wired to a Next.js server action
- Auth.js v5 with Credentials provider + bcrypt
- Drizzle ORM + SQLite, `users` table
- Middleware-based route protection
- Dashboard placeholder (`/dashboard`) showing the signed-in user
- CLI `create-user` script

### 🚧 Coming next

- Port `hunt.py` pipeline to TypeScript (Greenhouse / Lever / Ashby fetchers, filters)
- Anthropic SDK integration with prompt caching + structured outputs (Zod schemas)
- "Run new hunt" button with live-streaming SSE progress
- Job results UI (verdict tiers, filters, search)
- Apply tracking (`apply_status` table: applied / interviewing / rejected / interviewed)
- Resume upload page
- Swap SQLite → Vercel Postgres
- Deploy to Vercel

---

## Companion project

This is the web frontend. The original Python CLI version lives at [`../hunterr/`](../hunterr/) — it's the working reference pipeline this app ports.

---

## License

Personal project. Not open for contributions yet.

Built by Nishin S.
