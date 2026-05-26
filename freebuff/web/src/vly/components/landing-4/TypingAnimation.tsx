"use client";

import React, { useState, useRef, useEffect, memo, useMemo } from "react";

export const TypingAnimation = memo(() => {
  const suggestions = useMemo(
    () => [
      "make 3D multiplayer block game similar to Minecraft",
      "build a Slack-like realtime public messaging platform",
      "launch an ecommerce site for my business",
    ],
    [],
  );
  const [displayed, setDisplayed] = useState("");
  const [mounted, setMounted] = useState(false);

  // Use refs to avoid dependencies in effects
  const currentIndexRef = useRef(0);
  const animationRef = useRef<{ timeout?: NodeJS.Timeout; shouldRun: boolean }>(
    {
      shouldRun: false,
    },
  );

  // Single effect to handle mounting and animation
  useEffect(() => {
    setMounted(true);
    animationRef.current.shouldRun = true;

    const runAnimation = () => {
      if (!animationRef.current.shouldRun) return;

      const currentSuggestion = suggestions[currentIndexRef.current];
      let currentText = "";
      let charIndex = 0;

      const typeNextChar = () => {
        if (!animationRef.current.shouldRun) return;

        if (charIndex < currentSuggestion.length) {
          currentText = currentSuggestion.slice(0, charIndex + 1);
          setDisplayed(currentText);
          charIndex++;
          animationRef.current.timeout = setTimeout(typeNextChar, 60);
        } else {
          // Pause before next suggestion
          animationRef.current.timeout = setTimeout(() => {
            if (!animationRef.current.shouldRun) return;
            currentIndexRef.current =
              (currentIndexRef.current + 1) % suggestions.length;
            setDisplayed("");
            // Small delay before starting next word
            animationRef.current.timeout = setTimeout(runAnimation, 100);
          }, 1200);
        }
      };

      // Start typing after initial delay
      animationRef.current.timeout = setTimeout(typeNextChar, 500);
    };

    runAnimation();

    return () => {
      animationRef.current.shouldRun = false;
      if (animationRef.current.timeout) {
        clearTimeout(animationRef.current.timeout);
      }
    };
  }, []); // Empty dependency array - only run once

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) return <span>&nbsp;</span>;

  return displayed;
});

TypingAnimation.displayName = "TypingAnimation";
