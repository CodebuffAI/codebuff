"use client";

import { Suspense, lazy } from "react";
import { useParams } from "next/navigation";
import UserProfile from "@/components/community/UserProfile";
import { Id } from "@/convex/_generated/dataModel";

const Navigation = lazy(() => import("@/components/landing-4/Navigation"));
const Footer = lazy(() => import("@/components/landing-4/Footer"));

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.id as Id<"users">;

  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={<div className="h-16" />}>
        <Navigation isDashboard={false} />
      </Suspense>
      <main className="pt-20">
        <UserProfile userId={userId} />
      </main>
      <Suspense fallback={<div />}>
        <Footer />
      </Suspense>
    </div>
  );
}
