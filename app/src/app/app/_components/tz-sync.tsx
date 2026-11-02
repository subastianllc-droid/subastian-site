"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveTimeZone } from "../actions";

/**
 * Trial and renewal countdowns are calendar-day based, so the server needs the
 * viewer's time zone. Store it in a cookie (for this page) and on the profile
 * (for alert emails), and re-render once if the cookie changed.
 */
export function TzSync({ current, saved }: { current: string | null; saved: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    if (saved !== null && tz !== saved) void saveTimeZone(tz).catch(() => {});
    if (tz !== current) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, saved, router]);
  return null;
}
