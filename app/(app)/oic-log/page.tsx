import { getProfile } from "@/actions/auth";
import { getOicEntries } from "@/actions/oic-log";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OicEntryForm } from "@/components/oic/oic-entry-form";
import type { Profile, OicLogEntry } from "@/lib/types";

export default async function OicLogPage() {
  const profile = (await getProfile()) as Profile;
  if (profile.role !== "admin") redirect("/dashboard");

  const entries = await getOicEntries();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">OIC Log</h1>
        <p className="text-muted-foreground">
          Track operational changes and initiatives
        </p>
      </div>

      <OicEntryForm />

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm">{entry.entry_text}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {format(
                        new Date(entry.effective_date + "T00:00:00"),
                        "MMM d, yyyy"
                      )}
                    </span>
                    <span>&middot;</span>
                    <span>{entry.profile?.full_name ?? "Unknown"}</span>
                    {entry.area && (
                      <>
                        <span>&middot;</span>
                        <Badge variant="outline" className="text-xs">
                          {entry.area}
                        </Badge>
                      </>
                    )}
                    {entry.post_affected && (
                      <Badge variant="outline" className="text-xs">
                        {entry.post_affected}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && (
          <p className="text-center py-8 text-muted-foreground">
            No log entries yet.
          </p>
        )}
      </div>
    </div>
  );
}
