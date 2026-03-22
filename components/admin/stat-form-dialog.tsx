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
import { createStat, updateStat } from "@/actions/admin";
import type { Post } from "@/lib/types";

interface StatFormDialogProps {
  posts: Post[];
  editStat?: {
    id: string;
    name: string;
    abbreviation: string | null;
    stat_type: string;
    good_direction: string;
    post_id: string;
    display_order: number;
  } | null;
  trigger: React.ReactNode;
}

export function StatFormDialog({ posts, editStat, trigger }: StatFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(editStat?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(editStat?.abbreviation ?? "");
  const [statType, setStatType] = useState(editStat?.stat_type ?? "count");
  const [goodDirection, setGoodDirection] = useState(editStat?.good_direction ?? "up");
  const [postId, setPostId] = useState(editStat?.post_id ?? "");
  const [displayOrder, setDisplayOrder] = useState(editStat?.display_order ?? 0);

  function resetForm() {
    if (!editStat) {
      setName("");
      setAbbreviation("");
      setStatType("count");
      setGoodDirection("up");
      setPostId("");
      setDisplayOrder(0);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!postId) {
      toast.error("Please select a post");
      return;
    }

    setLoading(true);

    const data = {
      name: name.trim(),
      abbreviation: abbreviation.trim() || null,
      stat_type: statType as "dollar" | "percentage" | "count",
      good_direction: goodDirection as "up" | "down",
      post_id: postId,
      display_order: displayOrder,
    };

    const result = editStat
      ? await updateStat(editStat.id, data)
      : await createStat(data);

    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Validation error");
    } else {
      toast.success(editStat ? "Stat updated" : "Stat created");
      setOpen(false);
      resetForm();
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && editStat) {
      setName(editStat.name);
      setAbbreviation(editStat.abbreviation ?? "");
      setStatType(editStat.stat_type);
      setGoodDirection(editStat.good_direction);
      setPostId(editStat.post_id);
      setDisplayOrder(editStat.display_order);
    }}}>
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg border border-transparent bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors data-[edit]:bg-transparent data-[edit]:text-muted-foreground data-[edit]:hover:bg-muted data-[edit]:hover:text-foreground data-[edit]:px-2 data-[edit]:py-1"
        {...(editStat ? { "data-edit": "" } : {})}
      >
        {trigger}
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editStat ? "Edit Stat" : "Add New Stat"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stat-name">Name</Label>
              <Input
                id="stat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Collections"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stat-abbr">Abbreviation (optional)</Label>
              <Input
                id="stat-abbr"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
                placeholder="e.g., Coll"
                maxLength={10}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={statType} onValueChange={(v) => v && setStatType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dollar">Dollar ($)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="count">Count (#)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Good Direction</Label>
                <Select value={goodDirection} onValueChange={(v) => v && setGoodDirection(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="up">Higher is better</SelectItem>
                    <SelectItem value="down">Lower is better</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assigned Post</Label>
              <Select value={postId} onValueChange={(v) => v && setPostId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a post..." />
                </SelectTrigger>
                <SelectContent>
                  {posts.map((post) => (
                    <SelectItem key={post.id} value={post.id}>
                      {post.division ? `Div ${post.division.number}: ` : ""}
                      {post.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stat-order">Display Order</Label>
              <Input
                id="stat-order"
                type="number"
                min="0"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </DialogClose>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving..." : editStat ? "Save Changes" : "Create Stat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
