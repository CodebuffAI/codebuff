"use client";

import { useCallback } from "react";
import confetti from "canvas-confetti";

interface ConfettiOptions {
  particleCount?: number;
  angle?: number;
  spread?: number;
  startVelocity?: number;
  decay?: number;
  gravity?: number;
  drift?: number;
  flat?: boolean;
  ticks?: number;
  origin?: { x?: number; y?: number };
  colors?: string[];
  shapes?: ("square" | "circle" | "star")[];
  zIndex?: number;
  scalar?: number;
}

export function useConfetti() {
  const fireConfetti = useCallback((options: ConfettiOptions = {}) => {
    const defaults: ConfettiOptions = {
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: [
        "#26ccff",
        "#a25afd",
        "#ff5e7e",
        "#88ff5a",
        "#fcff42",
        "#ffa62d",
        "#ff36ff",
      ],
    };

    confetti({
      ...defaults,
      ...options,
    });
  }, []);

  const fireSuccess = useCallback(() => {
    fireConfetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"],
    });
  }, [fireConfetti]);

  const fireUpgrade = useCallback(() => {
    // Double burst for upgrade celebration
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      colors: ["#8b5cf6", "#a855f7", "#c084fc", "#d8b4fe", "#e9d5ff"],
    };

    fireConfetti({
      ...defaults,
      particleCount: count * 0.25,
      spread: 26,
      startVelocity: 55,
    });

    fireConfetti({
      ...defaults,
      particleCount: count * 0.2,
      spread: 60,
    });

    fireConfetti({
      ...defaults,
      particleCount: count * 0.35,
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
    });

    fireConfetti({
      ...defaults,
      particleCount: count * 0.1,
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });

    fireConfetti({
      ...defaults,
      particleCount: count * 0.1,
      spread: 120,
      startVelocity: 45,
    });
  }, [fireConfetti]);

  const firePurchase = useCallback(() => {
    fireConfetti({
      particleCount: 150,
      spread: 60,
      origin: { y: 0.6 },
      colors: ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a", "#fef3c7"],
    });
  }, [fireConfetti]);

  return {
    fireConfetti,
    fireSuccess,
    fireUpgrade,
    firePurchase,
  };
}
