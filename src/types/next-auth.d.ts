import type { DefaultSession } from "next-auth";

type AdminRole = "OWNER" | "SUPERVISOR";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AdminRole;
    } & DefaultSession["user"];
  }
  interface User {
    role?: AdminRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AdminRole;
  }
}
