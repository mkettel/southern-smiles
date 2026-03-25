import { getPracticeSettings } from "@/actions/settings";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  let practiceName = "Stats & Conditions";

  try {
    const settings = await getPracticeSettings();
    practiceName = settings.name;
  } catch {
    // Settings not available yet
  }

  return <LoginForm practiceName={practiceName} />;
}
