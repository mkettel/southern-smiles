# Password reset

Self-service reset for anyone who can't sign in. Supabase Auth sends the email
and owns the one-time token; the app owns every page the visitor sees.

## What the visitor does

1. **`/login`** has a "Forgot password?" link.
2. **`/reset-password`** asks for a username or email (plus the organization
   on the shared domain, same rule as sign-in). The answer shown is always
   "check your email", whether or not an account matched.
3. The email link opens **`/reset-password/update`**, where they choose a new
   password.
4. **`/reset-password/done`** confirms it. They are signed in with the new
   password, and every other session on the account is signed out.

Admins can still set a temporary password from the Employees page
(`setTemporaryPassword`); that path is unchanged and is the fallback for
anyone whose email address on file is wrong.

## Supabase dashboard setup (required)

Both settings live under **Authentication** in the Supabase dashboard.

### 1. Redirect URLs

URL Configuration → Redirect URLs. Add the update page for every host the app
is served from:

```
https://<primary-domain>/reset-password/update
https://*.<primary-domain>/reset-password/update
https://<any custom practice domain>/reset-password/update
http://localhost:3000/reset-password/update
```

If a host is missing, Supabase silently swaps the link's destination for the
Site URL. With the email template below, the proxy catches that case and
forwards the visitor to the update page on the Site URL host, so the reset
still works but they end up on the wrong host. With Supabase's stock template
there is no such rescue: the link lands on the Site URL's home page and the
reset fails.

The wildcard entry lets a reset link point at any single-level subdomain of
the primary domain. That is fine as long as every such subdomain serves this
app; list practice hosts individually if that ever stops being true.

### 2. "Reset Password" email template

Email Templates → Reset Password. Point the link at the app instead of at
Supabase:

```html
<h2>Reset your password</h2>
<p>Someone asked to reset the password for your account. If that was you, choose a new one here:</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
<p>This link works once and expires soon. If you didn't ask for it, ignore this email and your password stays the same.</p>
```

Why this matters: Supabase's stock template uses `{{ .ConfirmationURL }}`,
which spends the token the moment anything requests the link, and then only
works in the same browser that asked for it. With the template above:

- Mail scanners that pre-open links (Outlook Safe Links and similar) can't use
  up the token, because nothing is spent until the visitor submits the form.
- The link works on any device, not just the one that requested it.

The stock template is handled as a fallback (see "Two link shapes" below):
same browser only, and exposed to link scanners. Treat it as a safety net for
the window before this template is saved, not as a supported setup.

### Email delivery

Supabase's built-in mail sender is for testing only: it is heavily rate
limited and only delivers to members of the Supabase project. Real users need
custom SMTP configured under Authentication → Emails. If invitation emails
already reach employees, this is already in place.

Delivery failures and rate limits are deliberately not shown to the visitor.
They are logged on the server with the prefix `[password-reset]`. Supabase
allows one reset email per account per minute, and each new link cancels the
previous one.

There is no rate limiting in the app itself; Supabase's own limits (and its
CAPTCHA option, if ever needed) are the control.

## How it works

| Piece | File |
| --- | --- |
| Request + completion server actions | `actions/password-reset.ts` |
| Pure rules (recovery window, origin, lookups) | `lib/password-reset.ts` |
| "Is this a just-followed reset link?" check | `lib/recovery-session.ts` |
| Same-site redirect guard for the auth callback | `lib/auth-redirect.ts` |
| Pages | `app/(auth)/reset-password/**` |
| Forms | `components/auth/forgot-password-form.tsx`, `reset-password-form.tsx`, `reset-link-invalid.tsx` |

### Two link shapes

`/reset-password/update` accepts either:

- **`?token_hash=…&type=recovery`** (recommended template). The page renders
  the form without touching the token. `completePasswordReset` verifies it and
  sets the password in one step when the form is submitted.
- **`?code=…`** (stock template). The page hands the code to
  `/api/auth/callback`, which exchanges it for a session and returns here.
  This needs the cookie set when the reset was requested, so it only works in
  the same browser.

### Who may set a password without the current one

`decideResetAuthority` (in `lib/password-reset.ts`) makes the call, on the
server, from three inputs:

1. **A token from the email that this browser has not used.** It is verified
   with Supabase. It is never backed up by "whoever is signed in", which
   matters on a shared front-desk computer.
2. **A token this browser already used** (the password was rejected, the page
   was reloaded, the email link was clicked again). An HttpOnly cookie records
   which token was spent and for which account, and the reset continues on the
   session that token created, only if that session still belongs to the same
   account.
3. **No token** (the stock email's code exchange). The session must have been
   created from an emailed link within the last 30 minutes and must belong to
   the account the form was rendered for. Supabase records how a session was
   established in the signed `amr` claim; `hasRecentRecoveryAuth` accepts
   `recovery` and `otp` and nothing else.

An ordinary signed-in session (`amr` = `password`) never qualifies, so the
profile page's "current password required" rule can't be bypassed by visiting
the reset page.

As soon as the password is saved, the recovery session is replaced by a normal
password sign-in and all other sessions are ended, so the exception above does
not linger on the computer afterwards. If that automatic sign-in fails for any
reason, the visitor is signed out everywhere and sent to `/login` with a
"password updated" notice instead.

Note that `otp` also covers a session created moments ago from an invitation
link, so a newly invited employee can use the same page to set a password.

### Account lookup

Same rules as sign-in: a username is looked up within the organization when
one is given, and across practices otherwise. A username that exists in more
than one practice with no organization to pick between them sends nothing.
Lookups are narrowed to exact case-insensitive matches in code, so the
wildcard characters ILIKE understands can't select a neighbouring account.

Deactivated employees (`profiles.is_active = false`) are never sent a link.
Changing the password is how a deactivated account is locked out, so a
self-service reset must not undo it.

The form shows the same answer whether or not an account matched, which stops
it casually confirming who has an account. It is not a hardened guarantee: a
matched request takes longer and sets a short-lived flow cookie, and the
sign-in form already reports unknown usernames.

## Tests

`lib/password-reset.test.ts` locks in the authority rules above, the recovery
window, the fail-closed handling of unrecognised `amr` claims, the origin and
same-site redirect rules, and the exact-match lookup. Run it with:

```bash
npx tsx --test lib/password-reset.test.ts
```

The server actions themselves call Supabase and are not unit tested. After
the dashboard setup, do one real reset end to end; that is also the only way
to confirm the stock-template fallback against the live auth server.
