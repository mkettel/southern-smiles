"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateWorkspaceType } from "@/actions/workspace-access";
import {
  MODULE_LABELS,
  WORKSPACE_TYPE_OPTIONS,
  getPlanModules,
  getWorkspaceLabel,
  resolvePlanForWorkspaceType,
  type WorkspaceAccess,
  type WorkspaceType,
} from "@/lib/workspace-access";
import { cn } from "@/lib/utils";

interface WorkspaceTypeFormProps {
  access: WorkspaceAccess;
}

export function WorkspaceTypeForm({ access }: WorkspaceTypeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<WorkspaceType>(access.workspaceType);

  const previewPlan = resolvePlanForWorkspaceType(selected, access.planKey);
  const previewModules = getPlanModules(previewPlan).map((moduleKey) =>
    getWorkspaceLabel({ workspaceType: selected }, moduleKey, MODULE_LABELS[moduleKey]),
  );
  const isDirty = selected !== access.workspaceType;

  function handleSave() {
    startTransition(async () => {
      const result = await updateWorkspaceType({ workspaceType: selected });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Workspace type updated");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspace Type</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose which sections appear in your navigation. Switching never deletes
          data; sections you turn off keep everything and come back when re-enabled.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="radiogroup"
          aria-label="Workspace type"
          className="grid gap-3 sm:grid-cols-3"
        >
          {WORKSPACE_TYPE_OPTIONS.map((option) => {
            const isSelected = option.value === selected;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(option.value)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected ? "border-primary bg-accent/60" : "border-border",
                )}
              >
                <span className="flex items-center justify-between text-sm font-medium">
                  {option.label}
                  {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden />}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Sections included
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {previewModules.map((label) => (
              <li
                key={label}
                className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-3">
          {isDirty && (
            <Button
              variant="ghost"
              onClick={() => setSelected(access.workspaceType)}
              disabled={isPending}
            >
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={!isDirty || isPending}>
            {isPending ? "Saving..." : "Save workspace type"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
