"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { addManualRecipient } from "@/actions/surveys";
import { UserPlus, ExternalLink, Copy } from "lucide-react";

export function AddTestRecipientDialog({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  async function handleAdd() {
    if (!fullName.trim()) {
      toast.error("Enter a name");
      return;
    }
    setLoading(true);
    const res = await addManualRecipient(campaignId, {
      fullName,
      email: email || null,
    });
    setLoading(false);
    if (res.error || !("surveyPath" in res)) {
      toast.error(typeof res.error === "string" ? res.error : "Could not add");
      return;
    }
    setLink(`${window.location.origin}${res.surveyPath}`);
    toast.success(`Added ${fullName.trim()} — survey link ready`);
    router.refresh();
  }

  function reset() {
    setFullName("");
    setEmail("");
    setLink(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        <UserPlus className="h-4 w-4" />
        Add test person
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a test person</DialogTitle>
            <DialogDescription>
              Enrolls a one-off person (not from your patient list) with a real
              survey code, so you can run the flyer → QR → survey flow yourself.
            </DialogDescription>
          </DialogHeader>

          {link ? (
            <div className="space-y-3 py-2">
              <p className="text-sm">Their survey link:</p>
              <div className="flex items-center gap-2">
                <Input value={link} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Open survey
              </a>
              <p className="text-xs text-muted-foreground">
                They&apos;re now in the recipients list and will appear in the
                generated flyers.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="tr-name">Name</Label>
                <Input
                  id="tr-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Test Patient"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tr-email">Email (optional)</Label>
                <Input
                  id="tr-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {link ? (
              <>
                <Button variant="outline" onClick={reset}>
                  Add another
                </Button>
                <DialogClose className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                  Done
                </DialogClose>
              </>
            ) : (
              <>
                <DialogClose className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                  Cancel
                </DialogClose>
                <Button onClick={handleAdd} disabled={loading}>
                  {loading ? "Adding…" : "Add & enroll"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
