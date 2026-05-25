"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

const VC_LOGOS = [
  { src: "/YCombinator.png", alt: "Y Combinator" },
  { src: "/vc_logo/goodwater.png", alt: "Goodwater" },
  { src: "/vc_logo/468.png", alt: "468 Capital" },
  { src: "/vc_logo/0ad.png", alt: "0AD" },
  { src: "/vc_logo/bluebrown.png", alt: "Blue Brown" },
  { src: "/vc_logo/olive.png", alt: "Olive" },
  { src: "/vc_logo/treeo.png", alt: "Treeo" },
];

export const VCLogosStack: React.FC = () => {
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

  // Slide in from right - instant transition
  const translateX = isVisible ? 0 : 150;

  return (
    <div
      className="fixed z-50 transition-transform duration-300 ease-out"
      style={{
        bottom: "40px",
        right: "25px",
        transform: `translateX(${translateX}px)`,
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <div className="flex flex-col items-end gap-1">
        {/* Title */}
        <h3 className="mb-2 whitespace-nowrap text-sm font-medium text-[rgba(26,26,26,0.85)]">
          Backed by top firms
        </h3>

        {/* Logo Stack - Compact */}
        <div className="flex flex-col items-end gap-1">
          {VC_LOGOS.map((logo) => (
            <div
              key={logo.src}
              className="relative flex h-[40px] w-[80px] origin-right items-center justify-center transition-transform duration-200 ease-out hover:scale-125"
            >
              <Image
                src={logo.src}
                alt={logo.alt}
                width={80}
                height={40}
                className="h-full w-full object-contain opacity-90"
              />
            </div>
          ))}
          {/* And many more text */}
          <div className="whitespace-nowrap text-[10px] font-medium text-[rgba(26,26,26,0.7)]">
            ...and many more
          </div>
        </div>
      </div>
    </div>
  );
};
