"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { requestPasswordReset } from "@/actions/password-reset";
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
import { RESET_REQUEST_PATH } from "@/lib/password-reset";
import {
  getOrgSlugFromHost,
  isLocalHost,
  isPrimaryDomainHost,
  normalizeOrgSlug,
  PRIMARY_DOMAIN,
} from "@/lib/tenant";

interface ForgotPasswordFormProps {
  defaultIdentifier?: string;
  organizationSlug?: string;
  showOrganization?: boolean;
}

export function ForgotPasswordForm({
  defaultIdentifier = "",
  organizationSlug = "",
  showOrganization = false,
}: ForgotPasswordFormProps) {
  const [organization, setOrganization] = useState(organizationSlug);
  const [identifier, setIdentifier] = useState(defaultIdentifier);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Used as the form's `action` (not onSubmit) so a submit made before the
  // page finishes loading is held by React rather than sent as a plain GET.
  function handleSubmit(submitted: FormData) {
    if (isPending) return;
    setError(null);

    // The submitted fields are the truth (autofill can land before React is
    // listening); mirror them back into state.
    const rawIdentifier = String(submitted.get("identifier") ?? "");
    const rawOrganization = showOrganization
      ? String(submitted.get("organization") ?? "")
      : "";
    setIdentifier(rawIdentifier);
    if (showOrganization) setOrganization(rawOrganization);

    const trimmedIdentifier = rawIdentifier.trim();
    if (!trimmedIdentifier) {
      setError("Username or email is required");
      return;
    }

    const normalizedOrganization = normalizeOrgSlug(rawOrganization);
    if (rawOrganization.trim() && !normalizedOrganization) {
      setError("Enter a valid organization");
      return;
    }

    // Same rule as sign-in: on the shared domain, continue on the practice's
    // own host so the emailed link (and the session it creates) land there.
    if (normalizedOrganization) {
      const currentHost = window.location.hostname;
      const currentOrg = getOrgSlugFromHost(window.location.host);
      const shouldMoveToOrgHost =
        !isLocalHost(currentHost) &&
        normalizedOrganization !== currentOrg &&
        (isPrimaryDomainHost(currentHost) || Boolean(currentOrg));

      if (shouldMoveToOrgHost) {
        const url = new URL(window.location.href);
        url.hostname = `${normalizedOrganization}.${PRIMARY_DOMAIN}`;
        url.pathname = RESET_REQUEST_PATH;
        url.search = "";
        url.hash = "";
        url.searchParams.set("identifier", trimmedIdentifier);
        window.location.assign(url.toString());
        return;
      }
    }

    const formData = new FormData();
    formData.set("identifier", trimmedIdentifier);
    formData.set("organization", normalizedOrganization);

    startTransition(async () => {
      try {
        const result = await requestPasswordReset(formData);
        if ("error" in result) {
          setError(result.error);
        } else {
          setSent(true);
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  if (sent) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            If an account matches what you entered, a link to choose a new
            password is on its way. It can take a few minutes to arrive, and
            only the newest link works.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Nothing yet? Check your spam folder and wait a minute before
            asking again. You can also try your email address instead of
            your username, or ask your practice admin to reset your password
            for you.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
          >
            Try again
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          Enter your username or email and we&apos;ll send you a link to choose
          a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4" noValidate>
          {showOrganization && (
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <div className="flex">
                <Input
                  id="organization"
                  name="organization"
                  type="text"
                  placeholder="ssmiles"
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  autoComplete="organization"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="rounded-r-none"
                />
                <div className="flex items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground">
                  .{PRIMARY_DOMAIN}
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="identifier">Username or Email</Label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              placeholder="jsmith or you@example.com"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "forgot-password-error" : undefined}
            />
          </div>
          {error && (
            <p id="forgot-password-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Sending..." : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
