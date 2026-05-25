"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from "@/components/auth/AuthComponents";

export interface FooterProps {
  logoSrc?: string;
  logoAlt?: string;
  backgroundImageSrc?: string;
  cloudImageSrc?: string;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({
  logoSrc = "/logo.svg",
  logoAlt = "vly.ai",
  backgroundImageSrc = "/landing/below_clouds.jpeg",
  cloudImageSrc = "clouds.png",
  className = "",
}) => {
  const router = useRouter();

  const handleOpenDiscord = () => {
    window.open("https://discord.gg/2gSmB9DxJW", "_blank");
  };

  return (
    <footer
      className={`relative w-full overflow-hidden bg-[#CBCFDA] text-center ${className}`}
    >
      {/* Background Image Container */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 top-0 z-0 overflow-hidden">
        {/* Background Image - Static, no parallax */}
        <div
          className="absolute left-0 right-0 top-0 h-full min-h-[600px] bg-cover bg-center"
          style={{
            backgroundImage: `url("${backgroundImageSrc}")`,
          }}
        />
        {/* Cloud Image Overlay */}
        <div
          className="absolute left-0 right-0 top-0 h-full bg-contain bg-center bg-no-repeat"
          style={{
            backgroundImage: `url("${cloudImageSrc}")`,
          }}
        />
      </div>

      {/* Top Gradient Overlay - transitions from white content background to footer background */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-[1] h-[250px]"
        style={{
          background:
            "linear-gradient(to bottom, #F7F7F3 0%, #F7F7F3 10%, rgba(247, 247, 243, 0.9) 30%, rgba(247, 247, 243, 0.5) 60%, rgba(247, 247, 243, 0.2) 85%, transparent 100%)",
        }}
      />

      {/* Bottom Gradient Overlay - transitions from footer background to overscroll color */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] h-[150px]"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(203, 207, 218, 0.3) 30%, rgba(203, 207, 218, 0.7) 70%, #CBCFDA 100%)",
        }}
      />

      {/* Footer Content */}
      <div className="relative z-10 px-8 py-24">
        <div className="mx-auto max-w-[1280px]">
          {/* Logo */}
          <div className="mb-8">
            <Link href="/">
              <Image
                src={logoSrc}
                alt={logoAlt}
                width={140}
                height={46}
                className="mx-auto h-12 w-auto"
              />
            </Link>
          </div>

          {/* Tagline */}
          <p className="mb-8 text-lg text-[#1a1a1a]">
            <span className="font-serif">You type. We </span>
            <span className="font-serif italic">ship.</span>
          </p>

          {/* Navigation Links */}
          <div className="mb-8 flex flex-wrap justify-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-[#1a1a1a] transition-colors hover:text-black"
            >
              My Projects
            </Link>
            <Link
              href="/community"
              className="text-sm font-medium text-[#1a1a1a] transition-colors hover:text-black"
            >
              Community
            </Link>
            <Link
              href="/earn"
              className="text-sm font-medium text-[#1a1a1a] transition-colors hover:text-black"
            >
              Earn
            </Link>
            <button
              onClick={handleOpenDiscord}
              className="text-sm font-medium text-[#1a1a1a] transition-colors hover:text-black"
            >
              Discord
            </button>
            <Link
              href="/pricing"
              className="text-sm font-medium text-[#1a1a1a] transition-colors hover:text-black"
            >
              Pricing
            </Link>
            <Link
              href="/privacy"
              className="text-sm font-medium text-[#1a1a1a] transition-colors hover:text-black"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm font-medium text-[#1a1a1a] transition-colors hover:text-black"
            >
              Terms
            </Link>
          </div>

          {/* Action Buttons */}
          <div className="mb-8 flex justify-center gap-4">
            <SignedOut>
              <SignInButton mode="modal" asChild>
                <button className="rounded-xl bg-white/30 px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] outline outline-1 outline-white/50 backdrop-blur-lg transition-all hover:bg-white/40">
                  Get Started
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-xl bg-white/30 px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] outline outline-1 outline-white/50 backdrop-blur-lg transition-all hover:bg-white/40"
              >
                My Projects
              </button>
            </SignedIn>
            <button
              onClick={handleOpenDiscord}
              className="rounded-xl bg-white/30 px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] outline outline-1 outline-white/50 backdrop-blur-lg transition-all hover:bg-white/40"
            >
              Join Discord
            </button>
          </div>

          {/* Social Links */}
          <div className="mb-8 flex justify-center gap-6">
            <a
              href="https://x.com/vly_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a1a1a] transition-colors hover:text-black"
              aria-label="X (Twitter)"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/company/vly-ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a1a1a] transition-colors hover:text-black"
              aria-label="LinkedIn"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="https://discord.gg/2gSmB9DxJW"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a1a1a] transition-colors hover:text-black"
              aria-label="Discord"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          </div>

          {/* Copyright */}
          <div className="">
            <p className="text-sm text-[rgba(26,26,26,0.6)]">
              © {new Date().getFullYear()} vly.ai. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
