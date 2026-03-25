import { getPracticeSettings } from "@/actions/settings";

export async function GET() {
  let name = "Stats & Conditions";
  let shortName = "Stats";
  let description = "Weekly performance tracking";

  try {
    const settings = await getPracticeSettings();
    name = `${settings.name} - Stats & Conditions`;
    shortName = settings.short_name ?? settings.name;
    description = settings.tagline ?? `Weekly performance tracking for ${settings.name}`;
  } catch {
    // Settings not available yet
  }

  const manifest = {
    name,
    short_name: shortName,
    description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}
