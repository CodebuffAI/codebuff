"use client";

import Landing4 from "@/vly/components/pages/landing-4";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { WebContainerOptInProvider } from "@/vly/hooks/useWebContainerOptIn";

/**
 * Admin-only WebContainer testing ground.
 *
 * Renders the normal landing hero, but wrapped in WebContainerOptInProvider so
 * projects created from this page use the in-browser WebContainer sandbox
 * instead of the Daytona pool. Production /web is untouched.
 *
 * The client-side role check here is UX only — the authoritative gate lives in
 * the `codesandbox.create.create` mutation, which honors `useWebContainer`
 * exclusively for god/admin users.
 */
export default function WebContainerTestPage() {
  const user = useSignedInUser();
  const isAdmin = user?.role === "god" || user?.role === "admin";

  // Auth state still loading.
  if (user === undefined) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Access Restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Admin access is required for this section.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WebContainerOptInProvider>
      <div className="fixed left-4 top-4 z-50 rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
        WebContainer test mode (admin only)
      </div>
      <Landing4 />
    </WebContainerOptInProvider>
  );
}
