import React from "react";
import { HeroStorageProvider } from "@/hooks/useSharedHeroStorage";
import { LandingClientWrapper } from "./LandingClientWrapper";

export default function Landing4() {
  return (
    <HeroStorageProvider>
      <div className="relative min-h-screen w-full overflow-x-hidden scrollbar-hide">
        {/* Client wrapper handles all interactive functionality and components */}
        <LandingClientWrapper />
      </div>
    </HeroStorageProvider>
  );
}
