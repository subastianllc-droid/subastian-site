"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Trial and renewal countdowns are calendar-day based, so the server needs the
 * viewer's time zone. Store it in a cookie and re-render once if it changed.
 */
export function TzSync({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, router]);
  return null;
}
