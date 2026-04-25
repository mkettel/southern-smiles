"use client";

import { List, CalendarDays } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OicEntryCard } from "@/components/oic/oic-entry-card";
import { OicLogCalendar } from "@/components/oic/oic-log-calendar";
import type { OicLogEntry, Division, Post } from "@/lib/types";

interface OicLogViewsProps {
  entries: OicLogEntry[];
  isAdmin: boolean;
  divisions: Division[];
  posts: Post[];
}

export function OicLogViews({
  entries,
  isAdmin,
  divisions,
  posts,
}: OicLogViewsProps) {
  return (
    <Tabs defaultValue="list" className="space-y-4">
      <TabsList>
        <TabsTrigger value="list">
          <List className="h-4 w-4" />
          List
        </TabsTrigger>
        <TabsTrigger value="calendar">
          <CalendarDays className="h-4 w-4" />
          Calendar
        </TabsTrigger>
      </TabsList>

      <TabsContent value="list">
        <div className="space-y-3">
          {entries.map((entry) => (
            <OicEntryCard
              key={entry.id}
              entry={entry}
              isAdmin={isAdmin}
              divisions={divisions}
              posts={posts}
            />
          ))}
          {entries.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">
              No log entries yet.
            </p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="calendar">
        <OicLogCalendar
          entries={entries}
          isAdmin={isAdmin}
          divisions={divisions}
          posts={posts}
        />
      </TabsContent>
    </Tabs>
  );
}
