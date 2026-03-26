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
  SelectValue,
} from "@/components/ui/select";
import { updateProfile } from "@/actions/admin";

interface EmployeeEditDialogProps {
  profile: {
    id: string;
    full_name: string;
    username: string | null;
    role: string;
    is_active: boolean;
  };
  trigger: React.ReactNode;
}

export function EmployeeEditDialog({
  profile,
  trigger,
}: EmployeeEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(profile.full_name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [role, setRole] = useState(profile.role);
  const [isActive, setIsActive] = useState(profile.is_active);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setLoading(true);
    const result = await updateProfile(profile.id, {
      full_name: name.trim(),
      username: username.trim() || null,
      role: role as "admin" | "employee",
      is_active: isActive,
    });

    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Update failed"
      );
    } else {
      toast.success("Employee updated");
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
          setName(profile.full_name);
          setUsername(profile.username ?? "");
          setRole(profile.role);
          setIsActive(profile.is_active);
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
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="emp-name">Full Name</Label>
              <Input
                id="emp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-username">Username</Label>
              <Input
                id="emp-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                placeholder="e.g. odalis"
              />
              <p className="text-xs text-muted-foreground">
                Used for login. Letters, numbers, dots, dashes only.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger>
                  <span>{role === "admin" ? "Admin" : "Employee"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={isActive ? "active" : "inactive"}
                onValueChange={(v) => v && setIsActive(v === "active")}
              >
                <SelectTrigger>
                  <span>{isActive ? "Active" : "Inactive"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </DialogClose>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
