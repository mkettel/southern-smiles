import { ToothParticles } from "@/components/tooth-particles";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <ToothParticles />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}
