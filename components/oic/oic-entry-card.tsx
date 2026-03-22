"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { updateOicEntry, deleteOicEntry } from "@/actions/oic-log";
import { format } from "date-fns";
import { Pencil, X, Check, Trash2 } from "lucide-react";
import type { OicLogEntry, Division, Post } from "@/lib/types";

interface OicEntryCardProps {
  entry: OicLogEntry;
  isAdmin?: boolean;
  divisions: Division[];
  posts: Post[];
}

export function OicEntryCard({
  entry,
  isAdmin = false,
  divisions,
  posts,
}: OicEntryCardProps) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [entryText, setEntryText] = useState(entry.entry_text);
  const [effectiveDate, setEffectiveDate] = useState(entry.effective_date);

  // Reverse-lookup: find division ID from stored area label
  function findDivisionId(areaLabel: string | null): string {
    if (!areaLabel) return "";
    const div = divisions.find(
      (d) => areaLabel.includes(`Div ${d.number}`) || areaLabel.includes(d.name)
    );
    return div?.id ?? "";
  }

  // Reverse-lookup: find post ID from stored post label
  function findPostId(postLabel: string | null): string {
    if (!postLabel) return "";
    const post = posts.find((p) => p.title === postLabel);
    return post?.id ?? "";
  }

  const [selectedDivision, setSelectedDivision] = useState(
    findDivisionId(entry.area)
  );
  const [selectedPost, setSelectedPost] = useState(
    findPostId(entry.post_affected)
  );

  const filteredPosts = selectedDivision
    ? posts.filter((p) => p.division_id === selectedDivision)
    : posts;

  function handleCancel() {
    setEntryText(entry.entry_text);
    setEffectiveDate(entry.effective_date);
    setSelectedDivision(findDivisionId(entry.area));
    setSelectedPost(findPostId(entry.post_affected));
    setEditing(false);
  }

  function handleSave() {
    const divisionLabel = selectedDivision
      ? (() => {
          const div = divisions.find((d) => d.id === selectedDivision);
          return div ? `Div ${div.number} – ${div.name}` : null;
        })()
      : null;

    const postLabel = selectedPost
      ? posts.find((p) => p.id === selectedPost)?.title ?? null
      : null;

    startTransition(async () => {
      const result = await updateOicEntry(entry.id, {
        effective_date: effectiveDate,
        area: divisionLabel,
        post_affected: postLabel,
        entry_text: entryText,
      });

      if (result.error) {
        toast.error(
          typeof result.error === "string" ? result.error : "Update failed"
        );
      } else {
        toast.success("Entry updated");
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Division</Label>
              <Select
                value={selectedDivision || "_none"}
                onValueChange={(v) => {
                  if (v === "_none") {
                    setSelectedDivision("");
                    setSelectedPost("");
                  } else if (v) {
                    setSelectedDivision(v);
                    setSelectedPost("");
                  }
                }}
              >
                <SelectTrigger>
                  <span>
                    {selectedDivision
                      ? (() => {
                          const div = divisions.find(
                            (d) => d.id === selectedDivision
                          );
                          return div
                            ? `Div ${div.number} – ${div.name}`
                            : "Select...";
                        })()
                      : "All / General"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">All / General</SelectItem>
                  {divisions.map((div) => (
                    <SelectItem key={div.id} value={div.id}>
                      Div {div.number} – {div.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Post Affected</Label>
              <Select
                value={selectedPost || "_none"}
                onValueChange={(v) => {
                  if (v === "_none") {
                    setSelectedPost("");
                  } else if (v) {
                    setSelectedPost(v);
                  }
                }}
              >
                <SelectTrigger>
                  <span>
                    {selectedPost
                      ? posts.find((p) => p.id === selectedPost)?.title ??
                        "Select..."
                      : "All / Multiple"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">All / Multiple</SelectItem>
                  {filteredPosts.map((post) => (
                    <SelectItem key={post.id} value={post.id}>
                      {post.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              <Check className="h-4 w-4 mr-1" />
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <p className="text-sm">{entry.entry_text}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span>
                {format(
                  new Date(entry.effective_date + "T00:00:00"),
                  "MMM d, yyyy"
                )}
              </span>
              <span>&middot;</span>
              <span>{entry.profile?.full_name ?? "Unknown"}</span>
              {entry.area && (
                <>
                  <span>&middot;</span>
                  <Badge variant="outline" className="text-xs">
                    {entry.area}
                  </Badge>
                </>
              )}
              {entry.post_affected && (
                <Badge variant="outline" className="text-xs">
                  {entry.post_affected}
                </Badge>
              )}
              {entry.edited_at && (
                <span className="italic text-muted-foreground/60">
                  (edited {format(new Date(entry.edited_at), "MMM d, yyyy")})
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteOicEntry(entry.id);
                    if (result.error) {
                      toast.error(
                        typeof result.error === "string"
                          ? result.error
                          : "Delete failed"
                      );
                    } else {
                      toast.success("Entry deleted");
                    }
                  });
                }}
                disabled={isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
