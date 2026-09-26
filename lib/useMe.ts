"use client";
import { useEffect, useState } from "react";
import type { Who } from "@/lib/session"; // type-only: no server code reaches the browser

export type { Who };

// One request per page load, shared by every component that asks.
let mePromise: Promise<Who | null> | null = null;

function fetchMe(): Promise<Who | null> {
  mePromise ??= fetch("/api/me")
    .then((r) => (r.ok ? r.json() : { who: null }))
    .then((d: { who: Who | null }) => d.who)
    .catch(() => null);
  return mePromise;
}

// undefined = still loading, null = unknown (shouldn't happen behind the gate).
export function useMe(): Who | null | undefined {
  const [who, setWho] = useState<Who | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchMe().then((w) => {
      if (!cancelled) setWho(w);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return who;
}
