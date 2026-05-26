"use client";

import { Suspense, lazy } from "react";
import ExploreFeed from "@/vly/components/community/ExploreFeed";

const Navigation = lazy(() => import("@/vly/components/landing-4/Navigation"));
const Footer = lazy(() => import("@/vly/components/landing-4/Footer"));

export default function ExplorePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={<div className="h-16" />}>
        <Navigation isDashboard={false} />
      </Suspense>
      <main className="pt-20">
        <ExploreFeed />
      </main>
      <Suspense fallback={<div />}>
        <Footer />
      </Suspense>
    </div>
  );
}
