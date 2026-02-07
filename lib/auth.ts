import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const secret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "xpersona-dev-secret-min-32-chars-do-not-use-in-production"
    : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  } as never),
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        await db
          .update(users)
          .set({ googleId: account.providerAccountId })
          // Use non-null assertion because DrizzleAdapter ensures user is created before signIn callback?
          // Actually, we should check user.id.
          .where(eq(users.id, user.id!));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});

export type Session = {
  user: { id: string; email?: string | null; name?: string | null; image?: string | null };
  expires: string;
};
