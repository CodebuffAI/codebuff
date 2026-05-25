import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/server(.*)",
  "/project(.*)",
  "/invite(.*)",
  "/earn(.*)",
]);

export const proxy = clerkMiddleware(async (auth, req) => {
  const url = new URL(req.url);

  // Check for referral code in URL query params
  const referralCode = url.searchParams.get("ref");

  if (referralCode) {
    // Store the referral code in a cookie
    const cleanUrl = new URL(url.pathname + url.search, req.url);
    cleanUrl.searchParams.delete("ref");
    const response = NextResponse.redirect(cleanUrl);

    // Set cookie with referral code (24-hour attribution window)
    response.cookies.set("vly_referral_code", referralCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: "/",
    });

    return response;
  }

  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
