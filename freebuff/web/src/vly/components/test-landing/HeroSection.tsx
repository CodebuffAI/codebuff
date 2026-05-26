"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CountUp } from "@/vly/components/CountUp";
import { HeaderLink } from "./Header";
import { AnimatedText } from "./AnimatedText";
import { Logo } from "./LogoCarousel";
import { DocumentInput } from "./DocumentInput";
import { FeaturedProjects } from "./FeaturedProjects";
import { FeatureComparison } from "./FeatureComparison";
import { CodingAgentsSection } from "./CodingAgentsSection";
import { ScrollFadeIn } from "./ScrollFadeIn";
import { ReviewReplicaCard } from "./ReviewReplica";

export interface HeroSectionProps {
  "data-id"?: string;
  logoSrc?: string;
  logoAlt?: string;
  headerLinks?: HeaderLink[];
  badgeText?: string;
  badgeIconSrc?: string;
  headline?: string;
  subheadline?: string;
  trustedByText?: string;
  logos?: Logo[];
  ctaText?: string;
  ctaHref?: string;
  backgroundImageSrc?: string;
  cloudImageSrc?: string;
  className?: string;
  setIsThemePickerOpen?: (open: boolean) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  "data-id": dataId,
  // Header-related props are available but rendered by a separate Header component
  logoSrc: _logoSrc = "/logo.svg",
  logoAlt: _logoAlt = "vly.ai",
  headerLinks: _headerLinks = [
    {
      label: "Dashboard",
      href: "/web/dashboard",
    },
    {
      label: "Community",
      href: "/web/community",
    },
  ],
  badgeText = "Backed by",
  badgeIconSrc = "/YC_icon.png",
  headline = "We just killed",
  subheadline = "The revolutionary architecture changing AI-built software",
  trustedByText: _trustedByText = "TRUSTED BY",
  logos: _logos = [
    {
      src: "/convex-logo.svg",
      alt: "Convex",
    },
    {
      src: "/YCombinator.png",
      alt: "Y Combinator",
      width: 120,
      height: 36,
    },
    {
      src: "/HackTech_Caltech.png",
      alt: "HackTech Caltech",
    },
    {
      src: "/Pivot_Robotics.png",
      alt: "Pivot Robotics",
    },
  ],
  ctaText: _ctaText = "Get Started",
  ctaHref: _ctaHref = "/web/dashboard",
  backgroundImageSrc = "/landing/landmarks.jpeg",
  cloudImageSrc = "/clouds.png",
  className = "",
  setIsThemePickerOpen,
}) => {
  // Explicitly mark header props as intentionally unused (rendered by separate Header component)
  void _logoSrc;
  void _logoAlt;
  void _headerLinks;
  void _trustedByText;
  void _logos;
  void _ctaText;
  void _ctaHref;

  const [scrollY, setScrollY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const userCount = useQuery(api.users.getUserCount);
  const projectCount = useQuery(api.project.getProjectCount);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Set initial value
    handleResize();

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <section
      data-id={dataId}
      className={`relative w-full overflow-hidden bg-[#F7F7F3] px-4 pt-24 text-center sm:px-8 sm:pt-32 md:px-16 lg:px-24 ${className}`}
    >
      {/* Mobile Background - Non-parallax with integrated fades */}
      {isMobile && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-0 h-[737px] max-h-[737px] overflow-hidden">
          {/* Background Image with integrated fade gradients */}
          <div
            className="absolute inset-0 bg-center bg-no-repeat opacity-80"
            style={{
              backgroundImage: `url("${backgroundImageSrc}")`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
            }}
          />
          {/* Fade overlays applied on top of the image */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(to bottom, 
                  #CBCFDA 0%, 
                  rgba(203, 207, 218, 0.7) 10%, 
                  transparent 30%, 
                  transparent 70%, 
                  rgba(247, 247, 243, 0.7) 90%, 
                  #F7F7F3 100%
                )
              `,
            }}
          />
        </div>
      )}

      {/* Desktop Background - With parallax and mask */}
      {!isMobile && (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 z-0 h-[737px] max-h-[737px] overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 120px, black 400px, transparent 650px)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 120px, black 400px, transparent 650px)",
            }}
          >
            {/* Background Image with Parallax */}
            <div
              className="absolute -top-[220px] left-0 right-0 h-[1200px] bg-center bg-no-repeat opacity-80 transition-transform duration-0"
              style={{
                backgroundImage: `url("${backgroundImageSrc}")`,
                backgroundSize: "100% auto",
                transform: `translateY(${scrollY * 0.5}px)`,
              }}
            />
          </div>

          {/* Top Gradient Overlay - transitions from page background to hero */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 z-[1] h-[200px]"
            style={{
              background:
                "linear-gradient(to bottom, #CBCFDA 0%, #CBCFDA 20%, rgba(203, 207, 218, 0.8) 50%, rgba(203, 207, 218, 0.3) 80%, transparent 100%)",
            }}
          />

          {/* Bottom Gradient Overlay - transitions hero to content background */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-[500px] z-10 h-[400px]"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, #F7F7F3 60%, #F7F7F3 100%)",
            }}
          />
        </>
      )}

      {/* Main Content */}
      <div className="relative z-10 mx-auto max-w-[896px] px-4 sm:px-8 md:px-16 lg:px-48">
        {/* Badge */}
        <div className="mb-8 flex items-center justify-center gap-1.5">
          <AnimatedText
            text={badgeText}
            baseDelay={0.05}
            letterDelay={0.01}
            className="text-sm text-[rgba(26,26,26,0.85)]"
          />

          <img
            src={badgeIconSrc}
            alt="Y Combinator"
            className="h-4 w-4 animate-letter-fade-in rounded-sm opacity-0"
            style={{
              animationDelay: "0.15s",
            }}
          />

          <AnimatedText
            text="Combinator"
            baseDelay={0.18}
            letterDelay={0.01}
            className="text-sm text-[rgba(26,26,26,0.85)]"
          />
        </div>

        {/* Headline */}
        <h1 className="-mb-4 text-3xl font-normal leading-tight tracking-tight text-[#1a1a1a] sm:text-4xl sm:leading-[61.6px] sm:tracking-[-1.68px] md:text-5xl lg:text-[56px]">
          <AnimatedText
            text={headline}
            baseDelay={0.3}
            letterDelay={0.015}
            className="text-3xl font-normal leading-tight tracking-tight text-[#1a1a1a] sm:text-4xl sm:leading-[61.6px] sm:tracking-[-1.68px] md:text-5xl lg:text-[56px]"
          />
        </h1>

        {/* Competitor Logos - Large */}
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:mt-0 sm:flex-row sm:gap-6 md:gap-8">
          <div
            className="flex h-20 w-40 animate-letter-fade-in items-center justify-center opacity-0 sm:h-24 sm:w-48 md:h-28 md:w-56 lg:h-32 lg:w-64"
            style={{ animationDelay: "0.5s" }}
          >
            <Image
              src="/competitors/boltnew.png"
              alt="Bolt.new"
              width={256}
              height={128}
              className="object-contain"
              style={{ width: "100%", height: "auto", maxHeight: "100%" }}
              priority
            />
          </div>
          <div
            className="flex h-20 w-40 animate-letter-fade-in items-center justify-center opacity-0 sm:h-24 sm:w-48 md:h-28 md:w-56 lg:h-32 lg:w-64"
            style={{ animationDelay: "0.55s" }}
          >
            <Image
              src="/competitors/replit.png"
              alt="Replit"
              width={256}
              height={128}
              className="object-contain"
              style={{ width: "100%", height: "auto", maxHeight: "100%" }}
              priority
            />
          </div>
          <div
            className="flex h-20 w-40 animate-letter-fade-in items-center justify-center opacity-0 sm:h-24 sm:w-48 md:h-28 md:w-56 lg:h-32 lg:w-64"
            style={{ animationDelay: "0.6s" }}
          >
            <Image
              src="/competitors/base44.png"
              alt="Base"
              width={256}
              height={128}
              className="object-contain"
              style={{ width: "100%", height: "auto", maxHeight: "100%" }}
              priority
            />
          </div>
        </div>

        {/* Description with NEW Badge */}
        <div className="mx-auto -mt-4 flex flex-col items-center justify-center gap-3 sm:-mt-6 sm:flex-row">
          <span
            className="animate-letter-fade-in whitespace-nowrap rounded-full bg-[#1a1a1a] px-3 py-1 text-xs font-medium text-white opacity-0"
            style={{ animationDelay: "0.68s" }}
          >
            NEW
          </span>
          <p className="text-center text-sm leading-relaxed text-[rgba(26,26,26,0.7)] sm:whitespace-nowrap sm:text-left sm:text-base sm:leading-[27px] md:text-lg">
            <AnimatedText
              text={subheadline}
              baseDelay={0.72}
              letterDelay={0.005}
              className="text-sm leading-relaxed text-[rgba(26,26,26,0.7)] sm:text-base sm:leading-[27px] md:text-lg"
            />
          </p>
        </div>
      </div>

      {/* Stats Display */}
      <div className="relative z-10 mx-auto mt-8 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-8 md:gap-12">
        <div
          className="flex animate-letter-fade-in flex-col items-center opacity-0"
          style={{ animationDelay: "1.0s" }}
        >
          <span className="text-3xl font-bold text-emerald-600 sm:text-4xl">
            7x
          </span>
          <span className="text-xs text-[rgba(26,26,26,0.6)]">cheaper</span>
        </div>
        <div
          className="flex animate-letter-fade-in flex-col items-center opacity-0"
          style={{ animationDelay: "1.05s" }}
        >
          <span className="text-3xl font-bold text-[#1a1a1a] sm:text-4xl">
            <CountUp
              end={userCount || 0}
              formatter={(value) => value.toLocaleString()}
            />
            +
          </span>
          <span className="text-xs text-[rgba(26,26,26,0.6)]">
            users trusted
          </span>
        </div>
        <div
          className="flex animate-letter-fade-in flex-col items-center opacity-0"
          style={{ animationDelay: "1.1s" }}
        >
          <span className="text-3xl font-bold text-[#1a1a1a] sm:text-4xl">
            <CountUp
              end={projectCount || 0}
              formatter={(value) => value.toLocaleString()}
            />
            +
          </span>
          <span className="text-xs text-[rgba(26,26,26,0.6)]">
            websites powered
          </span>
        </div>
      </div>

      {/* Document Input - Google Docs Style */}
      <div
        className="relative z-10 mx-auto mt-20 max-w-[900px] px-4"
        style={{
          opacity: Math.min(0.3 + scrollY * 0.01, 1),
          transform: `scale(${Math.min(0.85 + scrollY * 0.0005, 1)}) translateY(${Math.max(40 - scrollY * 0.1, 0)}px)`,
          transformOrigin: "center top",
          transition: "opacity 0.5s ease-out, transform 0.15s ease-out",
        }}
      >
        {setIsThemePickerOpen && (
          <DocumentInput setIsThemePickerOpen={setIsThemePickerOpen} />
        )}
      </div>

      {/* Review Images - Two Column */}
      <ScrollFadeIn className="relative z-10 mx-auto mt-20 flex max-w-[560px] flex-col items-center justify-center gap-8 px-3 sm:px-4 md:flex-row md:items-start md:gap-3 md:px-2">
        <div className="relative flex flex-1 flex-col items-center">
          <Image
            src="/logo.svg"
            alt="vly.ai"
            width={80}
            height={24}
            className="mb-2 h-4 w-auto object-contain"
          />
          <p className="mb-2 text-[10px] text-[rgba(26,26,26,0.6)]">
            Verified <strong>vly.ai</strong> review — avg: 4.8 stars
          </p>
          <ReviewReplicaCard
            avatarText="V"
            avatarBg="#009b86"
            avatarTextColor="#FFFFFF"
            reviewerName="vth_break specs"
            reviewerMeta="US • 1 review"
            reviewDate="3 days ago"
            color="green"
            fullStars={5}
            partialStar={0}
            body="Vly is one of the best web app builders out there right now. I've tried many different web app builders but, vly is the one only I've stuck too because how good it was at creating. Love it!! 10/10"
            className="mx-auto h-auto w-full max-w-[260px]"
          />
          <a
            href="https://www.trustpilot.com/review/vly.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-[10px] text-[rgba(26,26,26,0.7)] transition-colors hover:text-[rgba(26,26,26,0.9)]"
          >
            Read more reviews →
          </a>
        </div>
        <div className="h-px w-full bg-[rgba(26,26,26,0.2)] md:mx-1 md:h-72 md:w-px" />
        <div className="relative flex flex-1 flex-col items-center">
          <Image
            src="/competitors/boltnew.png"
            alt="Bolt.new"
            width={100}
            height={24}
            className="mb-2 h-4 w-auto object-contain"
          />
          <p className="mb-2 text-[10px] text-[rgba(26,26,26,0.6)]">
            Verified <strong>Bolt.new</strong> review — avg: 1.4 stars
          </p>
          <ReviewReplicaCard
            avatarText="AS"
            avatarBg="#ECE6BA"
            avatarTextColor="#1A1A1A"
            avatarSize={36}
            avatarFontSize={18}
            reviewerName="Ashton"
            reviewerMeta="US • 2 reviews"
            reviewDate="Jan 18, 2026"
            color="red"
            fullStars={1}
            partialStar={0}
            body="I've literally lost thousands on their hosting outages. We make marketing sales pages and host them on bolt. Several times in the middle of a $10,000 campaign, the site just crashes and you can not get ahold of anyone, DO NOT"
            className="mx-auto h-auto w-full max-w-[260px]"
          />
          <a
            href="https://www.trustpilot.com/review/bolt.new?stars=1"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-[10px] text-[rgba(26,26,26,0.7)] transition-colors hover:text-[rgba(26,26,26,0.9)]"
          >
            Read more reviews →
          </a>
        </div>
      </ScrollFadeIn>

      {/* Featured Projects & Recent Projects Sections */}
      <ScrollFadeIn>
        <FeaturedProjects />
      </ScrollFadeIn>

      {/* Coding Agents Section */}
      <ScrollFadeIn>
        <CodingAgentsSection />
      </ScrollFadeIn>

      {/* Feature Comparison Section */}
      <ScrollFadeIn>
        <FeatureComparison />
      </ScrollFadeIn>

      {/* Features Section */}
      <div className="relative z-10 mx-auto mb-20 mt-16 max-w-[700px] px-4">
        <ScrollFadeIn>
          <h2 className="mb-10 text-center text-2xl font-medium tracking-tight text-[#1a1a1a]">
            Why teams choose vly.ai
          </h2>
        </ScrollFadeIn>

        {/* Feature 1 - Image Right */}
        <ScrollFadeIn className="mb-10 flex flex-col items-center gap-8 md:flex-row">
          <div className="flex-1 text-center md:text-left">
            <h3 className="mb-2 text-lg font-medium tracking-tight text-[#1a1a1a]">
              7x cheaper & better for AI with our custom realtime architecture
            </h3>
            <p className="text-sm leading-relaxed text-[rgba(26,26,26,0.7)]">
              We implement a realtime-first stack that prioritizes AI
              compatibility to deliver superior performance
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[rgba(26,26,26,0.1)] bg-white p-4 shadow-md">
              {/* Bar Graph Visual */}
              <div className="flex h-full items-end justify-center gap-6">
                {/* vly.ai bar */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-[20px] w-16 items-end justify-center rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-sm">
                    <span className="mb-1 text-[10px] font-bold text-white">
                      $3
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Image src="/logo.svg" alt="vly.ai" width={16} height={5} />
                    <span className="text-xs font-medium text-[#1a1a1a]">
                      vly.ai
                    </span>
                  </div>
                </div>
                {/* Bolt.new bar */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-[140px] w-16 items-end justify-center rounded-t-lg bg-gradient-to-t from-rose-400 to-rose-300 shadow-sm">
                    <span className="mb-2 text-xs font-bold text-white">
                      $25
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[rgba(26,26,26,0.6)]">
                    Bolt.new
                  </span>
                </div>
              </div>
              {/* Label */}
              <div className="absolute right-3 top-3 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                7x savings
              </div>
            </div>
          </div>
        </ScrollFadeIn>

        {/* Feature 2 - Image Left */}
        <ScrollFadeIn className="mb-10 flex flex-col items-center gap-8 md:flex-row-reverse">
          <div className="flex-1 text-center md:text-left">
            <h3 className="mb-2 text-lg font-medium tracking-tight text-[#1a1a1a]">
              Visualize your backend
            </h3>
            <p className="text-sm leading-relaxed text-[rgba(26,26,26,0.7)]">
              We generate in-depth visualizations and explanations that unlock
              the black box of AI generated software.
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-white p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
              {/* Google Docs-style Flowchart */}
              <div className="flex h-full flex-col items-center justify-center">
                {/* Top Row - Client */}
                <div className="rounded-[3px] border border-[#dadce0] bg-white px-3 py-1.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
                  <span className="font-['Google_Sans',system-ui,sans-serif] text-[11px] text-[#3c4043]">
                    Client App
                  </span>
                </div>

                {/* Arrow Down */}
                <svg
                  width="24"
                  height="20"
                  viewBox="0 0 24 20"
                  className="text-[#5f6368]"
                >
                  <path
                    d="M12 2 L12 14 M8 10 L12 14 L16 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>

                {/* Middle Row - Functions */}
                <div className="flex items-center gap-2">
                  <div className="rounded-[3px] border border-[#dadce0] bg-[#fef7e0] px-2.5 py-1">
                    <span className="font-['Google_Sans',system-ui,sans-serif] text-[10px] text-[#5f6368]">
                      queries()
                    </span>
                  </div>
                  <svg
                    width="20"
                    height="2"
                    viewBox="0 0 20 2"
                    className="text-[#5f6368]"
                  >
                    <path
                      d="M0 1 L20 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <div className="rounded-[3px] border border-[#dadce0] bg-[#e8f0fe] px-2.5 py-1">
                    <span className="font-['Google_Sans',system-ui,sans-serif] text-[10px] text-[#5f6368]">
                      mutations()
                    </span>
                  </div>
                  <svg
                    width="20"
                    height="2"
                    viewBox="0 0 20 2"
                    className="text-[#5f6368]"
                  >
                    <path
                      d="M0 1 L20 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <div className="rounded-[3px] border border-[#dadce0] bg-[#fce8e6] px-2.5 py-1">
                    <span className="font-['Google_Sans',system-ui,sans-serif] text-[10px] text-[#5f6368]">
                      actions()
                    </span>
                  </div>
                </div>

                {/* Arrow Down */}
                <svg
                  width="24"
                  height="20"
                  viewBox="0 0 24 20"
                  className="text-[#5f6368]"
                >
                  <path
                    d="M12 2 L12 14 M8 10 L12 14 L16 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>

                {/* Bottom Row - Database */}
                <div className="flex items-center gap-3">
                  <div className="rounded-[3px] border border-[#dadce0] bg-[#e6f4ea] px-3 py-1.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
                    <span className="font-['Google_Sans',system-ui,sans-serif] text-[11px] text-[#3c4043]">
                      Database
                    </span>
                  </div>
                  <div className="h-4 w-px bg-[#dadce0]" />
                  <div className="rounded-[3px] border border-[#dadce0] bg-[#f3e8fd] px-3 py-1.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
                    <span className="font-['Google_Sans',system-ui,sans-serif] text-[11px] text-[#3c4043]">
                      File Storage
                    </span>
                  </div>
                </div>
              </div>

              {/* Google Docs style label */}
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-[3px] bg-[#e8f0fe] px-1.5 py-0.5">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-[#1a73e8]"
                >
                  <path
                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                    fill="currentColor"
                  />
                </svg>
                <span className="font-['Google_Sans',system-ui,sans-serif] text-[9px] font-medium text-[#1a73e8]">
                  Live Sync
                </span>
              </div>
            </div>
          </div>
        </ScrollFadeIn>

        {/* Feature 3 - Image Right - Integrations */}
        <ScrollFadeIn className="mb-10 flex flex-col items-center gap-8 md:flex-row">
          <div className="flex-1 text-center md:text-left">
            <h3 className="mb-2 text-lg font-medium tracking-tight text-[#1a1a1a]">
              Access thousands of integrations
            </h3>
            <p className="text-sm leading-relaxed text-[rgba(26,26,26,0.7)]">
              Our integration library contains thousands of custom integrations
              to plug into any provider
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-white p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
              {/* Google Docs-style Integration Grid */}
              <div className="grid h-full grid-cols-3 gap-2">
                {[
                  { name: "Stripe", icon: "💳", bgColor: "#f3e8fd" },
                  { name: "OpenAI", icon: "🤖", bgColor: "#e6f4ea" },
                  { name: "Twilio", icon: "📱", bgColor: "#fce8e6" },
                  { name: "GitHub", icon: "📦", bgColor: "#e8eaed" },
                  { name: "Slack", icon: "💬", bgColor: "#fef7e0" },
                  { name: "AWS", icon: "☁️", bgColor: "#e8f0fe" },
                  { name: "SendGrid", icon: "✉️", bgColor: "#e8f0fe" },
                  { name: "Notion", icon: "📝", bgColor: "#f3e8fd" },
                  { name: "More...", icon: "+", bgColor: "#f8f9fa" },
                ].map((integration, index) => (
                  <div
                    key={integration.name}
                    className="group relative flex flex-col items-center justify-center rounded-[3px] border border-[#dadce0] p-2 transition-all hover:shadow-[0_1px_3px_0_rgba(0,0,0,0.12)]"
                    style={{ backgroundColor: integration.bgColor }}
                  >
                    <div className="mb-0.5 text-base">{integration.icon}</div>
                    <span className="font-['Google_Sans',system-ui,sans-serif] text-[8px] text-[#5f6368]">
                      {integration.name}
                    </span>
                    {index < 8 && (
                      <div className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#34a853]" />
                    )}
                  </div>
                ))}
              </div>

              {/* Google Docs style toolbar */}
              <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-[3px] border border-[#dadce0] bg-white px-1 py-0.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
                <button className="rounded-[2px] p-0.5 hover:bg-[#f8f9fa]">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-[#5f6368]"
                  >
                    <path
                      d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <div className="h-3 w-px bg-[#dadce0]" />
                <button className="rounded-[2px] p-0.5 hover:bg-[#f8f9fa]">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-[#5f6368]"
                  >
                    <path
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <div className="h-3 w-px bg-[#dadce0]" />
                <span className="px-1 font-['Google_Sans',system-ui,sans-serif] text-[9px] text-[#5f6368]">
                  1000+
                </span>
              </div>
            </div>
          </div>
        </ScrollFadeIn>

        {/* Feature 4 - Image Left - Caltech Hackathon */}
        <ScrollFadeIn className="mb-10 flex flex-col items-center gap-8 md:flex-row-reverse">
          <div className="flex-1 text-center md:text-left">
            <h3 className="mb-2 text-lg font-medium tracking-tight text-[#1a1a1a]">
              Caltech&apos;s Hackathon won with vly.ai
            </h3>
            <p className="text-sm leading-relaxed text-[rgba(26,26,26,0.7)]">
              The winning software in the most prestigious hackathon in the
              world was shipped in just 36 hours on vly.ai
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[rgba(26,26,26,0.1)] bg-white shadow-md">
              <Image
                src="/HackTech_Caltech.png"
                alt="Hackathon Winner"
                fill
                className="object-contain p-4"
              />
            </div>
          </div>
        </ScrollFadeIn>

        {/* Feature 5 - Image Right - Pivot Robotics */}
        <ScrollFadeIn className="flex flex-col items-center gap-8 md:flex-row">
          <div className="flex-1 text-center md:text-left">
            <h3 className="mb-2 text-lg font-medium tracking-tight text-[#1a1a1a]">
              Pivot Robotics (YC W24) used vly.ai to save $20,000+
            </h3>
            <p className="mb-3 text-sm italic leading-relaxed text-[rgba(26,26,26,0.7)]">
              &ldquo;vly.ai helps us rapidly iterate web software at a fraction
              of the cost and time&rdquo;
            </p>
            <p className="text-xs text-[rgba(26,26,26,0.6)]">
              — Siddarth Girdhar, CEO of Pivot Robotics (YC W24)
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[rgba(26,26,26,0.1)] bg-white shadow-md">
              <Image
                src="/Pivot_Robotics.png"
                alt="Pivot Robotics"
                fill
                className="object-contain p-4"
              />
            </div>
          </div>
        </ScrollFadeIn>
      </div>

      {/* Floating Clouds with Parallax */}
      <div className="pointer-events-none absolute inset-0 z-[5]">
        {/* Left Cloud - moves left when scrolling */}
        <div
          className="absolute -left-[100px] top-[220px] transition-transform duration-0"
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
          className="absolute -right-[50px] top-[280px] transition-transform duration-0"
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
    </section>
  );
};
