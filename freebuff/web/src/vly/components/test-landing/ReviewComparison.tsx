"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";

// All Freebuff testimonial images
const VLY_TESTIMONIALS = [
  "/reviews/vly_testimonial.png",
  "/reviews/vly_testimonial_2.png",
  "/reviews/vly_testimonial_3.png",
  "/reviews/vly_testimonial_4.png",
  "/reviews/vly_testimonial_5.png",
  "/reviews/vly_testimonial_6.png",
  "/reviews/vly_testimonial_7.png",
  "/reviews/vly_testimonial_8.png",
  "/reviews/vly_testimonial_9.png",
  "/reviews/vly_testimonial_10.png",
  "/reviews/vly_testimonial_11.png",
  "/reviews/vly_testimonial_12.png",
  "/reviews/vly_tesitmonial_13.png",
  "/reviews/vly_testimonial_14.png",
  "/reviews/vly_review_5.png",
  "/reviews/vly_review_6.png",
];

interface CompetitorComparison {
  name: string;
  logo: string;
  review: string;
  vlyReview: string;
  description: string;
  trustpilotUrl: string;
}

const COMPETITOR_COMPARISONS: CompetitorComparison[] = [
  {
    name: "Replit",
    logo: "/competitors/replit.png",
    review: "/reviews/replit_review.png",
    vlyReview: "/reviews/vly_review_3.png",
    description:
      "Replit is known to be plagued with issues, with users encouraging you to use vly instead.",
    trustpilotUrl: "https://www.trustpilot.com/review/replit.com?stars=1",
  },
  {
    name: "Base44",
    logo: "/competitors/base44.png",
    review: "/reviews/base44_review.png",
    vlyReview: "/reviews/vly_review_2.png",
    description: "76% of users rated it 1-star, making it one of the worst.",
    trustpilotUrl: "https://www.trustpilot.com/review/base44.com?stars=1",
  },
  {
    name: "Bolt.new",
    logo: "/competitors/boltnew.png",
    review: "/reviews/bolt_review.png",
    vlyReview: "/reviews/vly_review_4.png",
    description: "Worst-rated with the most one-star reviews (84%).",
    trustpilotUrl: "https://www.trustpilot.com/review/bolt.new?stars=1",
  },
];

