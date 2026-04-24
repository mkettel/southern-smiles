import { cn } from "@/lib/utils";

export const CHANGELOG_TAGS = [
  { id: "feature", label: "Feature", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" },
  { id: "fix", label: "Fix", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" },
  { id: "headsup", label: "Heads-up", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30" },
  { id: "note", label: "Note", className: "bg-muted text-muted-foreground border border-border" },
] as const;

export type ChangelogTagId = (typeof CHANGELOG_TAGS)[number]["id"];

export function TagChip({ tag, className }: { tag: string; className?: string }) {
  const found = CHANGELOG_TAGS.find((t) => t.id === tag);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        found?.className ?? "bg-muted text-muted-foreground border border-border",
        className
      )}
    >
      {found?.label ?? tag}
    </span>
  );
}
