import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config: no Prisma/database imports here. This is what the
 * Edge-runtime proxy (middleware) uses to check whether a session JWT is
 * present -- it never needs to hit the database to do that. The full config
 * (with the Prisma-backed Credentials provider) lives in auth.ts and is only
 * used by Node-runtime routes (API routes, server components, actions).
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "OWNER" | "SUPERVISOR";
      }
      return session;
    },
  },
};
