"use client";

import { useEffect } from "react";

interface ThemeColorInjectorProps {
  primaryColor: string | null;
}

/**
 * Injects a custom primary color as CSS variable overrides.
 * Converts hex to RGB and applies as oklch-compatible overrides.
 */
export function ThemeColorInjector({ primaryColor }: ThemeColorInjectorProps) {
  useEffect(() => {
    if (!primaryColor || primaryColor === "#0a0a0a") return;

    const style = document.createElement("style");
    style.id = "practice-theme";

    // Convert hex to RGB
    const r = parseInt(primaryColor.slice(1, 3), 16) / 255;
    const g = parseInt(primaryColor.slice(3, 5), 16) / 255;
    const b = parseInt(primaryColor.slice(5, 7), 16) / 255;

    // Simple luminance calculation for foreground contrast
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const fgColor = luminance > 0.5 ? "#000000" : "#ffffff";

    style.textContent = `
      :root {
        --primary: ${primaryColor} !important;
        --primary-foreground: ${fgColor} !important;
      }
      .dark {
        --primary: ${primaryColor} !important;
        --primary-foreground: ${fgColor} !important;
      }
    `;

    // Remove existing injection if present
    const existing = document.getElementById("practice-theme");
    if (existing) existing.remove();

    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [primaryColor]);

  return null;
}
