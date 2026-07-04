import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgSlugFromHost } from "@/lib/tenant";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ identifier?: string }>;
}) {
  const params = await searchParams;
  const headerStore = await headers();
  const organizationSlug = getOrgSlugFromHost(headerStore.get("host"));
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
  }

  return (
    <LoginForm
      defaultIdentifier={params?.identifier ?? ""}
      organizationSlug={organizationSlug}
      practiceName={practiceName}
    />
  );
}
