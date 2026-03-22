"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { createRequest, type RequestType, type RequestPriority } from "@/actions/requests";
import { Plus } from "lucide-react";

export function RequestForm() {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<RequestType>("feature");
  const [priority, setPriority] = useState<RequestPriority>("medium");

  function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    startTransition(async () => {
      const result = await createRequest({
        title,
        description: description || null,
        type,
        priority,
      });

      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to create");
      } else {
        toast.success("Request added");
        setTitle("");
        setDescription("");
        setType("feature");
        setPriority("medium");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submit a Request</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="req-title">Title</Label>
            <Input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the bug or feature..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="req-desc">Description (optional)</Label>
            <Textarea
              id="req-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details, steps to reproduce, expected behavior..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => v && setType(v as RequestType)}>
                <SelectTrigger>
                  <span>
                    {type === "bug" ? "Bug" : type === "feature" ? "Feature Request" : "Improvement"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="improvement">Improvement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => v && setPriority(v as RequestPriority)}>
                <SelectTrigger>
                  <span className="capitalize">{priority}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? "Adding..." : <>
              <Plus className="h-4 w-4 mr-1" /> Add Request
            </>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
