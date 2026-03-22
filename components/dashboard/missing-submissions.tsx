import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { Profile } from "@/lib/types";

interface MissingSubmissionsProps {
  missing: { profile: Profile; missingStats: string[] }[];
}

export function MissingSubmissions({ missing }: MissingSubmissionsProps) {
  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-400">
          Missing Submissions
        </span>
      </div>
      <div className="space-y-1">
        {missing.map(({ profile, missingStats }) => (
          <div key={profile.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium">{profile.full_name}</span>
            <span className="text-muted-foreground">—</span>
            <div className="flex flex-wrap gap-1">
              {missingStats.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
