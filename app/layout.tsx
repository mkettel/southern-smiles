import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { getPracticeSettings } from "@/actions/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  let practiceName = "Stats & Conditions";
  let tagline = "Weekly performance tracking";

  try {
    const settings = await getPracticeSettings();
    practiceName = settings.name;
    tagline = settings.tagline ?? "Weekly performance tracking";
  } catch {
    // Settings table may not exist yet during initial setup
  }

  return {
    title: `${practiceName} - Stats & Conditions`,
    description: `${tagline} for ${practiceName}`,
    manifest: "/api/manifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: practiceName,
    },
    icons: {
      icon: "/icon.svg",
      apple: "/apple-touch-icon.png",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#0a0a0a" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
