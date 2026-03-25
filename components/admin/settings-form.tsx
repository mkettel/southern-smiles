"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updatePracticeSettings, uploadLogo } from "@/actions/settings";
import type { PracticeSettings } from "@/actions/settings";
import { Upload, Check, RotateCcw } from "lucide-react";

interface SettingsFormProps {
  settings: PracticeSettings;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(settings.name);
  const [shortName, setShortName] = useState(settings.short_name ?? "");
  const [tagline, setTagline] = useState(settings.tagline ?? "");
  const [primaryColor, setPrimaryColor] = useState(settings.primary_color);
  const [address, setAddress] = useState(settings.address ?? "");
  const [phone, setPhone] = useState(settings.phone ?? "");
  const [website, setWebsite] = useState(settings.website ?? "");
  const [logoUrl, setLogoUrl] = useState(settings.logo_url);
  const [showNameWithLogo, setShowNameWithLogo] = useState(settings.show_name_with_logo);
  const [uploading, setUploading] = useState(false);
  const defaultColor = "#0a0a0a";
  const originalColor = useRef(settings.primary_color);

  // Live preview: inject CSS override as color changes
  useEffect(() => {
    const style = document.getElementById("practice-theme-preview") ?? document.createElement("style");
    style.id = "practice-theme-preview";

    if (primaryColor && primaryColor !== defaultColor) {
      const r = parseInt(primaryColor.slice(1, 3), 16) / 255;
      const g = parseInt(primaryColor.slice(3, 5), 16) / 255;
      const b = parseInt(primaryColor.slice(5, 7), 16) / 255;
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
    } else {
      style.textContent = "";
    }

    if (!document.getElementById("practice-theme-preview")) {
      document.head.appendChild(style);
    }

    return () => {
      // Don't remove on unmount — let the layout injector handle the saved value
    };
  }, [primaryColor]);

  function handleSave() {
    startTransition(async () => {
      const result = await updatePracticeSettings({
        name: name.trim(),
        short_name: shortName.trim() || null,
        tagline: tagline.trim() || null,
        primary_color: primaryColor,
        show_name_with_logo: showNameWithLogo,
        address: address.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
      });

      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Save failed");
      } else {
        toast.success("Settings saved");
      }
    });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("logo", file);

    const result = await uploadLogo(formData);

    if ("error" in result) {
      toast.error(typeof result.error === "string" ? result.error : "Upload failed");
    } else if (result.logo_url) {
      setLogoUrl(result.logo_url);
      toast.success("Logo uploaded");
    }
    setUploading(false);
  }

  return (
    <div className="space-y-6">
      {/* Practice Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Practice Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Practice Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Southern Smiles Dental"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Short Name</Label>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="Southern Smiles"
              />
              <p className="text-[10px] text-muted-foreground">
                Used in sidebar, PWA home screen
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tagline</Label>
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Your smile, our passion"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-6">
            {logoUrl ? (
              <div className="h-24 w-24 rounded-lg border overflow-hidden bg-muted flex items-center justify-center shrink-0">
                <img
                  src={logoUrl}
                  alt="Practice logo"
                  className="h-full w-full object-contain p-1"
                />
              </div>
            ) : (
              <div className="h-24 w-24 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground shrink-0">
                <Upload className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-3">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors cursor-pointer">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading..." : "Upload Logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              <p className="text-[10px] text-muted-foreground">
                PNG, JPG, SVG, or WebP. Max 2MB.
              </p>
              {logoUrl && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showNameWithLogo}
                    onChange={(e) => setShowNameWithLogo(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-sm">Show practice name next to logo</span>
                </label>
              )}
            </div>
          </div>

          {/* Sidebar preview */}
          {logoUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sidebar preview</Label>
              <div className="flex items-center gap-2.5 rounded-md border bg-muted/30 px-4 py-3 w-fit">
                {showNameWithLogo ? (
                  <>
                    <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain shrink-0" />
                    <span className="font-semibold text-sm">
                      {shortName || name}
                    </span>
                  </>
                ) : (
                  <img src={logoUrl} alt="" className="h-9 max-w-[180px] object-contain" />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Primary Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 rounded border cursor-pointer"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#0a0a0a"
                className="w-32"
              />
              {primaryColor !== defaultColor && (
                <button
                  onClick={() => setPrimaryColor(defaultColor)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Reset to default"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Changes preview in real time. Save to apply permanently.
            </p>
          </div>

          {/* Live preview */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
              <div
                className="h-8 w-8 rounded-lg"
                style={{ backgroundColor: primaryColor }}
              />
              <div className="space-y-1">
                <div
                  className="h-2.5 w-24 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                />
                <div
                  className="h-2 w-16 rounded-full opacity-50"
                  style={{ backgroundColor: primaryColor }}
                />
              </div>
              <div className="ml-auto">
                <span
                  className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: primaryColor,
                    color:
                      (() => {
                        const r = parseInt(primaryColor.slice(1, 3), 16) / 255;
                        const g = parseInt(primaryColor.slice(3, 5), 16) / 255;
                        const b = parseInt(primaryColor.slice(5, 7), 16) / 255;
                        return 0.299 * r + 0.587 * g + 0.114 * b > 0.5
                          ? "#000"
                          : "#fff";
                      })(),
                  }}
                >
                  Button
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, City, State ZIP"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isPending} className="w-full" size="lg">
        {isPending ? "Saving..." : (
          <>
            <Check className="h-4 w-4 mr-1" />
            Save Settings
          </>
        )}
      </Button>
    </div>
  );
}
