"use client";

import { useEffect } from "react";
import { startSessionWatcher } from "@/lib/client-auth";

/** Keeps access-token refresh armed while the app is open. */
export function SessionWatcher() {
  useEffect(() => startSessionWatcher(), []);
  return null;
}
