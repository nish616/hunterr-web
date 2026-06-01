import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config. Used by middleware (which runs on the Edge runtime
 * and can't load Node modules like better-sqlite3). The full config in
 * src/auth.ts extends this with the Credentials provider that hits the DB.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
