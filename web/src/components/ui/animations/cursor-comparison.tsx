"use client";

import { motion, useAnimation, Variants } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: number;
  time: string;
  title: string;
  description: string;
  metrics: {
    steps: number;
    timeSpent: string;
    quality: number;
  };
  tool: "codebuff" | "cursor";
}

const events: TimelineEvent[] = [
  {
    id: 1,
    time: "0:00",
    title: "Initial Setup",
    description: "Setting up the development environment",
    metrics: {
      steps: 1,
      timeSpent: "30s",
      quality: 100,
    },
    tool: "codebuff",
  },
  {
    id: 2,
    time: "0:30",
    title: "Project Analysis",
    description: "AI analyzing codebase structure",
    metrics: {
      steps: 2,
      timeSpent: "45s",
      quality: 95,
    },
    tool: "cursor",
  },
  {
    id: 3,
    time: "1:00",
    title: "Code Generation",
    description: "AI generating initial code suggestions",
    metrics: {
      steps: 3,
      timeSpent: "1m",
      quality: 90,
    },
    tool: "cursor",
  },
  {
    id: 4,
    time: "1:30",
    title: "Code Review",
    description: "Developer reviewing and accepting changes",
    metrics: {
      steps: 4,
      timeSpent: "45s",
      quality: 92,
    },
    tool: "codebuff",
  },
  {
    id: 5,
    time: "2:00",
    title: "Error Fixing",
    description: "Addressing compilation errors",
    metrics: {
      steps: 5,
      timeSpent: "1m",
      quality: 88,
    },
    tool: "cursor",
  },
  {
    id: 6,
    time: "2:30",
    title: "Final Review",
    description: "Final code review and testing",
    metrics: {
      steps: 6,
      timeSpent: "30s",
      quality: 98,
    },
    tool: "codebuff",
  }
];

const timelineVariants: Variants = {
  initial: {
    pathLength: 0,
    opacity: 0,
  },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: {
      duration: 2,
      ease: "easeInOut",
    },
  },
};

const movingDotVariants: Variants = {
  initial: { scale: 0, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: {
      duration: 0.3,
      delay: 0.5,
    },
  },
  hover: {
    scale: 1.2,
    transition: {
      duration: 0.2,
    },
  },
};

interface CursorComparisonProps {
  className?: string;
}

export function CursorComparison({ className }: CursorComparisonProps) {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent>(events[0]);
  const controls = useAnimation();

  return (
    <div className={cn("relative w-full h-[400px]", className)}>
      <svg
        className="w-full h-full"
        viewBox="0 0 800 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.path
          d="M 100 200 L 700 200"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          variants={timelineVariants}
          initial="initial"
          animate="animate"
          className="opacity-20"
        />

        <motion.path
          d="M 100 200 
             C 150 50, 200 350, 250 200
             S 300 50, 350 300
             S 400 100, 400 200
             S 450 300, 450 100
             S 500 250, 550 150
             S 600 300, 650 100
             S 700 250, 700 200"
          stroke="#FF6B6B"
          strokeWidth="2"
          strokeDasharray="4 4"
          variants={timelineVariants}
          initial="initial"
          animate="animate"
          className="opacity-20"
        />

        <motion.circle
          r="6"
          fill="#FF6B6B"
          variants={movingDotVariants}
          initial="initial"
          animate={{
            offsetDistance: "100%",
            transition: {
              duration: 3,
              repeat: Infinity,
              ease: "linear",
            },
          }}
          style={{
            offsetPath: "path('M 100 200 C 150 50, 200 350, 250 200 S 300 50, 350 300 S 400 100, 400 200 S 450 300, 450 100 S 500 250, 550 150 S 600 300, 650 100 S 700 250, 700 200')",
          }}
          className="opacity-75 drop-shadow-lg"
        />

        {events.map((event, index) => {
          const progress = index / (events.length - 1);
          const x = 100 + progress * 600;
          const y = 200;

          return (
            <motion.g key={event.id} transform={`translate(${x}, ${y})`}>
              <motion.circle
                r="8"
                fill={event.tool === "codebuff" ? "hsl(var(--primary))" : "#FF6B6B"}
                variants={movingDotVariants}
                initial="initial"
                animate="animate"
                whileHover="hover"
                className="cursor-pointer"
                onClick={() => setSelectedEvent(event)}
              />
            </motion.g>
          );
        })}
      </svg>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card p-4 rounded-lg shadow-lg w-80"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">{selectedEvent.title}</h3>
          <span className="text-sm text-muted-foreground">{selectedEvent.time}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-2">{selectedEvent.description}</p>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-muted-foreground">Steps</div>
            <div>{selectedEvent.metrics.steps}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Time</div>
            <div>{selectedEvent.metrics.timeSpent}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Quality</div>
            <div>{selectedEvent.metrics.quality}%</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
