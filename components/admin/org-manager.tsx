"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  updateDivision,
  deleteDivision,
  updatePost,
  deletePost,
} from "@/actions/admin";
import { Pencil, Trash2, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import type { Division, Post } from "@/lib/types";

interface OrgManagerProps {
  divisions: Division[];
  posts: Post[];
  statCounts: Record<string, number>;
  assignmentCounts: Record<string, number>;
}

export function OrgManager({
  divisions,
  posts,
  statCounts,
  assignmentCounts,
}: OrgManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [editingDiv, setEditingDiv] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editDivName, setEditDivName] = useState("");
  const [editDivNumber, setEditDivNumber] = useState("");
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostDivId, setEditPostDivId] = useState("");
  const [expandedDivs, setExpandedDivs] = useState<Set<string>>(
    new Set(divisions.map((d) => d.id))
  );

  function toggleDiv(id: string) {
    setExpandedDivs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEditDiv(div: Division) {
    setEditingDiv(div.id);
    setEditDivName(div.name);
    setEditDivNumber(String(div.number));
  }

  function startEditPost(post: Post) {
    setEditingPost(post.id);
    setEditPostTitle(post.title);
    setEditPostDivId(post.division_id);
  }

  function handleSaveDiv(id: string) {
    startTransition(async () => {
      const result = await updateDivision(id, {
        name: editDivName.trim(),
        number: parseInt(editDivNumber),
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Division updated");
        setEditingDiv(null);
      }
    });
  }

  function handleDeleteDiv(id: string) {
    startTransition(async () => {
      const result = await deleteDivision(id);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Division deleted");
      }
    });
  }

  function handleSavePost(id: string) {
    startTransition(async () => {
      const result = await updatePost(id, {
        title: editPostTitle.trim(),
        division_id: editPostDivId,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Post updated");
        setEditingPost(null);
      }
    });
  }

  function handleDeletePost(id: string) {
    startTransition(async () => {
      const result = await deletePost(id);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Post deleted");
      }
    });
  }

  const sortedDivisions = [...divisions].sort((a, b) => a.number - b.number);

  return (
    <div className="space-y-3">
      {sortedDivisions.map((div) => {
        const divPosts = posts.filter((p) => p.division_id === div.id);
        const isExpanded = expandedDivs.has(div.id);
        const isEditingThis = editingDiv === div.id;

        return (
          <Card key={div.id}>
            <CardContent className="pt-4">
              {/* Division header */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleDiv(div.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {isEditingThis ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editDivNumber}
                      onChange={(e) => setEditDivNumber(e.target.value)}
                      className="w-16 text-sm"
                      type="number"
                      min="1"
                    />
                    <Input
                      value={editDivName}
                      onChange={(e) => setEditDivName(e.target.value)}
                      className="flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSaveDiv(div.id)}
                      disabled={isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDiv(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Div {div.number} – {div.name}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {divPosts.length} post{divPosts.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditDiv(div)}
                        className="h-7 w-7 p-0"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteDiv(div.id)}
                        disabled={isPending || divPosts.length > 0}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title={
                          divPosts.length > 0
                            ? "Remove posts first"
                            : "Delete division"
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Posts under this division */}
              {isExpanded && divPosts.length > 0 && (
                <div className="ml-6 mt-3 space-y-2 border-l-2 border-muted pl-4">
                  {divPosts.map((post) => {
                    const isEditingThisPost = editingPost === post.id;
                    const stats = statCounts[post.id] ?? 0;
                    const assignments = assignmentCounts[post.id] ?? 0;

                    return (
                      <div
                        key={post.id}
                        className="flex items-center justify-between py-1.5"
                      >
                        {isEditingThisPost ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={editPostTitle}
                              onChange={(e) => setEditPostTitle(e.target.value)}
                              className="flex-1 text-sm"
                            />
                            <Select
                              value={editPostDivId}
                              onValueChange={(v) => v && setEditPostDivId(v)}
                            >
                              <SelectTrigger className="w-[180px] text-sm">
                                <span>
                                  {divisions.find((d) => d.id === editPostDivId)
                                    ? `Div ${divisions.find((d) => d.id === editPostDivId)!.number}`
                                    : "Division"}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                {divisions.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    Div {d.number} – {d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSavePost(post.id)}
                              disabled={isPending}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingPost(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{post.title}</span>
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                {stats} stat{stats !== 1 ? "s" : ""}
                              </Badge>
                              {assignments > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {assignments} assigned
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditPost(post)}
                                className="h-7 w-7 p-0"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeletePost(post.id)}
                                disabled={
                                  isPending || stats > 0 || assignments > 0
                                }
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                title={
                                  stats > 0 || assignments > 0
                                    ? "Remove stats and assignments first"
                                    : "Delete post"
                                }
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {isExpanded && divPosts.length === 0 && (
                <p className="ml-10 mt-2 text-xs text-muted-foreground">
                  No posts in this division
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {sortedDivisions.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">
          No divisions configured.
        </p>
      )}
    </div>
  );
}
