import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// Owner-only route prefixes -- a SUPERVISOR is redirected away even from
// just viewing these, since e.g. Employees shows pay rates in the page
// itself, not just in a restricted action.
const OWNER_ONLY_PREFIXES = ["/admin/employees", "/admin/payroll", "/admin/payslip", "/admin/tasks"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/admin/login";
  const isProtectedAdminRoute = pathname.startsWith("/admin") && !isLoginPage;

  if (isProtectedAdminRoute && !req.auth) {
    const loginUrl = new URL("/admin/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    isProtectedAdminRoute &&
    req.auth?.user?.role === "SUPERVISOR" &&
    OWNER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.redirect(new URL("/admin/attendance", req.nextUrl.origin));
  }

  if (isLoginPage && req.auth) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
