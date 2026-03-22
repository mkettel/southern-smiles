import { cn } from "@/lib/utils";
import { CONDITION_CONFIG, type ConditionName } from "@/lib/conditions";
import { Badge } from "@/components/ui/badge";

interface ConditionDisplayProps {
  condition: ConditionName;
  size?: "sm" | "md";
}

export function ConditionDisplay({
  condition,
  size = "md",
}: ConditionDisplayProps) {
  const config = CONDITION_CONFIG[condition];

  return (
    <Badge
      variant="secondary"
      className={cn(
        config.bgClass,
        config.textClass,
        "border-0 font-medium",
        size === "sm" ? "text-xs px-1.5 py-0" : "text-sm px-2 py-0.5"
      )}
    >
      {config.label}
    </Badge>
  );
}
