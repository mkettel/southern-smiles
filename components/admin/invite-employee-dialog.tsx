"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { inviteEmployee } from "@/actions/invite";
import { Mail } from "lucide-react";

interface InviteEmployeeDialogProps {
  trigger: React.ReactNode;
}

export function InviteEmployeeDialog({ trigger }: InviteEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");

  function reset() {
    setEmail("");
    setFullName("");
    setRole("employee");
  }

  function handleSubmit() {
    if (!email.trim() || !fullName.trim()) {
      toast.error("Email and name are required");
      return;
    }

    startTransition(async () => {
      const result = await inviteEmployee({
        email: email.trim(),
        fullName: fullName.trim(),
        role,
      });

      if (result.error) {
        toast.error(
          typeof result.error === "string" ? result.error : "Invite failed"
        );
      } else {
        toast.success(`Invitation sent to ${result.email}`);
        setOpen(false);
        reset();
      }
    });
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
        className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
      >
        {trigger}
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
              <p className="text-[10px] text-muted-foreground">
                They&apos;ll receive an email to set their password and join your practice.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(v) => v && setRole(v as "employee" | "admin")}
              >
                <SelectTrigger>
                  <span>{role === "admin" ? "Admin" : "Employee"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </DialogClose>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                "Sending..."
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-1" />
                  Send Invite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
