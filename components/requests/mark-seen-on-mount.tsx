"use client";

import { useEffect } from "react";
import { markRequestsSeen } from "@/actions/requests";

export function MarkSeenOnMount() {
  useEffect(() => {
    markRequestsSeen();
  }, []);

  return null;
}
