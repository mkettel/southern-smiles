"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RESET_REQUEST_PATH } from "@/lib/password-reset";

export function ResetLinkInvalid() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">This link has expired</CardTitle>
        <CardDescription>
          Reset links work once and only for a short time. Request a new one
          and use it as soon as it arrives.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Link
          href={RESET_REQUEST_PATH}
          className={buttonVariants({ className: "w-full" })}
        >
          Request a new link
        </Link>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
