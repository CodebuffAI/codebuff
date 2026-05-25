import TestLanding from "@/components/test-landing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  other: {
    "link rel='preload' as='image' href='/landing/landmarks.jpeg'": "",
    "link rel='preconnect' href='https://fonts.gstatic.com'": "",
  },
};

export default function Home() {
  return <TestLanding />;
}
