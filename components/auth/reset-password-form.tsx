"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { completePasswordReset } from "@/actions/password-reset";
import { ResetLinkInvalid } from "@/components/auth/reset-link-invalid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-reset";

interface ResetPasswordFormProps {
  /** One-time token from the emailed link; null when a recovery session is used instead. */
  tokenHash: string | null;
  /** The account the recovery session belongs to, when one is already held. */
  accountId: string | null;
  email: string | null;
}

const ERROR_ID = "reset-password-error";

export function ResetPasswordForm({ tokenHash, accountId, email }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || leaving;

  // Used as the form's `action` (not onSubmit) so React holds a submit made
  // before the page finishes loading instead of letting the browser send the
  // password to the URL as a plain GET.
  function handleSubmit(submitted: FormData) {
    if (busy) return;
    setError(null);

    // The submitted fields are the truth (a password manager may have filled
    // them before React was listening); mirror them back into state.
    const nextPassword = String(submitted.get("new-password") ?? "");
    const nextConfirm = String(submitted.get("confirm-new-password") ?? "");
    setPassword(nextPassword);
    setConfirmPassword(nextConfirm);

    if (nextPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    if (nextPassword.length > PASSWORD_MAX_LENGTH) {
      setError(`Password must be ${PASSWORD_MAX_LENGTH} characters or less`);
      return;
    }
    if (nextPassword !== nextConfirm) {
      setError("Passwords don't match");
      return;
    }

    const formData = new FormData();
    formData.set("password", nextPassword);
    formData.set("confirm_password", nextConfirm);
    if (tokenHash) formData.set("token_hash", tokenHash);
    if (accountId) formData.set("account", accountId);

    startTransition(async () => {
      try {
        const result = await completePasswordReset(formData);
        if ("error" in result) {
          if (result.linkInvalid) {
            setLinkInvalid(true);
          } else {
            setError(result.error);
          }
          return;
        }
        // A full navigation: the session just changed, and replacing the
        // entry keeps the reset link out of the Back button's reach.
        setLeaving(true);
        window.location.replace(result.next);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  if (linkInvalid) return <ResetLinkInvalid />;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>
          {email ? (
            <>
              For <span className="font-medium text-foreground">{email}</span>.
              You&apos;ll be signed in once it&apos;s saved.
            </>
          ) : (
            "You'll be signed in once it's saved."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4" noValidate>
          {email && (
            // Lets password managers file the new password under the right account.
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              hidden
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `new-password-hint ${ERROR_ID}` : "new-password-hint"}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide passwords" : "Show passwords"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p id="new-password-hint" className="text-xs text-muted-foreground">
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm New Password</Label>
            <Input
              id="confirm-new-password"
              name="confirm-new-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ERROR_ID : undefined}
            />
          </div>
          {error && (
            <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Saving..." : "Save new password"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
