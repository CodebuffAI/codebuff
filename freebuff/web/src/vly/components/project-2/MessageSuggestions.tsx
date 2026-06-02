import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

interface MessageSuggestionsProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
  isVisible: boolean;
}

export const MessageSuggestions: React.FC<MessageSuggestionsProps> = ({
  suggestions,
  onSuggestionClick,
  isVisible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Delay unmounting to allow exit animation
  useEffect(() => {
    if (isVisible) {
      // Async state update to avoid React 19 setState-in-effect warning
      const timer = setTimeout(() => setShouldRender(true), 0);
      return () => clearTimeout(timer);
    } else {
      // Delay unmounting by the duration of our exit animation
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 500); // Slightly longer than our longest exit animation (0.4s + 0.1s delay)

      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current) {
        const hasOverflow =
          containerRef.current.scrollWidth > containerRef.current.clientWidth;
        setShowFade(hasOverflow);
      }
    };

    checkOverflow();

    // Also listen for resize events
    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [suggestions, isVisible]); // Only recalculate when suggestions or visibility changes

  if (!suggestions || suggestions.length === 0 || !shouldRender) {
    return null;
  }

  const buttonVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        delay: i * 0.1,
        duration: 0.4,
        ease: [0, 0, 0.2, 1] as const,
      },
    }),
    exit: (i: number) => ({
      opacity: 0,
      y: 10,
      scale: 0.95,
      transition: {
        delay: (suggestions.length - 1 - i) * 0.05, // Reverse stagger for exit
        duration: 0.3,
        ease: [0.4, 0, 1, 1] as const,
      },
    }),
    tap: {
      scale: 0.98,
      transition: {
        duration: 0.1,
      },
    },
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20, height: 0 },
    visible: {
      opacity: 1,
      y: 0,
      height: "auto",
      transition: {
        duration: 0.5,
        ease: [0, 0, 0.2, 1] as const,
        height: { duration: 0.3, ease: [0, 0, 0.2, 1] as const },
      },
    },
    exit: {
      opacity: 0,
      y: 20,
      height: 0,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 1, 1] as const,
        delay: 0.1,
        height: { duration: 0.4, ease: [0.4, 0, 1, 1] as const, delay: 0.2 },
      },
    },
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="mx-4 mt-2 overflow-hidden"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Header - smaller and more subtle */}
          <motion.div
            className="mb-1.5 flex items-center gap-1.5"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Sparkles className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] font-medium text-zinc-500">
              Suggestions
            </span>
          </motion.div>

          {/* Suggestions - optimized sizing to fill space */}
          <div
            ref={containerRef}
            className="flex gap-1 overflow-x-auto scrollbar-hide"
          >
            {suggestions.map((suggestion, index) => {
              const isLast = index === suggestions.length - 1;
              const shouldShowFade = isLast && showFade;
              return (
                <motion.button
                  key={`${suggestion}-${index}`}
                  className="group relative flex flex-shrink-0 items-center rounded-md bg-white/60 px-2 py-1 text-[10px] font-medium text-zinc-700 shadow-sm transition-colors duration-150 hover:bg-purple-50/60 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
                  variants={buttonVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  whileTap="tap"
                  custom={index}
                  onClick={() => onSuggestionClick(suggestion)}
                  title={suggestion}
                >
                  <span className="relative whitespace-nowrap leading-none">
                    {suggestion}
                  </span>
                  {/* Fade-out overlay only when overflowing */}
                  {shouldShowFade && (
                    <div className="pointer-events-none absolute right-0 top-0 h-full w-8 rounded-r-md bg-gradient-to-l from-white/90 via-white/60 to-transparent transition-colors duration-150 group-hover:from-purple-50/90 group-hover:via-purple-50/60" />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Subtle fade line at bottom - thinner */}
          <motion.div
            className="mt-2 h-px bg-gradient-to-r from-transparent via-zinc-200/30 to-transparent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ scaleX: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
