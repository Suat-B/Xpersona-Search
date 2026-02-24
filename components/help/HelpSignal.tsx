"use client";

import { useEffect, useState } from "react";

const AI_CONTACT_COOKIE = "xpersona_ai_contact";

export function HelpSignal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const checkCookie = () => {
      const cookieEnabled =
        typeof document !== "undefined" && document.cookie.includes(`${AI_CONTACT_COOKIE}=1`);
      setVisible(cookieEnabled);
    };
    checkCookie();
    timer = setInterval(checkCookie, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="help-signal" role="status" aria-live="polite">
      AI CONNECTED
    </div>
  );
}
