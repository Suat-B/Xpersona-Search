import { redirect } from "next/navigation";

/**
 * Root route (/) — redirect to Dashboard as the canonical front page.
 * Dashboard auto-creates guest sessions for anonymous visitors (EnsureGuest).
 */
export default function RootPage() {
  redirect("/dashboard");
}
