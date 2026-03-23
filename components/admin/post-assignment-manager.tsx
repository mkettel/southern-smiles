"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignPost, removePostAssignment } from "@/actions/admin";
import { X, Plus } from "lucide-react";

interface Assignment {
  id: string;
  post_id: string;
  post?: {
    id: string;
    title: string;
    division?: { number: number; name: string };
  };
}

interface AvailablePost {
  id: string;
  title: string;
  division?: { number: number; name: string } | null;
}

interface PostAssignmentManagerProps {
  profileId: string;
  assignments: Assignment[];
  allPosts: AvailablePost[];
}

export function PostAssignmentManager({
  profileId,
  assignments,
  allPosts,
}: PostAssignmentManagerProps) {
  const [adding, setAdding] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const assignedPostIds = new Set(assignments.map((a) => a.post_id));
  const availablePosts = allPosts.filter((p) => !assignedPostIds.has(p.id));

  async function handleAssign() {
    if (!selectedPostId) return;
    setLoading("assign");
    const result = await assignPost(profileId, selectedPostId);
    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Failed to assign"
      );
    } else {
      toast.success("Post assigned");
      setSelectedPostId("");
      setAdding(false);
    }
    setLoading(null);
  }

  async function handleRemove(assignmentId: string) {
    setLoading(assignmentId);
    const result = await removePostAssignment(assignmentId);
    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Failed to remove"
      );
    } else {
      toast.success("Post removed");
    }
    setLoading(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assignments.map((a) => (
        <Badge
          key={a.id}
          variant="outline"
          className="text-xs flex items-center gap-1 pr-1"
        >
          {a.post?.division ? `Div ${a.post.division.number}: ` : ""}
          {a.post?.title}
          <button
            onClick={() => handleRemove(a.id)}
            disabled={loading === a.id}
            className="ml-0.5 rounded-full hover:bg-muted p-0.5"
            title="Remove assignment"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {adding ? (
        <div className="flex items-center gap-1.5">
          <Select
            value={selectedPostId}
            onValueChange={(v) => v && setSelectedPostId(v)}
          >
            <SelectTrigger className="h-7 text-xs w-[180px]">
              <span>
                {selectedPostId
                  ? (() => {
                      const p = availablePosts.find((p) => p.id === selectedPostId);
                      return p
                        ? `${p.division ? `Div ${p.division.number}: ` : ""}${p.title}`
                        : "Select post...";
                    })()
                  : "Select post..."}
              </span>
            </SelectTrigger>
            <SelectContent>
              {availablePosts.map((post) => (
                <SelectItem key={post.id} value={post.id}>
                  {post.division ? `Div ${post.division.number}: ` : ""}
                  {post.title}
                </SelectItem>
              ))}
              {availablePosts.length === 0 && (
                <SelectItem value="_none" disabled>
                  All posts assigned
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="default"
            onClick={handleAssign}
            disabled={!selectedPostId || loading === "assign"}
            className="h-7 text-xs px-2"
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setSelectedPostId("");
            }}
            className="h-7 text-xs px-2"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add post
        </button>
      )}
    </div>
  );
}
