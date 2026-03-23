"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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
import {
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  User,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Division, Post } from "@/lib/types";

interface OrgManagerProps {
  divisions: Division[];
  posts: Post[];
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
}

export function OrgManager({
  divisions,
  posts,
  statsByPost,
  employeesByPost,
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
    <div className="space-y-1">
      {sortedDivisions.map((div) => {
        const divPosts = posts.filter((p) => p.division_id === div.id);
        const isExpanded = expandedDivs.has(div.id);
        const isEditingThis = editingDiv === div.id;

        return (
          <div key={div.id}>
            {/* Division row */}
            <div className="group flex items-center gap-1.5 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
              <button
                onClick={() => toggleDiv(div.id)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
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
                  <Button size="sm" variant="ghost" onClick={() => handleSaveDiv(div.id)} disabled={isPending}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDiv(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-semibold text-sm flex-1">
                    Div {div.number} – {div.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground mr-1">
                    {divPosts.length} post{divPosts.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditDiv(div)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteDiv(div.id)}
                      disabled={isPending || divPosts.length > 0}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                      title={divPosts.length > 0 ? "Remove posts first" : "Delete division"}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Posts tree */}
            {isExpanded && (
              <div className="ml-4 border-l border-border">
                {divPosts.map((post, i) => {
                  const isEditingThisPost = editingPost === post.id;
                  const postStats = statsByPost[post.id] ?? [];
                  const postEmployees = employeesByPost[post.id] ?? [];
                  const isLast = i === divPosts.length - 1;

                  return (
                    <div key={post.id} className="relative">
                      {/* Tree connector */}
                      <div className="absolute left-0 top-[18px] w-4 border-t border-border" />

                      <div className="ml-4">
                        {/* Post row */}
                        <div className="group flex items-start gap-2 py-2 px-2 rounded-md hover:bg-muted/30 transition-colors">
                          {isEditingThisPost ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                value={editPostTitle}
                                onChange={(e) => setEditPostTitle(e.target.value)}
                                className="flex-1 text-sm"
                              />
                              <Select value={editPostDivId} onValueChange={(v) => v && setEditPostDivId(v)}>
                                <SelectTrigger className="w-[160px] text-sm">
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
                              <Button size="sm" variant="ghost" onClick={() => handleSavePost(post.id)} disabled={isPending}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingPost(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{post.title}</span>

                                {/* Employees */}
                                {postEmployees.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="text-xs text-muted-foreground">
                                      {postEmployees.join(", ")}
                                    </span>
                                  </div>
                                )}
                                {postEmployees.length === 0 && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <User className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                    <span className="text-xs text-muted-foreground/40 italic">
                                      Unassigned
                                    </span>
                                  </div>
                                )}

                                {/* Stats */}
                                {postStats.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
                                    {postStats.map((s) => (
                                      <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0">
                                        {s}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={() => startEditPost(post)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeletePost(post.id)}
                                  disabled={isPending || postStats.length > 0 || postEmployees.length > 0}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                                  title={
                                    postStats.length > 0 || postEmployees.length > 0
                                      ? "Remove stats and assignments first"
                                      : "Delete post"
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {divPosts.length === 0 && (
                  <div className="relative">
                    <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                    <p className="ml-6 py-2 text-xs text-muted-foreground italic">
                      No posts
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
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
