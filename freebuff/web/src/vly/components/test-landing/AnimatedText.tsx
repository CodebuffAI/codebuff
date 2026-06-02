"use client";

import React from "react";

export interface AnimatedTextProps {
  text: string;
  baseDelay?: number;
  letterDelay?: number;
  className?: string;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  baseDelay = 0.5,
  letterDelay = 0.03,
  className = "",
}) => {
  return (
    <span className={className}>
      {text.split("").map((char, index) => (
        <span
          key={index}
          className="inline-block animate-letter-fade-in opacity-0"
          style={{
            animationDelay: `${baseDelay + index * letterDelay}s`,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </span>
  );
};
