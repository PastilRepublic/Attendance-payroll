import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/pin";
import { authConfig } from "@/lib/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        try {
          const email = credentials?.email as string | undefined;
          const password = credentials?.password as string | undefined;
          if (!email || !password) {
            console.error("[authorize] missing email or password in submission");
            return null;
          }

          const admin = await prisma.adminUser.findUnique({ where: { email } });
          if (!admin) {
            console.error(`[authorize] no AdminUser found for email: ${email}`);
            return null;
          }

          const valid = await verifyPassword(password, admin.passwordHash);
          if (!valid) {
            console.error(`[authorize] password mismatch for email: ${email}`);
            return null;
          }

          return { id: admin.id, name: admin.name, email: admin.email };
        } catch (err) {
          console.error("[authorize] threw an error:", err);
          throw err;
        }
      },
    }),
  ],
});
