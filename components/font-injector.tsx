import { getGoogleFontUrl } from "@/lib/fonts";

interface FontInjectorProps {
  fontFamily: string;
}

/**
 * Server component that injects a Google Font <link> into the head
 * and overrides the --font-sans CSS variable.
 * Renders nothing visible — just the font loading infrastructure.
 */
export function FontInjector({ fontFamily }: FontInjectorProps) {
  if (fontFamily === "Geist" || !fontFamily) return null;

  const fontUrl = getGoogleFontUrl(fontFamily);
  if (!fontUrl) return null;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={fontUrl} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              --font-sans: '${fontFamily}', system-ui, sans-serif !important;
              --font-geist-sans: '${fontFamily}', system-ui, sans-serif !important;
            }
          `,
        }}
      />
    </>
  );
}
