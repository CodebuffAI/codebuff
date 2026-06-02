"use client";

import React from "react";
import Image from "next/image";
import { Play } from "lucide-react";

export interface VideoThumbnailProps {
  thumbnailSrc: string;
  thumbnailAlt?: string;
  onPlay?: () => void;
  playButtonText?: string;
  className?: string;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({
  thumbnailSrc,
  thumbnailAlt = "Video thumbnail",
  onPlay,
  playButtonText = "Watch Demo",
  className = "",
}) => {
  return (
    <div className={`relative ${className}`}>
      <Image
        src={thumbnailSrc}
        alt={thumbnailAlt}
        width={1278}
        height={719}
        className="h-auto w-[1278px] rounded-xl shadow-2xl"
      />

      <button
        aria-label="Play video"
        onClick={onPlay}
        className="absolute inset-0 flex items-center justify-center bg-transparent p-0"
      >
        <div className="group relative flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-[#1a1a1a] shadow-lg transition-all hover:shadow-xl">
          {/* Shine effect overlay */}
          <span
            className="absolute inset-0 rounded-full opacity-0 transition-opacity group-hover:animate-shine group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 35%, rgba(255, 255, 255, 0.8) 50%, rgba(0, 0, 0, 0) 65%, rgba(0, 0, 0, 0) 100%)",
              backgroundSize: "300% 100%",
            }}
          />

          <Play className="h-4 w-4" />
          {playButtonText}
        </div>
      </button>
    </div>
  );
};
