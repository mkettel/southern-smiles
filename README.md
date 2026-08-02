This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Financial Connections

The Financial Connections admin page uses Plaid Liabilities for read-only
credit-card balances. Configure these server-only environment variables in
Vercel (and `.env.local` for sandbox testing):

```bash
PLAID_ENV=sandbox
PLAID_CLIENT_ID=...
PLAID_SECRET=...
FINANCIAL_TOKEN_ENCRYPTION_KEY=...
PLAID_REDIRECT_URI=https://ssmiles.survivalboard.org/admin/financial-connections
PLAID_WEBHOOK_URL=https://ssmiles.survivalboard.org/api/webhooks/plaid
CRON_SECRET=...
```

Generate the two application secrets separately:

```bash
openssl rand -base64 32
```

Apply `supabase/migrations/20260802224648_add_financial_connections.sql`, then
add the redirect URI in the Plaid dashboard. Keep `PLAID_ENV=sandbox` until the
test institution flow and daily sync are verified. Production Capital One
connections require Plaid Production access and the same HTTPS redirect URI.
