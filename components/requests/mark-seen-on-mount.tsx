"use client";

import { useEffect } from "react";
import { markRequestsSeen } from "@/actions/requests";

export function MarkSeenOnMount() {
  useEffect(() => {
    markRequestsSeen().catch(() => {
      // Silently ignore — non-critical operation
    });
  }, []);

  return null;
}
