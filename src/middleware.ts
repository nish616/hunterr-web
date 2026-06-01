import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;

  // Protect dashboard + future authed routes
  const isProtected = pathname.startsWith("/dashboard");

  if (isProtected && !isAuthed) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Redirect away from signin if already authed
  if (pathname === "/signin" && isAuthed) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Run on every route except static assets + api/auth
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
