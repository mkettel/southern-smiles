"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getOrgSlugFromHost,
  isLocalHost,
  isPrimaryDomainHost,
  normalizeOrgSlug,
  PRIMARY_DOMAIN,
} from "@/lib/tenant";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface LoginFormProps {
  defaultIdentifier?: string;
  organizationSlug?: string;
  showOrganization?: boolean;
  practiceName: string;
}

export function LoginForm({
  defaultIdentifier = "",
  organizationSlug = "",
  showOrganization = false,
  practiceName,
}: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const rawOrganization = (formData.get("organization") as string) ?? "";
    const organization = normalizeOrgSlug(rawOrganization);

    if (rawOrganization.trim() && !organization) {
      setError("Enter a valid organization");
      return;
    }

    formData.set("organization", organization);

    if (organization && typeof window !== "undefined") {
      const currentHost = window.location.hostname;
      const currentOrg = getOrgSlugFromHost(window.location.host);
      const shouldMoveToOrgHost =
        !isLocalHost(currentHost) &&
        organization !== currentOrg &&
        (isPrimaryDomainHost(currentHost) || Boolean(currentOrg));

      if (shouldMoveToOrgHost) {
        const identifier = (formData.get("identifier") as string) ?? "";
        const url = new URL(window.location.href);
        url.hostname = `${organization}.${PRIMARY_DOMAIN}`;
        url.pathname = "/login";
        url.search = "";
        if (identifier.trim()) {
          url.searchParams.set("identifier", identifier.trim());
        }
        window.location.assign(url.toString());
        return;
      }
    }

    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{practiceName}</CardTitle>
        <CardDescription>
          Sign in to access your stats dashboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {showOrganization && (
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <div className="flex">
                <Input
                  id="organization"
                  name="organization"
                  type="text"
                  placeholder="ssmiles"
                  required
                  defaultValue={organizationSlug}
                  autoComplete="organization"
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
              required
              defaultValue={defaultIdentifier}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-primary hover:underline"
            >
              Create a practice
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
