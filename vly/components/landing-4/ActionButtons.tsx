"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
} from "@/components/auth/AuthComponents";
import { useRouter } from "next/navigation";

export function ActionButtons() {
  const router = useRouter();

  return (
    <div className="flex w-full flex-col items-center justify-center px-[5vw] md:px-[5vw]">
      {/* Action Buttons */}
      <div className="animate-fadeInSlideUpLate mb-16 mt-8 flex flex-col-reverse items-center justify-start gap-4 md:inline-flex md:flex-row md:gap-8">
        <button
          id="learn-more-btn"
          className="hover:bg-gradient-radial relative flex h-12 items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-white px-6 py-2.5 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent"
          style={{
            background: "rgba(255, 255, 255, 0.1)",
          }}
          onClick={() => {
            const element = document.getElementById("features");
            if (element) {
              element.scrollIntoView({ behavior: "smooth" });
            }
          }}
          onMouseEnter={(e) => {
            const shimmer = e.currentTarget.querySelector(
              "#learn-more-shimmer",
            ) as HTMLElement;
            if (shimmer) shimmer.style.transform = "translateX(100%)";
          }}
          onMouseLeave={(e) => {
            const shimmer = e.currentTarget.querySelector(
              "#learn-more-shimmer",
            ) as HTMLElement;
            if (shimmer) shimmer.style.transform = "translateX(-100%)";
          }}
        >
          <div
            id="learn-more-shimmer"
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out"
          ></div>
          <div className="justify-start font-['Geist'] text-base font-normal text-zinc-500">
            Learn More
          </div>
          <div className="relative flex h-6 w-6 items-center justify-center overflow-hidden">
            <svg
              className="h-4 w-4 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </button>
        <SignedOut>
          <SignInButton mode="modal" asChild>
            <button
              id="get-started-btn"
              className="hover:bg-gradient-radial relative flex h-12 items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-white px-6 py-2.5 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
              }}
              onMouseEnter={(e) => {
                const shimmer = e.currentTarget.querySelector(
                  "#get-started-shimmer",
                ) as HTMLElement;
                if (shimmer) shimmer.style.transform = "translateX(100%)";
              }}
              onMouseLeave={(e) => {
                const shimmer = e.currentTarget.querySelector(
                  "#get-started-shimmer",
                ) as HTMLElement;
                if (shimmer) shimmer.style.transform = "translateX(-100%)";
              }}
            >
              <div
                id="get-started-shimmer"
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out"
              ></div>
              <div className="justify-start font-['Geist'] text-base font-normal text-zinc-500">
                Get Started
              </div>
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <button
            id="see-projects-btn"
            className="hover:bg-gradient-radial relative flex h-12 items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-white px-6 py-2.5 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
            }}
            onClick={() => router.push("/dashboard")}
            onMouseEnter={(e) => {
              const shimmer = e.currentTarget.querySelector(
                "#see-projects-shimmer",
              ) as HTMLElement;
              if (shimmer) shimmer.style.transform = "translateX(100%)";
            }}
            onMouseLeave={(e) => {
              const shimmer = e.currentTarget.querySelector(
                "#see-projects-shimmer",
              ) as HTMLElement;
              if (shimmer) shimmer.style.transform = "translateX(-100%)";
            }}
          >
            <div
              id="see-projects-shimmer"
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out"
            ></div>
            <div className="justify-start font-['Geist'] text-base font-normal text-zinc-500">
              My Projects
            </div>
          </button>
        </SignedIn>
      </div>
    </div>
  );
}
