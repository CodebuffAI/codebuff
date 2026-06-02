import TestLanding from "@/vly/components/test-landing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Freebuff Web",
  description:
    "Freebuff Web — describe your idea and ship a working app. Backed by top firms and trusted by builders worldwide.",
  other: {
    "link rel='preload' as='image' href='/landing/landmarks.jpeg'": "",
    "link rel='preconnect' href='https://fonts.gstatic.com'": "",
  },
};

export default function AboutPage() {
  return <TestLanding />;
}
