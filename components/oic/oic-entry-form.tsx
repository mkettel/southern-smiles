"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createOicEntry } from "@/actions/oic-log";
import { format } from "date-fns";

export function OicEntryForm() {
  const [loading, setLoading] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await createOicEntry({
      effective_date: formData.get("effective_date") as string,
      area: (formData.get("area") as string) || null,
      post_affected: (formData.get("post_affected") as string) || null,
      entry_text: formData.get("entry_text") as string,
    });

    if (result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Validation error"
      );
    } else {
      toast.success("Log entry added");
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="effective_date">Date</Label>
              <Input
                id="effective_date"
                name="effective_date"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="area">Area</Label>
              <Input id="area" name="area" placeholder="e.g., Div 6 - Public" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="post_affected">Post Affected</Label>
              <Input
                id="post_affected"
                name="post_affected"
                placeholder="e.g., PR Officer"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="entry_text">Description</Label>
            <Textarea
              id="entry_text"
              name="entry_text"
              placeholder="What changed or happened?"
              required
              rows={2}
            />
          </div>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Adding..." : "Add Entry"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
