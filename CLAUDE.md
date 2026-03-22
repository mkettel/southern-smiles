@AGENTS.md

# Southern Smiles — Stats & Conditions

## Project Overview

A weekly performance tracking application for Southern Smiles Dental (Dr. Monzer Shakally). Replaces a fragile 22-sheet Google Sheets system with a proper web app.

**Tech Stack:** Next.js 16 (App Router) + Supabase (Postgres/Auth/RLS) + Tailwind CSS + shadcn/ui (v4, base-ui based) + Recharts

## Architecture

### Data Flow
- Employees log in and submit weekly stat values via `/enter`
- The conditions engine (`lib/conditions.ts`) auto-calculates a condition (Affluence/Normal/Emergency/Danger/Non-Existence) based on week-over-week % change
- Playbook action steps are shown based on the calculated condition
- Admin dashboard at `/dashboard` shows all 12 stats with sparklines, deltas, and condition badges
- Admin can manage stats, employees, posts, and divisions via `/admin/*`

### Key Directories
- `app/(auth)/` — Login page (unauthenticated layout)
- `app/(app)/` — All authenticated pages (sidebar + header layout)
- `actions/` — Server actions for all data operations (auth, stat-entries, dashboard, admin, oic-log)
- `lib/conditions.ts` — Pure function conditions engine (runs client-side for live preview, server-side at submission)
- `lib/supabase/` — Supabase client helpers (client.ts, server.ts, middleware.ts)
- `components/ui/` — shadcn/ui primitives
- `components/dashboard/` — Dashboard-specific components (stat-card, sparkline, week-selector)
- `components/stats/` — Stat entry and display components
- `components/admin/` — Admin CRUD components
- `supabase/migrations/` — Database schema SQL
- `supabase/seed.sql` — Initial seed data (divisions, posts, stats, condition playbooks)
- `supabase/historical_data.sql` — Full historical import (134 stat entries, 35 OIC logs)

### Database Schema
- `profiles` — Linked to Supabase auth.users via trigger
- `divisions` → `posts` → `stats` — Org structure hierarchy
- `employee_posts` — Many-to-many assignments (one person can hold multiple posts)
- `stat_entries` — Weekly data points with auto-calculated conditions
- `condition_playbooks` — The 5 conditions with their action step prompts
- `oic_log` — Operational change log

### Conditions System
The 5 conditions are determined by effective % change (inverted for `good_direction = 'down'` stats like Accounts Receivable):
- **Affluence** (>+20%): Economize, pay bills, invest, analyze what caused it
- **Normal** (+1% to +20%): Don't change what's working
- **Emergency** (0% to -15%): Promote and PRODUCE, change operating basis
- **Danger** (-15% to -40%): Handle the specific situation, tighten discipline
- **Non-Existence** (<-40%): Find a comm line, make yourself known, produce

### Team (4 employees, 12 stats)
- Dr. Monzer Shakally (admin) — Doctor: Production ($)
- Odalis — Financial Coordinator + TX Coordinator: Collections, A/R, Collections/Staff, # Consults, % Tx Close
- Lesley Galindo — PR Officer + Scheduling Coordinator: New Reaches, New Patients, % Appts Kept, % Recall Kept
- Evelis — Receptionist: BMO, Personalized Outflow

## Important Conventions

### shadcn/ui v4 (base-ui)
This project uses shadcn/ui v4 which is built on `@base-ui/react`, NOT Radix UI. Key differences:
- **No `asChild` prop** — Use `render` prop or style triggers directly instead
- **Select `onValueChange`** passes `string | null` — Always guard with `(v) => v && setState(v)`
- **Dialog/Sheet triggers** — Style the trigger element directly, don't wrap with Button using asChild
- **Button** — Based on `@base-ui/react/button`, no `asChild` support

### Next.js 16
- Uses `proxy.ts` instead of `middleware.ts` (renamed convention)
- Export must be `export default async function proxy()`
- `searchParams` and `params` are Promises — must `await` them in page components
- Read the docs in `node_modules/next/dist/docs/` before using unfamiliar APIs

### Supabase Auth
- Auth cookies can cause HTTP 431 errors if stale chunks accumulate — the proxy handles cleanup
- RLS is enabled on all tables — employees see only their own data, admins see everything
- The `is_admin()` SQL function is used in RLS policies

### When Adding New Features
- Follow the Vercel React Best Practices skill (`@vercel-react-best-practices`) for performance patterns
- Use Server Components by default, only add `"use client"` when state/interactivity is needed
- Parallelize independent data fetches with `Promise.all()` in server components
- Use server actions in `actions/` for all mutations — validate with Zod schemas from `lib/validators.ts`
- Keep the conditions engine (`lib/conditions.ts`) as a pure function — no DB calls
- Use `revalidatePath()` after mutations to refresh affected pages

## Commands
- `npm run dev` — Start dev server
- `npx next build` — Production build (use to verify before deploying)
