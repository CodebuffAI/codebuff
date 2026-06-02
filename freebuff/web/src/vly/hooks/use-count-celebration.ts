"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface CountCelebrationOptions {
  userCount?: number;
  projectCount?: number;
  enabled?: boolean;
}

export function useCountCelebration({
  userCount,
  projectCount,
  enabled = true,
}: CountCelebrationOptions) {
  const [showConfetti, setShowConfetti] = useState(false);
  const prevUserCount = useRef<number | undefined>(undefined);
  const prevProjectCount = useRef<number | undefined>(undefined);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Initialize previous values on first load
    if (!hasInitialized.current) {
      prevUserCount.current = userCount;
      prevProjectCount.current = projectCount;
      hasInitialized.current = true;
      return;
    }

    // Check for user count increase
    if (
      userCount !== undefined &&
      prevUserCount.current !== undefined &&
      userCount > prevUserCount.current
    ) {
      const newUsers = userCount - prevUserCount.current;
      toast.success(
        `🎉 ${newUsers} new ${newUsers === 1 ? "user" : "users"} joined!`,
        {
          duration: 4000,
        },
      );
      setShowConfetti(true);
    }

    // Check for project count increase
    if (
      projectCount !== undefined &&
      prevProjectCount.current !== undefined &&
      projectCount > prevProjectCount.current
    ) {
      const newProjects = projectCount - prevProjectCount.current;
      toast.success(
        `🚀 ${newProjects} new ${newProjects === 1 ? "project" : "projects"} created!`,
        {
          duration: 4000,
        },
      );
      setShowConfetti(true);
    }

    // Update previous values
    prevUserCount.current = userCount;
    prevProjectCount.current = projectCount;
  }, [userCount, projectCount, enabled]);

  const resetConfetti = () => setShowConfetti(false);

  return {
    showConfetti,
    resetConfetti,
  };
}