export const ReviewComparison: React.FC = () => {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (sectionRef.current) {
        const rect = sectionRef.current.getBoundingClientRect();
        // Calculate relative scroll position within the section for parallax effect
        setScrollY(-rect.top * 0.4);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden bg-[#F7F7F3] py-20"
    >
      {/* Parallax Background Image
      <div 
        className="absolute inset-0 w-full"
        style={{
          top: "-25%",
        }}
      >
        <div 
          className="absolute inset-0 w-full"
          style={{
            transform: `translateY(${scrollY}px)`,
            willChange: "transform",
          }}
        >
          <Image
            src="/landing/mid_sf_bg.jpeg"
            alt=""
            fill
            className="object-cover object-center"
            priority
            quality={90}
          />
        </div>
      </div>

      <div 
        className="absolute top-0 left-0 right-0 z-[1] pointer-events-none"
        style={{
          height: "250px",
          background: "linear-gradient(to bottom, #F7F7F3 0%, #F7F7F3 30%, rgba(247, 247, 243, 0.85) 50%, rgba(247, 247, 243, 0.5) 70%, rgba(247, 247, 243, 0.15) 90%, transparent 100%)",
        }}
      />

      <div 
        className="absolute bottom-0 left-0 right-0 z-[1] pointer-events-none"
        style={{
          height: "250px",
          background: "linear-gradient(to top, #F7F7F3 0%, #F7F7F3 30%, rgba(247, 247, 243, 0.85) 50%, rgba(247, 247, 243, 0.5) 70%, rgba(247, 247, 243, 0.15) 90%, transparent 100%)",
        }}
      /> */}

      {/* Content Overlay with subtle background for readability */}
      <div className="relative z-[2]">
        {/* Lightbox Modal - Google Docs Style */}
        {expandedImage && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(32,33,36,0.6)]"
            onClick={() => setExpandedImage(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-[8px] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Google Docs style header */}
              <div className="flex items-center justify-between border-b border-[#dadce0] bg-[#f8f9fa] px-4 py-2">
                <span className="font-['Google_Sans',system-ui,sans-serif] text-[13px] text-[#3c4043]">
                  Testimonial
                </span>
                <button
                  onClick={() => setExpandedImage(null)}
                  className="rounded-[3px] p-1 transition-colors hover:bg-[#e8eaed]"
                >
                  <svg
                    className="h-5 w-5 text-[#5f6368]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="p-2">
                <Image
                  src={expandedImage}
                  alt="Expanded testimonial"
                  width={800}
                  height={600}
                  className="h-auto max-h-[calc(90vh-60px)] w-auto max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-[800px] px-4 sm:px-8">
          {/* Section Header - Google Docs Style */}
          <div className="mb-10 text-center">
            <h2 className="mb-3 font-['Google_Sans',system-ui,sans-serif] text-[22px] font-normal text-[#202124] sm:text-[26px]">
              Verified reviews for Bolt.new, Replit, and more
            </h2>
            <p className="mx-auto max-w-[600px] font-['Roboto',system-ui,sans-serif] text-[14px] leading-[20px] text-[#5f6368]">
              Read human-verified reviews from Trustpilot.
            </p>
          </div>

          {/* Comparison Cards */}
          <div className="flex flex-col gap-8">
            {COMPETITOR_COMPARISONS.map((competitor, index) => (
              <div key={competitor.name} className="group">
                {/* Comparison Container */}
                <div className="flex flex-col items-stretch gap-3 sm:flex-row">
                  {/* Competitor Side (Left) */}
                  <div className="flex flex-1 flex-col">
                    {/* Competitor Header */}
                    <div className="mb-3 flex items-center gap-2">
                      <div className="relative h-6 w-auto">
                        <Image
                          src={competitor.logo}
                          alt={competitor.name}
                          width={80}
                          height={24}
                          className="h-6 w-auto object-contain object-left opacity-80"
                        />
                      </div>
                      <a
                        href={competitor.trustpilotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-['Roboto',system-ui,sans-serif] text-[12px] text-[#1a73e8] transition-colors hover:text-[#1557b0] hover:underline"
                      >
                        Read all reviews →
                      </a>
                    </div>

                    {/* Competitor Review Card - Google Docs Style */}
                    <div className="overflow-hidden rounded-[3px] border border-[#dadce0] bg-white p-1 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)]">
                      <Image
                        src={competitor.review}
                        alt={`${competitor.name} review`}
                        width={350}
                        height={400}
                        className="h-auto w-full object-contain"
                      />
                    </div>
                  </div>

                  {/* VS Divider - Google Docs Style */}
                  <div className="flex flex-col items-center justify-center px-3">
                    <div className="w-[1px] flex-1 bg-[#e8eaed]" />
                    <div className="my-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[3px] border border-[#dadce0] bg-[#f8f9fa]">
                      <span className="font-['Google_Sans',system-ui,sans-serif] text-[10px] font-medium text-[#5f6368]">
                        VS
                      </span>
                    </div>
                    <div className="w-[1px] flex-1 bg-[#e8eaed]" />
                  </div>

                  {/* Freebuff Side (Right) */}
                  <div className="flex flex-1 flex-col">
                    {/* Freebuff Header */}
                    <div className="mb-3 flex items-center gap-2">
                      <div className="relative h-6 w-6">
                        <Image
                          src="/logo-icon.png"
                          alt="Freebuff Web"
                          width={24}
                          height={24}
                          className="h-6 w-6 object-contain"
                        />
                      </div>
                      <span className="text-xs font-semibold text-[rgba(26,26,26,0.85)]">
                        Freebuff Web
                      </span>
                      <span className="text-xs font-medium text-[rgba(26,26,26,0.5)]">
                        review
                      </span>
                    </div>

                    {/* Freebuff Review Card - Google Docs Style */}
                    <div className="overflow-hidden rounded-[3px] border border-[#dadce0] bg-white p-1 shadow-[0_1px_2px_0_rgba(60,64,67,0.08)]">
                      <Image
                        src={competitor.vlyReview}
                        alt="Freebuff Web review"
                        width={350}
                        height={400}
                        className="h-auto w-full object-contain"
                      />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="mt-4 text-center">
                  <p className="mx-auto max-w-[600px] text-sm leading-relaxed text-[rgba(26,26,26,0.65)]">
                    <span className="font-medium text-[rgba(26,26,26,0.8)]">
                      {competitor.name}:
                    </span>{" "}
                    {competitor.description.replace(`${competitor.name} `, "")}
                  </p>
                </div>

                {/* Separator (except for last item) */}
                {index < COMPETITOR_COMPARISONS.length - 1 && (
                  <div className="mx-auto mt-6 h-px w-32 bg-gradient-to-r from-transparent via-[rgba(26,26,26,0.08)] to-transparent" />
                )}
              </div>
            ))}
          </div>

          {/* Bottom CTA - Google Docs Style */}
          <div className="mt-14 text-center">
            <a
              href="https://www.trustpilot.com/review/freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[3px] border border-[#dadce0] bg-[#ffffff] px-4 py-2 font-['Google_Sans',system-ui,sans-serif] text-[13px] font-medium text-[#1a73e8] transition-all duration-200 hover:border-[#c7c7c7] hover:bg-[#f8f9fa]"
            >
              All vly reviews on Trustpilot
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          </div>
        </div>

        {/* Freebuff Testimonials Gallery - Google Docs Style */}
        <div className="mx-auto mt-20 max-w-[900px] px-8">
          {/* Gallery Header - Google Docs Style */}
          <div className="mb-8 text-center">
            <div className="mb-3 flex items-center justify-center gap-2">
              <div className="h-[1px] w-16 bg-[#dadce0]" />
              <span className="font-['Google_Sans',system-ui,sans-serif] text-[11px] font-medium uppercase tracking-[0.08em] text-[#5f6368]">
                Testimonials
              </span>
              <div className="h-[1px] w-16 bg-[#dadce0]" />
            </div>
            <h3 className="mb-2 font-['Google_Sans',system-ui,sans-serif] text-[24px] font-normal text-[#202124]">
              What our users are saying
            </h3>
            <p className="font-['Roboto',system-ui,sans-serif] text-[13px] leading-[20px] text-[#5f6368]">
              Click any review to expand • Real testimonials from the Freebuff Web
              community
            </p>
          </div>

          {/* Two Column Masonry Testimonial Grid - Google Docs Style (1 column on mobile) */}
          <div
            className="columns-1 gap-4 sm:columns-2"
            style={{ columnGap: "16px" }}
          >
            {VLY_TESTIMONIALS.map((testimonial, index) => (
              <div
                key={testimonial}
                onClick={() => setExpandedImage(testimonial)}
                className="group mb-4 cursor-pointer break-inside-avoid overflow-hidden rounded-[3px] border border-[#dadce0] bg-white shadow-[0_1px_2px_0_rgba(60,64,67,0.08)] transition-all duration-200 hover:border-[#c7c7c7] hover:shadow-[0_1px_3px_1px_rgba(60,64,67,0.15)]"
              >
                <div className="relative">
                  <Image
                    src={testimonial}
                    alt={`Freebuff Web testimonial ${index + 1}`}
                    width={450}
                    height={350}
                    className="block h-auto w-full"
                  />
                  {/* Hover overlay - Google Docs style */}
                  <div className="absolute inset-0 flex items-center justify-center bg-[#f8f9fa]/0 opacity-0 transition-all duration-200 group-hover:bg-[#f8f9fa]/40 group-hover:opacity-100">
                    <div className="flex items-center gap-1.5 rounded-[3px] border border-[#dadce0] bg-white/95 px-3 py-1.5 shadow-[0_1px_2px_0_rgba(60,64,67,0.15)] backdrop-blur-sm">
                      <svg
                        className="h-3.5 w-3.5 text-[#5f6368]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                        />
                      </svg>
                      <span className="font-['Google_Sans',system-ui,sans-serif] text-xs text-[#3c4043]">
                        Click to expand
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Gallery CTA - Google Docs Style */}
          <div className="mt-10 text-center">
            <a
              href="https://www.trustpilot.com/review/freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[3px] border border-[#dadce0] bg-[#f8f9fa] px-4 py-2 font-['Google_Sans',system-ui,sans-serif] text-[13px] font-medium text-[#3c4043] transition-all duration-200 hover:border-[#c7c7c7] hover:bg-[#f1f3f4] hover:shadow-[0_1px_2px_0_rgba(60,64,67,0.15)]"
            >
              <svg
                className="h-4 w-4 text-[#fbbc04]"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
              See all reviews on Trustpilot
              <svg
                className="h-3.5 w-3.5 text-[#5f6368]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * Compact Review Comparison for paywalls
 * Shows vly vs Bolt.new comparison with click to expand images
 */
export const ReviewComparisonCompact: React.FC = () => {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      {/* Lightbox Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110"
            >
              <svg
                className="h-4 w-4 text-[#1a1a1a]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <Image
              src={expandedImage}
              alt="Expanded review"
              width={800}
              height={600}
              className="h-auto max-h-[85vh] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-foreground">
          Verified reviews
        </h4>
        <p className="text-xs text-muted-foreground">
          Click to expand • Compare on Trustpilot
        </p>
      </div>

      {/* Freebuff Web vs Bolt.new comparison */}
      <div className="flex items-start gap-3">
        {/* Freebuff Web review */}
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-1.5">
            <Image
              src="/logo-icon.png"
              alt="Freebuff Web"
              width={14}
              height={14}
              className="h-3.5 w-3.5"
            />
            <span className="text-[10px] font-medium text-foreground">
              Verified Freebuff Web review
            </span>
          </div>
          <div
            onClick={() => setExpandedImage("/reviews/vly_review_1.png")}
            className="cursor-pointer overflow-hidden rounded-lg border border-border bg-white transition-all hover:shadow-md"
          >
            <Image
              src="/reviews/vly_review_1.png"
              alt="Freebuff Web review"
              width={200}
              height={150}
              className="h-auto w-full object-contain"
            />
          </div>
          <a
            href="https://www.trustpilot.com/review/freebuff.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[10px] text-muted-foreground hover:text-foreground"
          >
            Read more reviews →
          </a>
        </div>

        {/* VS divider */}
        <div className="flex flex-col items-center justify-center self-center">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
            <span className="text-[7px] font-bold text-muted-foreground">
              VS
            </span>
          </div>
        </div>

        {/* Bolt.new review */}
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-1.5">
            <Image
              src="/competitors/boltnew.png"
              alt="Bolt.new"
              width={40}
              height={14}
              className="h-3.5 w-auto opacity-70"
            />
            <span className="text-[10px] font-medium text-foreground">
              review
            </span>
          </div>
          <div
            onClick={() =>
              setExpandedImage("/competitors/bolt_review_main.png")
            }
            className="cursor-pointer overflow-hidden rounded-lg border border-border bg-white transition-all hover:shadow-md"
          >
            <Image
              src="/competitors/bolt_review_main.png"
              alt="Bolt.new review"
              width={200}
              height={150}
              className="h-auto w-full object-contain"
            />
          </div>
          <a
            href="https://www.trustpilot.com/review/bolt.new?stars=1"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[10px] text-muted-foreground hover:text-foreground"
          >
            Read more reviews →
          </a>
        </div>
      </div>
    </div>
  );
};
