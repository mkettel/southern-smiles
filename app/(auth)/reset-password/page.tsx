import type { Metadata } from "next";
import { headers } from "next/headers";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getOrgSlugFromHost, isPrimaryDomainHost } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ identifier?: string | string[] }>;
}) {
  const params = await searchParams;
  const headerStore = await headers();
  const hostHeader = headerStore.get("host") ?? "";
  const hostname = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  const organizationSlug = getOrgSlugFromHost(hostHeader);
  // Same rule as the login page: only ask for an organization on a practice
  // subdomain or the shared primary domain.
  const showOrganization =
    Boolean(organizationSlug) || isPrimaryDomainHost(hostname);
  const identifier =
    typeof params?.identifier === "string" ? params.identifier.slice(0, 254) : "";

  return (
    <ForgotPasswordForm
      defaultIdentifier={identifier}
      organizationSlug={organizationSlug}
      showOrganization={showOrganization}
    />
  );
}
