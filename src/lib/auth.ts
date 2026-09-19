import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/pin";
import { AdminPinLockedError, ADMIN_PIN_PATTERN, findAdminByPin } from "@/lib/adminPin";
import { authConfig } from "@/lib/auth.config";

class PinLockedSignin extends CredentialsSignin {
  code = "pin_locked";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const admin = await prisma.adminUser.findUnique({ where: { email } });
        if (!admin || !admin.active) return null;

        const valid = await verifyPassword(password, admin.passwordHash);
        if (!valid) return null;

        return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
      },
    }),
    Credentials({
      id: "admin-pin",
      credentials: { pin: { label: "PIN", type: "password" } },
      authorize: async (credentials) => {
        const pin = credentials?.pin as string | undefined;
        if (!pin || !ADMIN_PIN_PATTERN.test(pin)) return null;

        try {
          const admin = await findAdminByPin(pin);
          if (!admin) return null;
          return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
        } catch (error) {
          if (error instanceof AdminPinLockedError) throw new PinLockedSignin();
          throw error;
        }
      },
    }),
  ],
});
