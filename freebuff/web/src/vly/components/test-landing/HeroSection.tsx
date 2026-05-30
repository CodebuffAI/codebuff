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
  logoSrc: _logoSrc = "/logo-icon.png",
  logoAlt: _logoAlt = "Freebuff Web",
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

  // Silence unused-prop warnings for image assets the dark redesign no longer renders
  void backgroundImageSrc;
  void cloudImageSrc;
  void isMobile;

  return (
    <section
      data-id={dataId}
      className={`relative w-full overflow-hidden bg-background px-4 pt-24 text-center sm:px-8 sm:pt-32 md:px-16 lg:px-24 ${className}`}
    >
      {/* Subtle ambient glow behind the hero — soft acid-green halo at the top
       * to give the dark surface depth without a hard banner image. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[700px]"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124, 255, 63, 0.10), transparent 60%), radial-gradient(ellipse 80% 40% at 50% 30%, rgba(124, 255, 63, 0.04), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[700px] opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent 70%)",
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 mx-auto max-w-[896px] px-4 sm:px-8 md:px-16 lg:px-48">
        {/* Badge */}
        <div className="mb-8 flex items-center justify-center gap-1.5">
          <AnimatedText
            text={badgeText}
            baseDelay={0.05}
            letterDelay={0.01}
            className="text-sm text-foreground/80"
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
            className="text-sm text-foreground/80"
          />
        </div>

        {/* Headline */}
        <h1 className="-mb-4 text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-4xl sm:leading-[61.6px] sm:tracking-[-1.68px] md:text-5xl lg:text-[56px]">
          <AnimatedText
            text={headline}
            baseDelay={0.3}
            letterDelay={0.015}
            className="text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-4xl sm:leading-[61.6px] sm:tracking-[-1.68px] md:text-5xl lg:text-[56px]"
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
            className="animate-letter-fade-in whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground opacity-0"
            style={{ animationDelay: "0.68s" }}
          >
            NEW
          </span>
          <p className="text-center text-sm leading-relaxed text-muted-foreground sm:whitespace-nowrap sm:text-left sm:text-base sm:leading-[27px] md:text-lg">
            <AnimatedText
              text={subheadline}
              baseDelay={0.72}
              letterDelay={0.005}
              className="text-sm leading-relaxed text-muted-foreground sm:text-base sm:leading-[27px] md:text-lg"
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
          <span className="text-3xl font-semibold text-primary sm:text-4xl">
            7x
          </span>
          <span className="text-xs text-muted-foreground">cheaper</span>
        </div>
        <div
          className="flex animate-letter-fade-in flex-col items-center opacity-0"
          style={{ animationDelay: "1.05s" }}
        >
          <span className="text-3xl font-semibold text-foreground sm:text-4xl">
            <CountUp
              end={userCount || 0}
              formatter={(value) => value.toLocaleString()}
            />
            +
          </span>
          <span className="text-xs text-muted-foreground">
            users trusted
          </span>
        </div>
        <div
          className="flex animate-letter-fade-in flex-col items-center opacity-0"
          style={{ animationDelay: "1.1s" }}
        >
          <span className="text-3xl font-semibold text-foreground sm:text-4xl">
            <CountUp
              end={projectCount || 0}
              formatter={(value) => value.toLocaleString()}
            />
            +
          </span>
          <span className="text-xs text-muted-foreground">
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
            src="/logo-icon.png"
            alt="Freebuff Web"
            width={48}
            height={48}
            className="mb-2 h-4 w-4 object-contain"
          />
          <p className="mb-2 text-[10px] text-muted-foreground">
            Verified <strong className="text-foreground/85">Freebuff Web</strong> review — avg: 4.8 stars
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
            body="Freebuff Web is one of the best web app builders out there right now. I've tried many different web app builders but Freebuff Web is the only one I've stuck with because of how good it is at creating. Love it!! 10/10"
            className="mx-auto h-auto w-full max-w-[260px]"
          />
          <a
            href="https://www.trustpilot.com/review/freebuff.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Read more reviews →
          </a>
        </div>
        <div className="h-px w-full bg-border md:mx-1 md:h-72 md:w-px" />
        <div className="relative flex flex-1 flex-col items-center">
          <Image
            src="/competitors/boltnew.png"
            alt="Bolt.new"
            width={100}
            height={24}
            className="mb-2 h-4 w-auto object-contain"
          />
          <p className="mb-2 text-[10px] text-muted-foreground">
            Verified <strong className="text-foreground/85">Bolt.new</strong> review — avg: 1.4 stars
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
            className="mt-2 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
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
          <h2 className="mb-10 text-center text-2xl font-medium tracking-tight text-foreground">
            Why teams choose Freebuff Web
          </h2>
        </ScrollFadeIn>

        {/* Feature 1 - Image Right */}
        <ScrollFadeIn className="mb-10 flex flex-col items-center gap-8 md:flex-row">
          <div className="flex-1 text-center md:text-left">
            <h3 className="mb-2 text-lg font-medium tracking-tight text-foreground">
              7x cheaper & better for AI with our custom realtime architecture
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We implement a realtime-first stack that prioritizes AI
              compatibility to deliver superior performance
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[rgba(26,26,26,0.1)] bg-white p-4 shadow-md">
              {/* Bar Graph Visual */}
              <div className="flex h-full items-end justify-center gap-6">
                {/* Freebuff Web bar */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-[20px] w-16 items-end justify-center rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-sm">
                    <span className="mb-1 text-[10px] font-bold text-white">
                      $3
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Image
                      src="/logo-icon.png"
                      alt="Freebuff Web"
                      width={16}
                      height={16}
                      className="h-3 w-3 object-contain"
                    />
                    <span className="text-xs font-medium text-[#1a1a1a]">
                      Freebuff Web
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
            <h3 className="mb-2 text-lg font-medium tracking-tight text-foreground">
              Visualize your backend
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
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
            <h3 className="mb-2 text-lg font-medium tracking-tight text-foreground">
              Access thousands of integrations
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
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
            <h3 className="mb-2 text-lg font-medium tracking-tight text-foreground">
              Caltech&apos;s Hackathon won with Freebuff Web
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The winning software in the most prestigious hackathon in the
              world was shipped in just 36 hours on Freebuff Web
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/30">
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
            <h3 className="mb-2 text-lg font-medium tracking-tight text-foreground">
              Pivot Robotics (YC W24) used Freebuff Web to save $20,000+
            </h3>
            <p className="mb-3 text-sm italic leading-relaxed text-muted-foreground">
              &ldquo;Freebuff Web helps us rapidly iterate web software at a fraction
              of the cost and time&rdquo;
            </p>
            <p className="text-xs text-muted-foreground/80">
              — Siddarth Girdhar, CEO of Pivot Robotics (YC W24)
            </p>
          </div>
          <div className="relative w-full max-w-[320px] flex-shrink-0 md:w-[320px]">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/30">
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
    </section>
  );
};
