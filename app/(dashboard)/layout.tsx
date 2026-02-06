import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user) {
    return (
      <>
        <Header user={session.user} />
        <main className="container mx-auto px-4 py-8">{children}</main>
      </>
    );
  }
  const cookieStore = await cookies();
  const userId = getAuthUserFromCookie(cookieStore);
  if (!userId) redirect("/");
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) redirect("/");
  return (
    <>
      <Header user={user} />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </>
  );
}
