import React from "react";
import { Check, X } from "lucide-react";
import Image from "next/image";

export default function ComparisonSection() {
  const vlyFeatures = [
    "Stunning, interactive websites that actually feel custom",
    "Secure by default. Authorization is baked in",
    "Built-in database",
    "Integrate with anything",
    "Visual editing with point-and-click control",
    "Fine tuned styling is simple and fast",
  ];

  const otherPlatformFeatures = [
    "Derivative, cookie-cutter websites",
    "Manual authorization setup",
    "You bring your own database",
    "Painful & difficult integrations",
    "Limited control and flexibility",
    "Frustrating to edit styles and colors precisely",
  ];

  return (
    <div
      id="competitive-analysis"
      className="mt-[7vh] animate-fade-in-up px-2 md:px-4"
    >
      <div className="mx-auto w-[90vw] md:w-[70vw]">
        <div className="flex flex-col items-start justify-start gap-7">
          <div className="flex w-full animate-fade-in-up flex-col items-start justify-start gap-3.5 [animation-delay:100ms]">
            <h2 className="font-serif text-3xl font-normal leading-normal text-black">
              Compared to <span className="text-[#7CFF3F]">other</span>{" "}
              platforms...
            </h2>
            <div className="mx-auto w-full">
              <div className="flex w-full items-start justify-between">
                <p className="text-lg font-normal leading-tight text-zinc-500">
                  There's a million vibe coders out there. But we're special,
                  because...
                </p>
                <div className="flex gap-4">
                  <ComparisonButton>
                    See detailed comparison doc
                  </ComparisonButton>
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col items-start justify-center gap-10">
            <div className="flex w-full flex-col items-center justify-center gap-4">
              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
                {/* Freebuff Web Column */}
                <div className="flex animate-fade-in-up flex-col items-start justify-start gap-3.5 rounded-[10px] bg-zinc-100 p-5 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-transform duration-200 [animation-delay:200ms] hover:scale-[1.02]">
                  <div className="flex w-full items-center justify-between">
                    <div className="flex flex-col items-start justify-start">
                      <div className="flex items-center gap-2">
                        <Image
                          src="/freebuff-logo.svg"
                          alt="vly"
                          width={24}
                          height={24}
                          className="h-6 w-6"
                        />
                        <h3 className="text-lg font-bold leading-7 text-black">
                          Freebuff Web
                        </h3>
                      </div>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-lime-100/60 outline outline-1 outline-offset-[-1px] outline-lime-600">
                      <Check className="h-6 w-6 text-lime-600" />
                    </div>
                  </div>
                  <div className="flex w-full flex-col items-start justify-start gap-2">
                    {vlyFeatures.map((feature, index) => (
                      <div
                        key={index}
                        className="flex w-full animate-fade-in-up items-center justify-start gap-2"
                        style={{ animationDelay: `${400 + index * 50}ms` }}
                      >
                        <Check className="h-4 w-4 flex-shrink-0 text-green-700" />
                        <div className="flex flex-col items-start justify-start">
                          <p className="text-base font-normal leading-tight text-black">
                            {feature}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Other Platforms Column */}
                <div className="flex animate-fade-in-up flex-col items-start justify-start gap-3.5 rounded-[10px] bg-zinc-100 p-5 outline outline-1 outline-offset-[-1px] outline-zinc-300 transition-transform duration-200 [animation-delay:300ms] hover:scale-[1.02]">
                  <div className="flex w-full items-center justify-between">
                    <div className="flex flex-col items-start justify-start">
                      <h3 className="text-lg font-bold leading-7 text-black">
                        Other platforms
                      </h3>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-200/60 outline outline-1 outline-offset-[-1px] outline-red-600">
                      <X className="h-6 w-6 text-red-600" />
                    </div>
                  </div>
                  <div className="flex w-full flex-col items-start justify-start gap-2">
                    {otherPlatformFeatures.map((feature, index) => (
                      <div
                        key={index}
                        className="flex w-full animate-fade-in-up items-center justify-start gap-2"
                        style={{ animationDelay: `${700 + index * 50}ms` }}
                      >
                        <X className="h-4 w-4 flex-shrink-0 text-red-700" />
                        <div className="flex flex-col items-start justify-start">
                          <p className="text-base font-normal leading-tight text-zinc-500">
                            {feature}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ComparisonButton with CSS-only tooltip
function ComparisonButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="group relative flex items-center justify-end">
      <div className="cursor-pointer select-none justify-start font-['Geist'] text-lg font-semibold leading-tight text-[#8A8A8A] transition-colors duration-200 hover:text-[#7CFF3F]">
        {children}
        <div className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white opacity-0 shadow transition-opacity duration-200 group-hover:opacity-100">
          Coming Soon
        </div>
      </div>
    </div>
  );
}
