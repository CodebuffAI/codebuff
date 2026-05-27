"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { ReviewScoreStrip } from "./ReviewReplica";

const COMPETITOR_REVIEWS = [
  {
    logo: "/competitors/replit.png",
    rating: "3.4",
    count: "1K",
    ratingColor: "yellow" as const,
    fullStars: 3,
    partialStar: 0.4,
    alt: "Replit",
    trustpilotUrl: "https://www.trustpilot.com/review/replit.com?stars=1",
  },
  {
    logo: "/competitors/base44.png",
    rating: "2.2",
    count: "433",
    ratingColor: "red" as const,
    fullStars: 2,
    partialStar: 0.2,
    alt: "Base",
    trustpilotUrl: "https://www.trustpilot.com/review/base44.com?stars=1",
  },
  {
    logo: "/competitors/boltnew.png",
    rating: "1.4",
    count: "164",
    ratingColor: "red" as const,
    fullStars: 1,
    partialStar: 0.4,
    alt: "Bolt",
    trustpilotUrl: "https://www.trustpilot.com/review/bolt.new?stars=1",
  },
];

export const CompetitorReviewsStack: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const appearThreshold = 100;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // Check if footer is in view (within 400px of bottom)
      const isNearFooter = scrollY + windowHeight >= documentHeight - 400;

      // Show only when past threshold AND not near footer
      setIsVisible(scrollY > appearThreshold && !isNearFooter);
    };

    // Check initial scroll position
    handleScroll();

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Slide in from left - instant transition
  const translateX = isVisible ? 0 : -250;

  return (
    <div
      className="fixed z-50 transition-transform duration-300 ease-out"
      style={{
        bottom: "40px",
        left: "25px",
        transform: `translateX(${translateX}px)`,
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <div className="flex flex-col items-start gap-1">
        {/* Title */}
        <h3 className="mb-1 whitespace-nowrap text-sm font-medium text-foreground/85">
          Human-Verified Reviews
        </h3>

        {/* Description */}
        <p className="mb-2 whitespace-nowrap text-left text-[10px] text-muted-foreground">
          Real users confirmed by Trustpilot
        </p>

        {/* Review Stack */}
        <div className="flex flex-col items-start gap-6">
          {/* Freebuff Web - Special case with logo and text side by side */}
          <a
            href="https://www.trustpilot.com/review/freebuff.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-start gap-1 transition-opacity hover:opacity-80"
          >
            {/* Logo and Text Row */}
            <div className="flex items-center gap-2">
              <div className="relative h-[50px] w-[50px]">
                <Image
                  src="/freebuff-logo.svg"
                  alt="Freebuff Web"
                  width={50}
                  height={50}
                  className="h-full w-full object-contain object-left opacity-90"
                />
              </div>
              <span className="text-lg font-normal tracking-wide text-foreground/85">
                Freebuff Web
              </span>
            </div>
            {/* Review Image */}
            <div className="relative w-[130px] overflow-hidden rounded-sm">
              <ReviewScoreStrip
                rating="4.8"
                color="green"
                fullStars={5}
                partialStar={0}
                starSize={14}
                textSize={14}
                textWeight={400}
              />
            </div>
          </a>

          {COMPETITOR_REVIEWS.map((competitor) => (
            <a
              key={competitor.alt}
              href={competitor.trustpilotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-start transition-opacity hover:opacity-80"
            >
              {/* Company Logo */}
              <div className="relative w-[100px]">
                <Image
                  src={competitor.logo}
                  alt={competitor.alt}
                  width={120}
                  height={1}
                  className="h-full w-full object-contain object-left opacity-90"
                />
              </div>
              {/* Review Image */}
              <div className="relative w-[130px] overflow-hidden rounded-sm">
                <ReviewScoreStrip
                  rating={competitor.rating}
                  count={competitor.count}
                  color={competitor.ratingColor}
                  fullStars={competitor.fullStars}
                  partialStar={competitor.partialStar}
                  starSize={13}
                  textSize={12}
                  textWeight={400}
                />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
