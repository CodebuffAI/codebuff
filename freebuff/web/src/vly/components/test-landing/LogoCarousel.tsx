"use client";

import React from "react";
import Image from "next/image";

export interface Logo {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface LogoCarouselProps {
  logos: Logo[];
  className?: string;
}

export const LogoCarousel: React.FC<LogoCarouselProps> = ({
  logos,
  className = "",
}) => {
  return (
    <div
      className={`relative z-10 mx-auto w-[735px] max-w-[735px] overflow-hidden ${className}`}
    >
      <div
        className="relative"
        style={{
          maskImage:
            "linear-gradient(to right, rgba(0, 0, 0, 0), rgb(0, 0, 0) 80px, rgb(0, 0, 0) calc(100% - 80px), rgba(0, 0, 0, 0))",
        }}
      >
        <div
          className="flex animate-logo-scroll"
          style={{
            width: `${logos.length * 160 * 2}px`,
          }}
        >
          {/* First set of logos */}
          <div className="flex items-center gap-20 pr-20">
            {logos.map((logo, index) => (
              <div
                key={`first-${index}`}
                className="flex flex-shrink-0 items-center justify-center"
                style={{
                  width: logo.width ? `${logo.width}px` : "80px",
                  height: logo.height ? `${logo.height}px` : "32px",
                }}
              >
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={logo.width || 80}
                  height={logo.height || 32}
                  className="max-h-full object-contain grayscale-[0.4] transition-all hover:grayscale-0"
                />
              </div>
            ))}
          </div>

          {/* Duplicate set for seamless loop */}
          <div className="flex items-center gap-20 pr-20">
            {logos.map((logo, index) => (
              <div
                key={`second-${index}`}
                className="flex flex-shrink-0 items-center justify-center"
                style={{
                  width: logo.width ? `${logo.width}px` : "80px",
                  height: logo.height ? `${logo.height}px` : "32px",
                }}
              >
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={logo.width || 80}
                  height={logo.height || 32}
                  className="max-h-full object-contain grayscale-[0.4] transition-all hover:grayscale-0"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
