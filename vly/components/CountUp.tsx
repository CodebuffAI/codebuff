import { useEffect, useState } from "react";

interface CountUpProps {
  end: number;
  duration?: number;
  formatter?: (value: number) => string;
  className?: string;
}

export function CountUp({
  end,
  duration = 2000,
  formatter = (n) => n.toLocaleString(),
  className = "",
}: CountUpProps) {
  const [count, setCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Prevent hydration mismatch by only showing content after mount
  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (end === 0) return;

    setIsAnimating(true);
    let startTime: number;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentCount = Math.floor(easeOutCubic * end);

      setCount(currentCount);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(end);
        setIsAnimating(false);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [end, duration]);

  // Prevent hydration mismatch by showing consistent content until mounted
  if (!hasMounted) {
    return (
      <span className={className}>{end === 0 ? "..." : formatter(0)}</span>
    );
  }

  return (
    <span className={className}>{end === 0 ? "..." : formatter(count)}</span>
  );
}
