"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Loader } from "lucide-react";

const THINKING_STAGES = {
  initial: {
    messages: [
      "Thinking...",
      "Analyzing...",
      "Processing...",
      "Understanding...",
    ],
    duration: 5000, // 5 seconds
  },
  deep: {
    messages: [
      "Thinking deeply...",
      "Analyzing complex patterns...",
      "Processing intricate details...",
      "Deep reasoning in progress...",
      "Carefully considering options...",
    ],
    duration: 5000, // 5 seconds (5-10 total)
  },
  advanced: {
    messages: [
      "Using high-end thinking model, this may take a while",
      "Advanced reasoning in progress...",
      "Leveraging sophisticated analysis...",
      "High-performance thinking engaged...",
      "Complex problem-solving mode active...",
    ],
    duration: null, // No time limit for final stage
  },
};

export const ThinkingState: React.FC = React.memo(() => {
  const [currentStage, setCurrentStage] =
    useState<keyof typeof THINKING_STAGES>("initial");
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1000);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Stage progression logic
    if (elapsedTime >= 10000 && currentStage !== "advanced") {
      setCurrentStage("advanced");
      setMessageIndex(0);
    } else if (elapsedTime >= 5000 && currentStage === "initial") {
      setCurrentStage("deep");
      setMessageIndex(0);
    }
  }, [elapsedTime, currentStage]);

  useEffect(() => {
    // Message rotation within current stage (but not for advanced stage)
    const stage = THINKING_STAGES[currentStage];
    if (stage.messages.length <= 1 || currentStage === "advanced") return;

    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % stage.messages.length);
    }, 2000); // Change message every 2 seconds

    return () => clearInterval(messageTimer);
  }, [currentStage]);

  const currentMessages = useMemo(
    () => THINKING_STAGES[currentStage].messages,
    [currentStage],
  );
  const currentMessage = useMemo(
    () => currentMessages[messageIndex],
    [currentMessages, messageIndex],
  );

  return (
    <div className="flex items-center space-x-2">
      <Loader className="h-3 w-3 animate-spin text-zinc-500" />
      <div className="text-xs leading-relaxed text-zinc-500 transition-opacity duration-300">
        {currentMessage}
      </div>
    </div>
  );
});

ThinkingState.displayName = "ThinkingState";
