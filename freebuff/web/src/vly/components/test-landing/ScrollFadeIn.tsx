"use client";

import React, { useEffect, useRef, useState } from "react";

interface ScrollFadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: 0 | 1 | 2 | 3;
  threshold?: number;
}

export function ScrollFadeIn({
  children,
  className = "",
  delay = 0,
  threshold = 0.1,
}: ScrollFadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -50px 0px",
      },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [threshold]);

  const delayClass = delay > 0 ? `scroll-fade-in-delay-${delay}` : "";

  return (
    <div
      ref={ref}
      className={`scroll-fade-in ${isVisible ? "is-visible" : ""} ${delayClass} ${className}`}
    >
      {children}
    </div>
  );
}
