"use client";

import { useEffect, useState } from "react";

const AI_CONTACT_COOKIE = "xpersona_ai_contact";

export function HelpFrame() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const checkCookie = () => {
      const cookieEnabled =
        typeof document !== "undefined" && document.cookie.includes(`${AI_CONTACT_COOKIE}=1`);
      setEnabled(cookieEnabled);
    };
    checkCookie();
    timer = setInterval(checkCookie, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  if (!enabled) return null;

  return <div className="help-frame" aria-hidden />;
}
