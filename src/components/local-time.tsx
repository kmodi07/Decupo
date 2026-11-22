"use client";

import { useSyncExternalStore } from "react";

/**
 * Renders a timestamp in the viewer's own time zone. Server components run in
 * UTC on the Worker, so a server-formatted time would disagree with the live
 * mission log, which is formatted in the browser. The server snapshot is UTC
 * and is replaced by the local rendering on the client without a flash of
 * mismatched markup.
 */
export function LocalTime({ value, mode = "datetime" }: { value: string | Date; mode?: "datetime" | "time" | "date" }) {
  const date = typeof value === "string" ? new Date(value) : value;
  const iso = date.toISOString();
  const text = useSyncExternalStore(
    subscribeNoop,
    () =>
      mode === "time"
        ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : mode === "date"
          ? date.toLocaleDateString()
          : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    () => `${iso.replace("T", " ").slice(0, 16)} UTC`,
  );
  return <time dateTime={iso}>{text}</time>;
}

function subscribeNoop() {
  return () => {};
}
