"use client";

// Campaign title with inline rename — click the pencil, edit, Enter to save.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameCampaign } from "@/actions/surveys";
import { Check, Pencil, X } from "lucide-react";

export function CampaignTitle({
  campaignId,
  title,
}: {
  campaignId: string;
  title: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);

  function cancel() {
    setValue(title);
    setEditing(false);
  }

  async function save() {
    if (value.trim() === title) {
      cancel();
      return;
    }
    setSaving(true);
    const res = await renameCampaign(campaignId, value);
    setSaving(false);
    if (res.error) {
      toast.error(typeof res.error === "string" ? res.error : "Could not rename");
      return;
    }
    setEditing(false);
    toast.success("Campaign renamed");
    router.refresh();
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 px-0 text-muted-foreground"
          onClick={() => {
            setValue(title);
            setEditing(true);
          }}
          title="Rename campaign"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        autoFocus
        value={value}
        maxLength={200}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        className="h-9 w-72 text-lg font-semibold"
      />
      <Button size="sm" className="h-8 w-8 px-0" onClick={save} disabled={saving}>
        <Check className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 px-0"
        onClick={cancel}
        disabled={saving}
      >
        <X className="h-4 w-4" />
      </Button>
    </span>
  );
}
