// Nested layout for unauthenticated public pages (e.g. the patient survey).
// Intentionally has NO <html>/<body> — it composes under the root layout, so
// it inherits theme/fonts but none of the authenticated app chrome.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
