"use client";

import React, { useState, Suspense } from "react";
import Shimmer from "../Shimmer";
import Navigation from "../landing-4/Navigation";
import HeroWrapper from "../landing-4/HeroWrapper";
import FeaturesSection from "../landing-4/FeaturesSection";
import ComparisonSection from "../landing-4/ComparisonSection";
import TestimonialsSection from "../landing-4/TestimonialsSection";
import ComparisonTable from "../landing-4/ComparisonTable";
import Footer from "../landing-4/Footer";

// Only keep theme picker modal as lazy since it's conditional
const ThemePickerModal = React.lazy(() => import("../ThemePickerModal"));

export function LandingClientWrapper() {
  // Theme picker state - moved from main landing component
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);

  return (
    <>
      {/* Navigation - Outside main container for sticky positioning */}
      <Suspense
        fallback={<Shimmer height="80px" className="reserve-space w-full" />}
      >
        <Navigation />
      </Suspense>

      {/* Hero Section - Full Width */}
      <div className="w-full">
        <Suspense
          fallback={<Shimmer height="600px" className="reserve-space w-full" />}
        >
          <HeroWrapper
            isThemePickerOpen={isThemePickerOpen}
            setIsThemePickerOpen={setIsThemePickerOpen}
          />
        </Suspense>
      </div>

      {/* Main content container - Only for middle sections */}
      <div className="relative mx-auto w-full px-2 md:px-4">
        <FeaturesSection />
        <ComparisonSection />
        {/* <TogetherWeCanBuild /> */}
        <TestimonialsSection />
        <ComparisonTable />
      </div>

      {/* Footer Section - Full Width */}
      <div className="w-full">
        <Footer />
      </div>

      {/* Theme Picker Modal - Rendered at landing page level */}
      <Suspense fallback={<div />}>
        <ThemePickerModal
          isOpen={isThemePickerOpen}
          onClose={() => setIsThemePickerOpen(false)}
        />
      </Suspense>
    </>
  );
}
