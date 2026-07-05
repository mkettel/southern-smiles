import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgSlugFromHost, isPrimaryDomainHost } from "@/lib/tenant";
import { getPracticeSettings } from "@/actions/settings";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ identifier?: string }>;
}) {
  const params = await searchParams;
  const headerStore = await headers();
  const hostHeader = headerStore.get("host") ?? "";
  const hostname = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  const organizationSlug = getOrgSlugFromHost(hostHeader);
  // Only surface the multi-tenant organization field when we're actually on a
  // practice subdomain or the shared primary apex. On single-tenant hosts
  // (localhost, preview builds, a custom practice domain) fall back to the
  // classic username + password form so existing logins keep working.
  const showOrganization = Boolean(organizationSlug) || isPrimaryDomainHost(hostname);
  let practiceName = "Survival Board";

  if (organizationSlug) {
    try {
      const admin = createAdminClient();
      const { data: practice } = await admin
        .from("practices")
        .select("name")
        .eq("slug", organizationSlug)
        .eq("is_active", true)
        .single();

      practiceName = practice?.name ?? practiceName;
    } catch {
      // Practice lookup is best-effort for the login heading.
    }
  } else {
    // No org subdomain (apex / localhost single-tenant): show the configured
    // practice name rather than the generic product name.
    try {
      const settings = await getPracticeSettings();
      practiceName = settings.name;
    } catch {
      // Settings not available yet; keep the default heading.
    }
  }

  return (
    <LoginForm
      defaultIdentifier={params?.identifier ?? ""}
      organizationSlug={organizationSlug}
      showOrganization={showOrganization}
      practiceName={practiceName}
    />
  );
}
