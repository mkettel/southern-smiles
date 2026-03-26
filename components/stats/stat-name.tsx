"use client";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface StatNameProps {
  name: string;
  description?: string | null;
  className?: string;
}

export function StatName({ name, description, className }: StatNameProps) {
  if (!description) {
    return <span className={className}>{name}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger className={`inline-flex items-center gap-1 ${className ?? ""}`}>
        {name}
        <Info className="h-3 w-3 text-muted-foreground shrink-0" />
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}
