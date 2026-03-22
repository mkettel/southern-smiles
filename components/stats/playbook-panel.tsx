"use client";

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import type { ConditionPlaybook } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PlaybookPanelProps {
  condition: ConditionName;
  playbooks: ConditionPlaybook[];
  response: string;
  onResponseChange: (response: string) => void;
}

export function PlaybookPanel({
  condition,
  playbooks,
  response,
  onResponseChange,
}: PlaybookPanelProps) {
  const playbook = playbooks.find((p) => p.condition === condition);
  const config = CONDITION_CONFIG[condition];

  if (!playbook) return null;

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border p-4 space-y-3",
        config.bgClass,
        "border-current/10"
      )}
    >
      <div>
        <p className={cn("text-sm font-medium", config.textClass)}>
          Condition: {config.label}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {playbook.description}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Action Steps:
        </p>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          {playbook.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`playbook-${condition}`} className="text-sm">
          What actions will you take this week?
        </Label>
        <Textarea
          id={`playbook-${condition}`}
          placeholder="Describe your plan based on the steps above..."
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          rows={3}
          className="bg-background"
        />
      </div>
    </div>
  );
}
