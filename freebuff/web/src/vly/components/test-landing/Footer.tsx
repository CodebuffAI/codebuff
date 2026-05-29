"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from "@/vly/components/auth/AuthComponents";

export interface FooterProps {
  logoSrc?: string;
  logoAlt?: string;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({
  logoSrc = "/favicon.svg",
  logoAlt = "Freebuff Web",
  className = "",
}) => {
  const router = useRouter();

  const handleOpenDiscord = () => {
    window.open("https://discord.gg/2gSmB9DxJW", "_blank");
  };

  return (
    <footer
      className={`relative w-full overflow-hidden border-t border-border/60 bg-background text-center text-foreground ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[420px]"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 110%, rgba(124, 255, 63, 0.10), transparent 60%), radial-gradient(ellipse 55% 35% at 50% 90%, rgba(18, 73, 33, 0.45), transparent 70%)",
        }}
      />

      {/* Footer Content */}
      <div className="relative z-10 px-5 py-12 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-[1280px]">
          {/* Logo */}
          <div className="mb-8">
            <Link href="/web">
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
          <p className="mb-8 text-lg text-foreground/85">
            <span className="font-serif">You type. We </span>
            <span className="font-serif italic text-primary">ship.</span>
          </p>

          {/* Navigation Links */}
          <div className="mb-8 flex flex-wrap justify-center gap-x-5 gap-y-2.5 sm:gap-6">
            <Link
              href="/web"
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-primary"
            >
              My Projects
            </Link>
            <Link
              href="/web/community"
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-primary"
            >
              Community
            </Link>
            <button
              onClick={handleOpenDiscord}
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-primary"
            >
              Discord
            </button>
            <Link
              href="/web/pricing"
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-primary"
            >
              Pricing
            </Link>
            <Link
              href="/web/privacy"
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-primary"
            >
              Privacy
            </Link>
            <Link
              href="/web/terms"
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-primary"
            >
              Terms
            </Link>
          </div>

          {/* Action Buttons */}
          <div className="mb-8 flex flex-wrap justify-center gap-3 sm:gap-4">
            <SignedOut>
              <SignInButton mode="modal" asChild>
                <button className="rounded-xl border border-border/60 bg-card/60 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur-lg transition-all hover:border-primary/50 hover:text-primary">
                  Get Started
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <button
                onClick={() => router.push("/web/dashboard")}
                className="rounded-xl border border-border/60 bg-card/60 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur-lg transition-all hover:border-primary/50 hover:text-primary"
              >
                My Projects
              </button>
            </SignedIn>
            <button
              onClick={handleOpenDiscord}
              className="rounded-xl border border-border/60 bg-card/60 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur-lg transition-all hover:border-primary/50 hover:text-primary"
            >
              Join Discord
            </button>
          </div>

          {/* Social Links */}
          <div className="mb-8 flex justify-center gap-6">
            <a
              href="https://x.com/freebuffdev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/70 transition-colors hover:text-primary"
              aria-label="X (Twitter)"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/company/freebuff/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/70 transition-colors hover:text-primary"
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
              className="text-foreground/70 transition-colors hover:text-primary"
              aria-label="Discord"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          </div>

          {/* Copyright */}
          <div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Freebuff Web. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
