"use client";

import { Suspense, lazy } from "react";
import { useParams } from "next/navigation";
import ProjectDetail from "@/vly/components/community/ProjectDetail";
import { Id } from "@/convex/_generated/dataModel";

const Navigation = lazy(() => import("@/vly/components/landing-4/Navigation"));
const Footer = lazy(() => import("@/vly/components/landing-4/Footer"));

export default function ProjectDetailPage() {
  const params = useParams();
  const postId = params.id as Id<"community_posts">;

  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={<div className="h-16" />}>
        <Navigation isDashboard={false} />
      </Suspense>
      <main className="pt-20">
        <ProjectDetail postId={postId} />
      </main>
      <Suspense fallback={<div />}>
        <Footer />
      </Suspense>
    </div>
  );
}
