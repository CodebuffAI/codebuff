"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

interface ConfettiProps {
  active: boolean;
  onComplete?: () => void;
}

export function Confetti({ active, onComplete }: ConfettiProps) {
  useEffect(() => {
    if (active) {
      // Fire confetti multiple times with different patterns
      const fireConfetti = () => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      };

      // Initial burst
      fireConfetti();

      // Additional bursts
      const timer1 = setTimeout(fireConfetti, 300);
      const timer2 = setTimeout(fireConfetti, 600);

      // Call onComplete after animation
      const completeTimer = setTimeout(() => {
        onComplete?.();
      }, 3000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(completeTimer);
      };
    }
  }, [active, onComplete]);

  return null; // canvas-confetti renders directly to canvas
}
