"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, PencilOff } from "lucide-react";
import { TreeView } from "./tree-view";
import { useOrgEditing } from "./use-org-editing";
import type { OrgViewerProps } from "./types";

export function OrgViewer({ isAdmin, ...data }: OrgViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const editing = useOrgEditing();

  function toggleEditing() {
    if (isEditing) {
      editing.resetAll();
    }
    setIsEditing(!isEditing);
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={toggleEditing}
            className="gap-1.5"
          >
            {isEditing ? <PencilOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {isEditing ? "Done" : "Edit"}
          </Button>
        </div>
      )}

      <TreeView {...data} isEditing={isAdmin && isEditing} editing={editing} />
    </div>
  );
}
