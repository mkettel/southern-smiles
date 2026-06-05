"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setTemporaryPassword } from "@/actions/admin";
import { Copy, RefreshCw, Check } from "lucide-react";

interface SetPasswordDialogProps {
  profileId: string;
  fullName: string;
  trigger: React.ReactNode;
}

// Readable temp password: no ambiguous chars (0/O, 1/l/I), always meets the
// 8+ char rule, and mixes case + a digit so it survives common policies.
function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const values = new Uint32Array(10);
  crypto.getRandomValues(values);
  for (let i = 0; i < values.length; i++) {
    out += chars[values[i] % chars.length];
  }
  return out;
}

export function SetPasswordDialog({
  profileId,
  fullName,
  trigger,
}: SetPasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy it manually");
    }
  }

  async function handleSubmit() {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    const result = await setTemporaryPassword(profileId, password);

    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Reset failed"
      );
    } else {
      toast.success(`Password set for ${fullName}`);
      setOpen(false);
    }
    setLoading(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setPassword(generatePassword());
          setCopied(false);
        }
      }}
    >
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg bg-transparent p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {trigger}
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Temporary Password</DialogTitle>
            <DialogDescription>
              Set a new password for {fullName}. Give it to them so they can log
              in, then they can change it from their profile page. There&apos;s
              no way to recover their existing password — this replaces it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="temp-password">New Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="temp-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Generate a new one"
                  onClick={() => {
                    setPassword(generatePassword());
                    setCopied(false);
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copy"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                At least 8 characters. Copy it before saving — it won&apos;t be
                shown again.
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </DialogClose>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Setting..." : "Set Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
