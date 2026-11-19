import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Password updated",
  robots: { index: false, follow: false },
};

// Mirrors the default button look; buttonVariants lives in a client module
// and can't be called from this server component.
const primaryLinkClass =
  "inline-flex h-8 w-full items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function ResetPasswordDonePage() {
  // Reached right after a successful reset, which leaves the visitor signed
  // in. Anyone else has nothing to see here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Password updated</CardTitle>
        <CardDescription>
          {user.email ? (
            <>
              You&apos;re signed in as{" "}
              <span className="font-medium text-foreground">{user.email}</span>{" "}
              with your new password.
            </>
          ) : (
            <>You&apos;re signed in with your new password.</>
          )}{" "}
          Any other devices that were signed in to your account have been
          signed out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard" className={primaryLinkClass}>
          Continue to dashboard
        </Link>
      </CardContent>
    </Card>
  );
}
