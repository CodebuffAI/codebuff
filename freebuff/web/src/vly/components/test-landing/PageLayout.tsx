"use client";

import React, { useState, useEffect, useRef } from "react";
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
  showParallax = true,
  showHome = true,
  backgroundImageSrc = "/landing/landmarks.jpeg",
  cloudImageSrc = "/clouds.png",
  className = "",
  contentClassName = "",
  showFooter = true,
}) => {
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showParallax) return;

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial call
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showParallax]);

  return (
    <div
      className={`relative min-h-screen w-full overflow-x-hidden ${className}`}
      style={{
        backgroundColor: "#F7F7F3",
      }}
    >
      {/* Header */}
      <Header logoSrc="/logo.svg" logoAlt="vly.ai" showHome={showHome} />

      {/* Background Hero Section - uses absolute positioning like HeroSection */}
      {showParallax && (
        <div
          ref={heroRef}
          className="pointer-events-none absolute left-0 right-0 top-0 z-0 w-full overflow-hidden"
          style={{ height: "737px" }}
        >
          {/* Sky background for parallax area */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "#CBCFDA" }}
          />
          {/* Background Image Container with Clipping and Masking */}
          <div
            className="absolute left-0 right-0 top-0 h-[737px] max-h-[737px] overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 120px, black 400px, transparent 650px)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 120px, black 400px, transparent 650px)",
            }}
          >
            {/* Background Image with Parallax - moves down as you scroll, creating slower scroll effect */}
            <div
              className="absolute -top-[200px] left-0 right-0 h-[1200px] bg-center bg-no-repeat opacity-80"
              style={{
                backgroundImage: `url("${backgroundImageSrc}")`,
                backgroundSize: "100% auto",
                transform: `translateY(${scrollY * 0.5}px)`,
              }}
            />
          </div>

          {/* Top Gradient Overlay - transitions from page background to hero */}
          <div
            className="absolute left-0 right-0 top-0 z-[1] h-[200px]"
            style={{
              background:
                "linear-gradient(to bottom, #CBCFDA 0%, #CBCFDA 20%, rgba(203, 207, 218, 0.8) 50%, rgba(203, 207, 218, 0.3) 80%, transparent 100%)",
            }}
          />

          {/* Bottom Gradient Overlay - transitions hero to content background */}
          <div
            className="absolute left-0 right-0 top-[500px] z-[1] h-[400px]"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, #F7F7F3 60%, #F7F7F3 100%)",
            }}
          />

          {/* Floating Clouds with Parallax */}
          <div className="absolute inset-0 z-[5]">
            {/* Left Cloud - moves left when scrolling */}
            <div
              className="absolute -left-[100px] top-[220px]"
              style={{
                transform: `translateX(${-scrollY * 0.3}px)`,
              }}
            >
              <img
                src={cloudImageSrc}
                alt=""
                className="h-[200px] w-[400px] object-contain opacity-40"
              />
            </div>

            {/* Right Cloud - moves right when scrolling */}
            <div
              className="absolute -right-[50px] top-[280px]"
              style={{
                transform: `translateX(${scrollY * 0.3}px)`,
              }}
            >
              <img
                src={cloudImageSrc}
                alt=""
                className="h-[200px] w-[400px] object-contain opacity-40"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`relative z-10 pt-24 ${contentClassName}`}>
        {children}
      </main>

      {/* Footer */}
      {showFooter && <Footer />}
    </div>
  );
};

export default PageLayout;
