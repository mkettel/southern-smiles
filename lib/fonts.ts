/**
 * Curated font options for practice branding.
 * All fonts are from Google Fonts, optimized for data-heavy dashboard UIs.
 * Each has good number rendering and multiple weights.
 */
export interface FontOption {
  name: string;
  googleName: string; // URL-safe name for Google Fonts API
  category: string;
  description: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    name: "Geist",
    googleName: "Geist",
    category: "Modern",
    description: "Clean and technical — the default",
  },
  {
    name: "Inter",
    googleName: "Inter",
    category: "Modern",
    description: "The SaaS standard — extremely readable",
  },
  {
    name: "DM Sans",
    googleName: "DM+Sans",
    category: "Friendly",
    description: "Rounded and approachable",
  },
  {
    name: "Plus Jakarta Sans",
    googleName: "Plus+Jakarta+Sans",
    category: "Premium",
    description: "Elegant with a premium feel",
  },
  {
    name: "Nunito",
    googleName: "Nunito",
    category: "Friendly",
    description: "Soft and warm — great for healthcare",
  },
  {
    name: "Outfit",
    googleName: "Outfit",
    category: "Modern",
    description: "Geometric and clean",
  },
  {
    name: "Raleway",
    googleName: "Raleway",
    category: "Elegant",
    description: "Sophisticated and refined",
  },
  {
    name: "Source Sans 3",
    googleName: "Source+Sans+3",
    category: "Professional",
    description: "Neutral and professional",
  },
  {
    name: "Poppins",
    googleName: "Poppins",
    category: "Friendly",
    description: "Popular and versatile",
  },
  {
    name: "Manrope",
    googleName: "Manrope",
    category: "Modern",
    description: "Contemporary with great readability",
  },
];

/**
 * Get the Google Fonts CSS URL for a given font name.
 * Loads weights 400, 500, 600, 700 for flexibility.
 */
export function getGoogleFontUrl(fontName: string): string | null {
  if (fontName === "Geist") return null; // Geist is loaded locally via next/font
  const font = FONT_OPTIONS.find((f) => f.name === fontName);
  if (!font) return null;
  return `https://fonts.googleapis.com/css2?family=${font.googleName}:wght@400;500;600;700&display=swap`;
}
