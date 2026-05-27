"use client";

import React from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export interface PageLayoutProps {
  children: React.ReactNode;
  showParallax?: boolean;
  showHome?: boolean;
  backgroundImageSrc?: string;
  cloudImageSrc?: string;
  className?: string;
  contentClassName?: string;
  showFooter?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  showHome = true,
  className = "",
  contentClassName = "",
  showFooter = true,
}) => {
  return (
    <div
      className={`relative min-h-screen w-full overflow-x-hidden bg-background text-foreground ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[720px]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124, 255, 63, 0.10), transparent 55%), radial-gradient(ellipse 60% 35% at 50% 20%, rgba(18, 73, 33, 0.45), transparent 70%)",
        }}
      />

      <Header logoSrc="/freebuff-logo.svg" logoAlt="Freebuff Web" showHome={showHome} />

      <main className={`relative z-10 pt-24 ${contentClassName}`}>
        {children}
      </main>

      {showFooter && <Footer />}
    </div>
  );
};

export default PageLayout;
