import type { Metadata } from "next";

import ProjectsDashboard from "@/vly/components/pages/ProjectsDashboard";

export const metadata: Metadata = {
  title: "Freebuff Web — The 100% free AI app builder",
  description:
    "Build, preview, and deploy full-stack apps for free with Freebuff Web. No subscription, no API keys. Describe your idea and ship it in minutes.",
  alternates: { canonical: "/web" },
  openGraph: {
    title: "Freebuff Web — The 100% free AI app builder",
    description:
      "Build, preview, and deploy full-stack apps for free. No subscription, no API keys.",
    url: "/web",
    type: "website",
  },
};

export default function WebHome() {
  return <ProjectsDashboard />;
}
