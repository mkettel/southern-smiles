"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleStat } from "@/actions/admin";

interface StatToggleButtonProps {
  statId: string;
  isActive: boolean;
}

export function StatToggleButton({ statId, isActive }: StatToggleButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    const result = await toggleStat(statId, !isActive);
    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed to update");
    } else {
      toast.success(isActive ? "Stat deactivated" : "Stat activated");
    }
    setLoading(false);
  }

  return (
    <Button
      variant={isActive ? "outline" : "default"}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? "..." : isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
