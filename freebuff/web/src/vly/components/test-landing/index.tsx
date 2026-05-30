"use client";

import React, { useState } from "react";
import { HeroSection } from "./HeroSection";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { VCLogosStack } from "./VCLogosStack";
import { CompetitorReviewsStack } from "./CompetitorReviewsStack";
import { ReviewComparison } from "./ReviewComparison";
import { ReviewScoreStrip } from "./ReviewReplica";
import ThemePickerModal from "@/vly/components/ThemePickerModal";
import { HeroStorageProvider } from "@/vly/hooks/useSharedHeroStorage";

export default function TestLanding() {
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);

  return (
    <HeroStorageProvider>
      <div
        className="relative min-h-screen w-full overflow-x-hidden"
        style={{
          backgroundColor: "#CBCFDA",
        }}
      >
        <Header logoSrc="/logo-icon.png" logoAlt="Freebuff Web" showHome={false} />
        {/* Only show floating stacks on large screens */}
        <div className="hidden lg:block">
          <VCLogosStack />
          <CompetitorReviewsStack />
        </div>
        <HeroSection setIsThemePickerOpen={setIsThemePickerOpen} />

        {/* Mobile/Tablet sections for what were floating items */}
        <div className="lg:hidden">
          {/* Trust Section */}
          <div className="bg-white/90 py-12">
            <div className="mx-auto max-w-6xl px-4">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {/* Competitor Reviews Section */}
                <div className="text-center">
                  <h3 className="mb-2 text-lg font-semibold text-gray-900">
                    Human-Verified Reviews
                  </h3>
                  <p className="mb-6 text-sm text-gray-600">
                    Real users confirmed by Trustpilot
                  </p>
                  <div className="space-y-4">
                    {/* Freebuff Web Reviews */}
                    <a
                      href="https://www.trustpilot.com/review/freebuff.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="mb-3 flex items-center justify-center gap-3">
                        <img
                          src="/logo-icon.png"
                          alt="vly ai"
                          className="h-10 w-10"
                        />
                        <span className="text-lg font-medium">Freebuff Web</span>
                      </div>
                      <ReviewScoreStrip
                        rating="4.8"
                        color="green"
                        fullStars={5}
                        partialStar={0}
                        starSize={12}
                        textSize={15}
                        className="mx-auto"
                      />
                    </a>

                    {/* Competitor Reviews */}
                    <div className="grid grid-cols-3 gap-2">
                      <a
                        href="https://www.trustpilot.com/review/replit.com?stars=1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <img
                          src="/competitors/replit.png"
                          alt="Replit"
                          className="mx-auto mb-1 h-6 w-auto"
                        />
                        <ReviewScoreStrip
                          rating="3.4"
                          count="1K"
                          color="yellow"
                          fullStars={3}
                          partialStar={0.4}
                          starSize={8}
                          textSize={10}
                          className="mx-auto"
                        />
                      </a>
                      <a
                        href="https://www.trustpilot.com/review/base44.com?stars=1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <img
                          src="/competitors/base44.png"
                          alt="Base"
                          className="mx-auto mb-1 h-6 w-auto"
                        />
                        <ReviewScoreStrip
                          rating="2.2"
                          count="433"
                          color="red"
                          fullStars={2}
                          partialStar={0.2}
                          starSize={8}
                          textSize={10}
                          className="mx-auto"
                        />
                      </a>
                      <a
                        href="https://www.trustpilot.com/review/bolt.new?stars=1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <img
                          src="/competitors/boltnew.png"
                          alt="Bolt"
                          className="mx-auto mb-1 h-6 w-auto"
                        />
                        <ReviewScoreStrip
                          rating="1.4"
                          count="164"
                          color="red"
                          fullStars={1}
                          partialStar={0.4}
                          starSize={8}
                          textSize={10}
                          className="mx-auto"
                        />
                      </a>
                    </div>
                  </div>
                </div>

                {/* VC Backing Section */}
                <div className="text-center">
                  <h3 className="mb-2 text-lg font-semibold text-gray-900">
                    Backed by Top Firms
                  </h3>
                  <p className="mb-6 text-sm text-gray-600">
                    Trusted by leading investors
                  </p>
                  <div className="mx-auto grid max-w-xs grid-cols-2 gap-3">
                    <img
                      src="/YCombinator.png"
                      alt="Y Combinator"
                      className="mx-auto h-10 w-auto object-contain"
                    />
                    <img
                      src="/vc_logo/goodwater.png"
                      alt="Goodwater"
                      className="mx-auto h-10 w-auto object-contain"
                    />
                    <img
                      src="/vc_logo/468.png"
                      alt="468 Capital"
                      className="mx-auto h-10 w-auto object-contain"
                    />
                    <img
                      src="/vc_logo/0ad.png"
                      alt="0AD"
                      className="mx-auto h-10 w-auto object-contain"
                    />
                    <img
                      src="/vc_logo/bluebrown.png"
                      alt="Blue Brown"
                      className="mx-auto h-10 w-auto object-contain"
                    />
                    <img
                      src="/vc_logo/olive.png"
                      alt="Olive"
                      className="mx-auto h-10 w-auto object-contain"
                    />
                    <img
                      src="/vc_logo/treeo.png"
                      alt="Treeo"
                      className="mx-auto h-10 w-auto object-contain"
                    />
                    <div className="col-span-2 mt-2 text-xs text-gray-500">
                      ...and many more
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ReviewComparison />
        <Footer />

        {/* Theme Picker Modal */}
        <ThemePickerModal
          isOpen={isThemePickerOpen}
          onClose={() => setIsThemePickerOpen(false)}
        />
      </div>
    </HeroStorageProvider>
  );
}

export { HeroSection } from "./HeroSection";
export type { HeroSectionProps } from "./HeroSection";
export { Header } from "./Header";
export type { HeaderProps, HeaderLink } from "./Header";
export { Footer } from "./Footer";
export type { FooterProps } from "./Footer";
export { AnimatedText } from "./AnimatedText";
export type { AnimatedTextProps } from "./AnimatedText";
export { LogoCarousel } from "./LogoCarousel";
export type { LogoCarouselProps, Logo } from "./LogoCarousel";
export { VideoThumbnail } from "./VideoThumbnail";
export type { VideoThumbnailProps } from "./VideoThumbnail";
export { ReviewComparison } from "./ReviewComparison";
export { PageLayout } from "./PageLayout";
export type { PageLayoutProps } from "./PageLayout";
