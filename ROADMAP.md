# Stats & Conditions — Product Roadmap

## Current State (v1.0)

Multi-tenant SaaS application for dental practices using the Hubbard Management conditions framework. Supports practice signup, employee invitation, weekly stat tracking with auto-calculated conditions, playbook responses, OIC logging, org board reference, feature request board, PDF export, dark mode, PWA, and practice branding.

---

## Monetization — Freemium Model

### Free Tier (up to 3 users)
- All core features included
- 3 total users (including admin)
- Covers a solo dentist + receptionist + office manager
- Enough to experience the full value before paying

### Pro Tier — $49/month (unlimited users)
- Unlimited employees
- Priority support
- Data export (CSV, PDF)
- Custom branding (logo, colors, primary color theme)
- All current and future features

### Consultant/Coach Tier — $99/month (future)
- Multi-practice dashboard for MGE coaches and consultants
- Read-only view of all client practices' conditions at a glance
- Aggregate benchmarking across clients
- Coaches become the sales channel — they recommend the tool to every practice they work with

### Premium Add-ons (future)
- PMS Integration (Open Dental, Dentrix, Eaglesoft) — $29/month
- Benchmarking Reports — included with enough practices on platform

---

## Near-Term Features

### Dynamic Org Board
- **Currently:** Static reference data in `lib/org-board-data.ts`
- **Goal:** Pull from the database — divisions, departments, sections, posts all editable
- **Stretch:** Integrate Excalidraw or a canvas-based API (tldraw, React Flow) so the org board is visual, draggable, and malleable — users can rearrange the hierarchy, draw connections, annotate
- **Departments layer:** Add `departments` table between divisions and posts in the database schema

### Business Card Generator
- Generate printable business cards from employee profile data
- Practice name, logo, employee name, title (from post), phone, email, address
- Download as PDF or PNG
- Customizable templates that match practice branding

### Weekly Email Reminders
- Automated email sent to employees who haven't submitted stats by a configurable deadline (e.g., Friday 3pm)
- Configurable per practice — admin sets the reminder day/time
- Uses Supabase Edge Functions or a cron job
- Includes a direct link to the entry form for their stats

### Weekly Report Summary Email
- Auto-generated "State of the Practice" email sent to admin every week
- All 12 stats with conditions, deltas, who's trending up/down
- Missing submissions list
- OIC log entries from that week
- Basically the PDF report content delivered as an email

### Condition History Heatmap
- Grid view: rows = stats, columns = weeks, cells colored by condition
- At a glance: "Collections has been in Emergency for 4 weeks straight"
- Patterns jump out visually that you'd miss looking at individual stat cards
- Filterable by division, employee, date range

### Custom Condition Thresholds
- **Organization-level defaults:** A practice can customize the threshold boundaries (e.g., Affluence at >25% instead of >20%)
- **Per-stat overrides:** Individual stats can override the org defaults (e.g., Production is naturally volatile so Affluence threshold is >30%, while % Appointments Kept is stable so Affluence at >10%)
- **Schema:** Add `condition_thresholds` table with `practice_id` and optional `stat_id` — the conditions engine checks stat-specific → practice-level → global defaults in that priority order
- **UI:** Settings page for org defaults, per-stat override in the stat edit dialog

---

## Medium-Term Features

### Stripe Billing Integration
- Free/Pro tier gate in middleware
- Stripe Checkout for upgrade flow
- Billing management page (plan, invoices, cancel)
- Webhook handler for subscription events
- Grace period on downgrade (don't lock out immediately)

### Employee Invitation Improvements
- Custom branded invitation emails (practice logo, name, colors)
- Pending invitations list — see who hasn't accepted yet, resend
- Bulk invite — upload a CSV of employee names/emails
- Invite link sharing — generate a link to copy/paste (for practices that prefer Slack/text)

### Password Reset Flow
- `/reset-password` page exists but isn't built
- Standard flow: enter email → receive link → set new password
- Custom branded email template

### Goal Setting & Targets
- Admin sets a weekly target per stat (e.g., Collections goal: $25,000)
- Dashboard cards show progress bar toward target
- Target line on stat charts
- Condition calculation could optionally factor in distance-to-goal

### Previous Week Playbook on Entry Form
- When entering stats, show what the employee committed to last week
- "Last week you said: 'Follow up on 3 pending treatment plans.' How did it go?"
- Creates accountability loop — not just tracking numbers, tracking follow-through

### Condition Streak Alerts
- Flag when a stat has been in the same negative condition for 3+ consecutive weeks
- "Collections has been in Emergency for 4 weeks" is a different signal than one bad week
- Surface as alerts on the dashboard and in the weekly report

---

## Long-Term Features

### Consultant/Coach Dashboard
- Multi-practice read-only view for MGE coaches
- See all client practices' conditions at a glance
- Drill into any practice's stats, trends, OIC logs
- Aggregate trends across practices

### PMS Integration
- Auto-pull Production, Collections, Appointments from practice management software
- Supported systems: Open Dental, Dentrix, Eaglesoft
- Eliminates manual entry for the highest-value stats
- Real-time or daily sync

### Benchmarking
- Anonymous cross-practice comparison
- "Your Collections are in the 60th percentile compared to similar-sized practices"
- Only possible with multiple practices on the platform
- Network effect — the more practices join, the more useful the data

### Patient-Facing Features (requires HIPAA compliance)
- Review & reputation management (Google review tracking)
- Patient referral program ("Care to Share" digital version)
- Automated patient communications (appointment reminders, recall)
- Patient portal (appointments, treatment plans, billing)
- **Note:** Patient data = HIPAA. Requires encryption audit, BAA with Supabase, access controls, audit logging

### Data Export & Portability
- Full practice data export (CSV + JSON)
- Includes: all stats, entries, divisions, posts, employees, OIC logs, requests
- One-click download from Settings page
- Practices can leave with their data — builds trust

### Mobile-Optimized Entry Flow
- Swipe between stats on the entry form
- Progress indicator: "3 of 6 stats entered"
- Bigger touch targets for phone use
- Push notifications for reminders (PWA web push)

---

## Technical Debt & Infrastructure

### Testing
- Unit tests for `calculateCondition()` (the conditions engine)
- Integration tests for server actions with RLS verification
- E2E tests for critical flows (signup, stat entry, dashboard)

### Performance
- React.cache() for frequently called functions (getPracticeSettings, getCurrentPracticeId)
- Database connection pooling review
- Static generation for org board page
- Image optimization for logos

### Security
- Rate limiting on signup and login
- CSRF protection audit
- Service role key rotation procedure
- RLS policy penetration testing
- Audit logging for sensitive operations

### Monitoring
- Error tracking (Sentry)
- Uptime monitoring
- Database query performance tracking
- User analytics (anonymous usage patterns)
