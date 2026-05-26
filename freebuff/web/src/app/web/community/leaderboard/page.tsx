"use client";

import { Suspense, lazy } from "react";
import Leaderboard from "@/vly/components/community/Leaderboard";

const Navigation = lazy(() => import("@/vly/components/landing-4/Navigation"));
const Footer = lazy(() => import("@/vly/components/landing-4/Footer"));

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={<div className="h-16" />}>
        <Navigation isDashboard={false} />
      </Suspense>
      <main className="pt-20">
        <Leaderboard />
      </main>
      <Suspense fallback={<div />}>
        <Footer />
      </Suspense>
    </div>
  );
}
