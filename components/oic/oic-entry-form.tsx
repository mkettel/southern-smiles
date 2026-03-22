"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { createOicEntry } from "@/actions/oic-log";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import type { Division, Post } from "@/lib/types";

interface OicEntryFormProps {
  divisions: Division[];
  posts: Post[];
}

export function OicEntryForm({ divisions, posts }: OicEntryFormProps) {
  const [isPending, startTransition] = useTransition();
  const today = format(new Date(), "yyyy-MM-dd");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [selectedDivision, setSelectedDivision] = useState("");
  const [selectedPost, setSelectedPost] = useState("");
  const [entryText, setEntryText] = useState("");

  // Filter posts by selected division
  const filteredPosts = selectedDivision
    ? posts.filter((p) => p.division_id === selectedDivision)
    : posts;

  function handleSubmit() {
    if (!entryText.trim()) {
      toast.error("Description is required");
      return;
    }

    // Build the area label from the selected division
    const divisionLabel = selectedDivision
      ? (() => {
          const div = divisions.find((d) => d.id === selectedDivision);
          return div ? `Div ${div.number} – ${div.name}` : null;
        })()
      : null;

    // Build the post label
    const postLabel = selectedPost
      ? posts.find((p) => p.id === selectedPost)?.title ?? null
      : null;

    startTransition(async () => {
      const result = await createOicEntry({
        effective_date: effectiveDate,
        area: divisionLabel,
        post_affected: postLabel,
        entry_text: entryText.trim(),
      });

      if (result.error) {
        toast.error(
          typeof result.error === "string" ? result.error : "Validation error"
        );
      } else {
        toast.success("Log entry added");
        setEntryText("");
        setSelectedDivision("");
        setSelectedPost("");
        setEffectiveDate(today);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
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
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              placeholder="What changed or happened?"
              required
              rows={2}
            />
          </div>
          <Button onClick={handleSubmit} size="sm" disabled={isPending}>
            {isPending ? (
              "Adding..."
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Add Entry
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
