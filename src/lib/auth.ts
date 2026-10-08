import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  AdminPasswordLockedError,
  WARN_PASSWORD_ATTEMPTS_LEFT,
  checkAdminPassword,
} from "@/lib/adminPassword";
import { AdminPinLockedError, ADMIN_PIN_PATTERN, findAdminByPin } from "@/lib/adminPin";
import { authConfig } from "@/lib/auth.config";

class PinLockedSignin extends CredentialsSignin {
  code = "pin_locked";
}

class PasswordLockedSignin extends CredentialsSignin {
  code = "password_locked";
}

/** code "password_left_N": wrong password, N attempts left before the lock. */
class WrongPasswordSignin extends CredentialsSignin {
  constructor(left: number) {
    super();
    this.code = `password_left_${left}`;
  }
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

        let result;
        try {
          result = await checkAdminPassword(email, password);
        } catch (error) {
          if (error instanceof AdminPasswordLockedError) throw new PasswordLockedSignin();
          throw error;
        }
        const { admin, attemptsLeft } = result;
        if (!admin) {
          if (attemptsLeft !== null && attemptsLeft <= WARN_PASSWORD_ATTEMPTS_LEFT) {
            throw new WrongPasswordSignin(attemptsLeft);
          }
          return null;
        }

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
