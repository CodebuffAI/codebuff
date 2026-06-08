import React from "react";
import { themeMetadata, type ThemeMetadata } from "@/vly/lib/theme-metadata";

interface PreviewSceneProps {
  metadata: ThemeMetadata;
  isCompact: boolean;
}

function PreviewFrame({
  isCompact,
  className,
  style,
  children,
}: {
  isCompact: boolean;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute ${isCompact ? "inset-2" : "inset-3"} overflow-hidden ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function PreviewLine({
  className,
  style,
}: {
  className: string;
  style?: React.CSSProperties;
}) {
  return <div className={`rounded-full ${className}`} style={style} />;
}

function ChromeDots({
  colors,
  isCompact,
}: {
  colors: string[];
  isCompact: boolean;
}) {
  const dotSize = isCompact ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <div className="flex items-center gap-1">
      {colors.map((color, index) => (
        <div
          key={`${color}-${index}`}
          className={`${dotSize} rounded-full`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function PaletteRail({
  metadata,
  isCompact,
}: {
  metadata: ThemeMetadata;
  isCompact: boolean;
}) {
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 flex ${isCompact ? "h-1" : "h-1.5"}`}
    >
      <div
        className="flex-1"
        style={{ backgroundColor: metadata.colors.primary }}
      />
      <div
        className="flex-1"
        style={{ backgroundColor: metadata.colors.secondary }}
      />
      {metadata.colors.accent && (
        <div
          className="flex-1"
          style={{ backgroundColor: metadata.colors.accent }}
        />
      )}
    </div>
  );
}

function MinimalPreview({ metadata, isCompact }: PreviewSceneProps) {
  return (
    <>
      <div className="absolute inset-0 bg-white" />
      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[18px] border border-black/10 bg-white"
        style={{ boxShadow: metadata.shadowStyle }}
      >
        <div className="flex h-full flex-col">
          <div
            className={`flex items-center justify-between border-b border-black/10 ${isCompact ? "h-4 px-2" : "h-6 px-3"}`}
          >
            <ChromeDots
              colors={[
                "rgba(17,17,17,0.18)",
                "rgba(17,17,17,0.12)",
                "rgba(17,17,17,0.08)",
              ]}
              isCompact={isCompact}
            />
            <PreviewLine
              className={isCompact ? "h-1 w-10" : "h-1.5 w-16"}
              style={{ backgroundColor: "rgba(17, 17, 17, 0.12)" }}
            />
          </div>

          <div
            className={`grid flex-1 ${isCompact ? "grid-cols-[1.25fr_0.85fr] gap-2 p-2" : "grid-cols-[1.2fr_0.85fr] gap-3 p-3"}`}
          >
            <div className="flex flex-col justify-between">
              <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
                <PreviewLine
                  className={isCompact ? "h-1 w-3/4" : "h-1.5 w-3/4"}
                  style={{ backgroundColor: metadata.colors.text }}
                />
                <PreviewLine
                  className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                  style={{ backgroundColor: "rgba(17, 17, 17, 0.32)" }}
                />
                <PreviewLine
                  className={isCompact ? "h-1 w-2/5" : "h-1.5 w-2/5"}
                  style={{ backgroundColor: metadata.colors.primary }}
                />
              </div>

              <div
                className={`rounded-[12px] border border-black/10 bg-white ${isCompact ? "p-2" : "p-3"}`}
              >
                <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
                  <PreviewLine
                    className={isCompact ? "h-1 w-4/5" : "h-1.5 w-4/5"}
                    style={{ backgroundColor: "rgba(17, 17, 17, 0.2)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-3/5" : "h-1.5 w-3/5"}
                    style={{ backgroundColor: "rgba(17, 17, 17, 0.14)" }}
                  />
                </div>
                <div
                  className={
                    isCompact ? "mt-2 rounded-full" : "mt-3 rounded-full"
                  }
                  style={{
                    backgroundColor: metadata.colors.primary,
                    height: isCompact ? "6px" : "10px",
                    width: isCompact ? "28px" : "44px",
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div
                className={`rounded-[12px] border border-black/10 bg-[#FAFAFA] ${isCompact ? "p-2" : "p-3"}`}
              >
                <PreviewLine
                  className={isCompact ? "h-1 w-3/4" : "h-1.5 w-3/4"}
                  style={{ backgroundColor: "rgba(17, 17, 17, 0.2)" }}
                />
                <div
                  className={isCompact ? "mt-2 flex gap-1" : "mt-3 flex gap-1"}
                >
                  <div
                    className={
                      isCompact
                        ? "h-3 flex-1 rounded-full"
                        : "h-4 flex-1 rounded-full"
                    }
                    style={{ backgroundColor: metadata.colors.accent }}
                  />
                  <div
                    className={
                      isCompact
                        ? "h-3 w-4 rounded-full"
                        : "h-4 w-6 rounded-full"
                    }
                    style={{ backgroundColor: "rgba(17, 17, 17, 0.08)" }}
                  />
                </div>
              </div>

              <div
                className={`flex-1 rounded-[12px] border border-black/10 bg-white ${isCompact ? "p-2" : "p-3"}`}
              >
                <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
                  <PreviewLine
                    className={isCompact ? "h-1 w-full" : "h-1.5 w-full"}
                    style={{ backgroundColor: "rgba(17, 17, 17, 0.14)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-5/6" : "h-1.5 w-5/6"}
                    style={{ backgroundColor: "rgba(17, 17, 17, 0.12)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                    style={{ backgroundColor: metadata.colors.secondary }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function ModernPreview({ metadata, isCompact }: PreviewSceneProps) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: metadata.colors.background }}
      />
      <div
        className={`absolute rounded-full blur-3xl ${isCompact ? "-right-3 top-2 h-12 w-12" : "right-0 top-4 h-20 w-20"}`}
        style={{ backgroundColor: metadata.colors.primary, opacity: 0.22 }}
      />
      <div
        className={`absolute rounded-full blur-3xl ${isCompact ? "bottom-0 left-3 h-14 w-14" : "bottom-2 left-6 h-24 w-24"}`}
        style={{
          backgroundColor: metadata.colors.accent || metadata.colors.secondary,
          opacity: 0.18,
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[22px] border border-white/70 bg-white/80 backdrop-blur-sm"
        style={{ boxShadow: "0 22px 55px rgba(45, 107, 255, 0.18)" }}
      >
        <div className="flex h-full flex-col">
          <div
            className={`flex items-center gap-2 border-b border-slate-200/70 ${isCompact ? "h-4 px-2" : "h-6 px-3"}`}
          >
            <ChromeDots
              colors={[
                metadata.colors.primary,
                metadata.colors.secondary,
                metadata.colors.accent || metadata.colors.primary,
              ]}
              isCompact={isCompact}
            />
            <div className="ml-auto flex gap-1.5">
              <div
                className={
                  isCompact ? "h-2 w-4 rounded-full" : "h-3 w-7 rounded-full"
                }
                style={{ backgroundColor: "rgba(45, 107, 255, 0.16)" }}
              />
              <div
                className={
                  isCompact ? "h-2 w-3 rounded-full" : "h-3 w-5 rounded-full"
                }
                style={{ backgroundColor: "rgba(15, 23, 42, 0.08)" }}
              />
            </div>
          </div>

          <div
            className={`grid flex-1 ${isCompact ? "grid-cols-[1.15fr_0.85fr] gap-2 p-2" : "grid-cols-[1.1fr_0.85fr] gap-3 p-3"}`}
          >
            <div
              className={`rounded-[18px] border border-blue-100/80 bg-gradient-to-br from-white via-white to-blue-50 ${isCompact ? "p-2" : "p-3"}`}
              style={{ boxShadow: "0 12px 32px rgba(45, 107, 255, 0.08)" }}
            >
              <div className="flex items-center justify-between">
                <div
                  className={
                    isCompact ? "h-2 w-6 rounded-full" : "h-3 w-9 rounded-full"
                  }
                  style={{ backgroundColor: "rgba(45, 107, 255, 0.16)" }}
                />
                <div className="flex gap-1">
                  <div
                    className={
                      isCompact
                        ? "h-2 w-2 rounded-full"
                        : "h-3 w-3 rounded-full"
                    }
                    style={{ backgroundColor: metadata.colors.primary }}
                  />
                  <div
                    className={
                      isCompact
                        ? "h-2 w-2 rounded-full"
                        : "h-3 w-3 rounded-full"
                    }
                    style={{
                      backgroundColor:
                        metadata.colors.accent || metadata.colors.secondary,
                    }}
                  />
                </div>
              </div>

              <div
                className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
              >
                <PreviewLine
                  className={isCompact ? "h-1 w-4/5" : "h-1.5 w-4/5"}
                  style={{ backgroundColor: metadata.colors.text }}
                />
                <PreviewLine
                  className={isCompact ? "h-1 w-3/5" : "h-1.5 w-3/5"}
                  style={{ backgroundColor: "rgba(16, 33, 58, 0.4)" }}
                />
              </div>

              <div
                className={
                  isCompact
                    ? "mt-3 flex items-end gap-1"
                    : "mt-4 flex items-end gap-1"
                }
              >
                {[0.65, 0.38, 0.8, 0.52].map((height, index) => (
                  <div
                    key={height}
                    className={
                      isCompact ? "w-2 rounded-t-full" : "w-3 rounded-t-full"
                    }
                    style={{
                      height: `${height * (isCompact ? 12 : 18)}px`,
                      backgroundColor:
                        index % 2 === 0
                          ? metadata.colors.primary
                          : metadata.colors.secondary,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div
                className={`rounded-[16px] border border-slate-200 bg-white ${isCompact ? "p-2" : "p-3"}`}
              >
                <div className="flex items-center justify-between">
                  <PreviewLine
                    className={isCompact ? "h-1 w-8" : "h-1.5 w-12"}
                    style={{ backgroundColor: "rgba(16, 33, 58, 0.18)" }}
                  />
                  <div
                    className={
                      isCompact
                        ? "h-3 w-3 rounded-full"
                        : "h-4 w-4 rounded-full"
                    }
                    style={{
                      backgroundColor:
                        metadata.colors.accent || metadata.colors.primary,
                    }}
                  />
                </div>
                <div
                  className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
                >
                  <PreviewLine
                    className={isCompact ? "h-1 w-full" : "h-1.5 w-full"}
                    style={{ backgroundColor: "rgba(16, 33, 58, 0.14)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-3/4" : "h-1.5 w-3/4"}
                    style={{ backgroundColor: metadata.colors.secondary }}
                  />
                </div>
              </div>

              <div
                className={`flex-1 rounded-[16px] border border-slate-200 bg-white ${isCompact ? "p-2" : "p-3"}`}
              >
                <div className="flex gap-1">
                  <div
                    className={
                      isCompact
                        ? "h-8 flex-1 rounded-[10px]"
                        : "h-10 flex-1 rounded-[12px]"
                    }
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(45, 107, 255, 0.12), rgba(95, 210, 255, 0.28))",
                    }}
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <div
                      className={
                        isCompact ? "h-3 rounded-[10px]" : "h-4 rounded-[12px]"
                      }
                      style={{ backgroundColor: "rgba(45, 107, 255, 0.1)" }}
                    />
                    <div
                      className={
                        isCompact ? "h-4 rounded-[10px]" : "h-5 rounded-[12px]"
                      }
                      style={{ backgroundColor: "rgba(16, 33, 58, 0.08)" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function NeobrutalPreview({ metadata, isCompact }: PreviewSceneProps) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: metadata.colors.background }}
      />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(17,17,17,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,17,0.04) 1px, transparent 1px)",
          backgroundSize: isCompact ? "10px 10px" : "14px 14px",
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[6px] border-[3px] border-[#111111] bg-[#FFF8EF]"
        style={{
          boxShadow: isCompact ? "4px 4px 0 #111111" : "6px 6px 0 #111111",
        }}
      >
        <div className="flex h-full flex-col">
          <div
            className={`flex items-center justify-between border-b-[3px] border-[#111111] bg-[#111111] ${isCompact ? "h-4 px-2" : "h-6 px-3"}`}
          >
            <div className="flex items-center gap-1.5">
              <div
                className={
                  isCompact ? "h-2 w-5 bg-[#FFE76A]" : "h-3 w-7 bg-[#FFE76A]"
                }
              />
              <div
                className={
                  isCompact ? "h-2 w-8 bg-white/80" : "h-3 w-12 bg-white/80"
                }
              />
            </div>
            <div
              className={
                isCompact ? "h-2 w-2 bg-[#FF6B2C]" : "h-3 w-3 bg-[#FF6B2C]"
              }
            />
          </div>

          <div
            className={`grid flex-1 ${isCompact ? "grid-cols-[1.05fr_0.95fr] gap-2 p-2" : "grid-cols-[1.05fr_0.95fr] gap-3 p-3"}`}
          >
            <div className="flex flex-col gap-2">
              <div
                className={`flex-1 border-[3px] border-[#111111] bg-[#FF6B2C] ${isCompact ? "p-2" : "p-3"}`}
              >
                <div
                  className={
                    isCompact ? "h-1.5 w-8 bg-black/75" : "h-2 w-12 bg-black/75"
                  }
                />
                <div
                  className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
                >
                  <div
                    className={
                      isCompact ? "h-1.5 w-10 bg-white" : "h-2 w-14 bg-white"
                    }
                  />
                  <div
                    className={
                      isCompact
                        ? "h-1.5 w-8 bg-white/80"
                        : "h-2 w-10 bg-white/80"
                    }
                  />
                </div>
                <div
                  className={
                    isCompact
                      ? "mt-3 rounded-[2px] border-[3px] border-[#111111] bg-[#FFE76A]"
                      : "mt-4 rounded-[2px] border-[3px] border-[#111111] bg-[#FFE76A]"
                  }
                  style={{ height: isCompact ? "10px" : "14px" }}
                />
              </div>

              <div
                className={`border-[3px] border-[#111111] bg-black ${isCompact ? "p-2" : "p-3"}`}
              >
                <div
                  className={
                    isCompact ? "h-1.5 w-7 bg-white/80" : "h-2 w-10 bg-white/80"
                  }
                />
                <div
                  className={
                    isCompact
                      ? "mt-2 rounded-[2px] bg-[#FFE76A]"
                      : "mt-3 rounded-[2px] bg-[#FFE76A]"
                  }
                  style={{ height: isCompact ? "8px" : "10px", width: "42%" }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div
                className={`border-[3px] border-[#111111] bg-[#FFE76A] ${isCompact ? "p-2" : "p-3"}`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={
                      isCompact
                        ? "h-1.5 w-6 bg-black/75"
                        : "h-2 w-9 bg-black/75"
                    }
                  />
                  <div
                    className={
                      isCompact
                        ? "h-2 w-2 rounded-full bg-black"
                        : "h-3 w-3 rounded-full bg-black"
                    }
                  />
                </div>
                <div
                  className={
                    isCompact
                      ? "mt-2 rounded-[2px] bg-black"
                      : "mt-3 rounded-[2px] bg-black"
                  }
                  style={{ height: isCompact ? "10px" : "14px", width: "60%" }}
                />
              </div>

              <div
                className={`flex-1 border-[3px] border-[#111111] bg-white ${isCompact ? "p-2" : "p-3"}`}
              >
                <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
                  {["100%", "88%", "72%"].map((width) => (
                    <div
                      key={width}
                      className={
                        isCompact ? "h-1.5 bg-black/75" : "h-2 bg-black/75"
                      }
                      style={{ width }}
                    />
                  ))}
                </div>
                <div
                  className={
                    isCompact
                      ? "mt-2 rounded-[2px] border-[3px] border-[#111111] bg-[#FF6B2C]"
                      : "mt-3 rounded-[2px] border-[3px] border-[#111111] bg-[#FF6B2C]"
                  }
                  style={{ height: isCompact ? "8px" : "12px", width: "46%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function PaperyPreview({ metadata, isCompact }: PreviewSceneProps) {
  const serifStyle = { fontFamily: "'Playfair Display', serif" };

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "#F0EEE6" }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(47,36,26,0.05) 1px, transparent 1px), radial-gradient(circle at 1px 1px, rgba(47,36,26,0.05) 1px, transparent 0)",
          backgroundSize: isCompact
            ? "100% 10px, 10px 10px"
            : "100% 14px, 12px 12px",
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[10px] border border-[#D6CEC0] bg-[#F0EEE6]"
        style={{ boxShadow: metadata.shadowStyle }}
      >
        <div className="flex h-full flex-col">
          <div
            className={`border-b border-[#CFC5B5] ${isCompact ? "px-2 py-1.5" : "px-3 py-2"}`}
          >
            <div className="flex items-center justify-between">
              <PreviewLine
                className={isCompact ? "h-px w-6" : "h-px w-10"}
                style={{ backgroundColor: "rgba(47, 36, 26, 0.35)" }}
              />
              <span
                className={
                  isCompact
                    ? "text-[6px] uppercase tracking-[0.28em] text-[#2F241A]/80"
                    : "text-[8px] uppercase tracking-[0.32em] text-[#2F241A]/80"
                }
                style={serifStyle}
              >
                Morning Post
              </span>
              <PreviewLine
                className={isCompact ? "h-px w-6" : "h-px w-10"}
                style={{ backgroundColor: "rgba(47, 36, 26, 0.35)" }}
              />
            </div>
          </div>

          <div
            className={`grid flex-1 grid-cols-3 ${isCompact ? "gap-1.5 p-2" : "gap-2 p-3"}`}
          >
            <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
              <PreviewLine
                className={isCompact ? "h-1 w-4/5" : "h-1.5 w-4/5"}
                style={{ backgroundColor: metadata.colors.text }}
              />
              {["92%", "88%", "96%", "82%", "90%"].map((width) => (
                <div
                  key={width}
                  className={
                    isCompact
                      ? "h-0.5 rounded-full bg-[#6C6256]/55"
                      : "h-1 rounded-full bg-[#6C6256]/55"
                  }
                  style={{ width }}
                />
              ))}
            </div>

            <div className={isCompact ? "space-y-1.5" : "space-y-2"}>
              <div
                className={
                  isCompact
                    ? "h-8 rounded-sm border border-[#C9BEAD] bg-[#DDD2C1]"
                    : "h-12 rounded-sm border border-[#C9BEAD] bg-[#DDD2C1]"
                }
              />
              {["95%", "86%", "78%"].map((width) => (
                <div
                  key={width}
                  className={
                    isCompact
                      ? "h-0.5 rounded-full bg-[#6C6256]/55"
                      : "h-1 rounded-full bg-[#6C6256]/55"
                  }
                  style={{ width }}
                />
              ))}
            </div>

            <div
              className={`border-l border-[#CFC5B5] ${isCompact ? "pl-1.5" : "pl-2"}`}
            >
              <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
                <div
                  className={
                    isCompact
                      ? "text-[6px] uppercase tracking-[0.2em] text-[#B04A2B]"
                      : "text-[8px] uppercase tracking-[0.24em] text-[#B04A2B]"
                  }
                  style={serifStyle}
                >
                  Briefing
                </div>
                {["88%", "100%", "76%", "82%"].map((width) => (
                  <div
                    key={width}
                    className={
                      isCompact
                        ? "h-0.5 rounded-full bg-[#6C6256]/55"
                        : "h-1 rounded-full bg-[#6C6256]/55"
                    }
                    style={{ width }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function NotebookPreview({ metadata, isCompact }: PreviewSceneProps) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: metadata.colors.background }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, transparent 0, transparent 9px, rgba(29,78,216,0.12) 9px, rgba(29,78,216,0.12) 10px)",
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[18px] border border-[#D8D2C5] bg-[#FCFAF3]"
        style={{ boxShadow: metadata.shadowStyle }}
      >
        <div
          className="absolute bottom-0 top-0"
          style={{
            left: isCompact ? "18px" : "24px",
            width: "1px",
            backgroundColor: metadata.colors.secondary,
          }}
        />

        <div
          className={`absolute ${isCompact ? "left-1.5 top-2 space-y-1.5" : "left-2 top-3 space-y-2"}`}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className={
                isCompact
                  ? "h-1.5 w-1.5 rounded-full border border-[#C9C1B2] bg-white"
                  : "h-2 w-2 rounded-full border border-[#C9C1B2] bg-white"
              }
            />
          ))}
        </div>

        <div
          className={`grid h-full ${isCompact ? "grid-cols-[1.2fr_0.8fr] gap-2 p-2 pl-5" : "grid-cols-[1.15fr_0.85fr] gap-3 p-3 pl-6"}`}
        >
          <div className="flex flex-col justify-between">
            <div>
              <PreviewLine
                className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                style={{ backgroundColor: metadata.colors.text }}
              />
              <div
                className={isCompact ? "mt-2 space-y-1.5" : "mt-3 space-y-2"}
              >
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <div
                      className={
                        isCompact
                          ? "h-2 w-2 rounded-[3px] border"
                          : "h-3 w-3 rounded-[4px] border"
                      }
                      style={{ borderColor: metadata.colors.primary }}
                    />
                    <PreviewLine
                      className={isCompact ? "h-0.5 flex-1" : "h-1 flex-1"}
                      style={{
                        backgroundColor:
                          index === 2
                            ? metadata.colors.accent
                            : "rgba(45, 42, 36, 0.45)",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`rounded-[12px] border border-[#E0D8C9] bg-white/70 ${isCompact ? "p-2" : "p-3"}`}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className={
                    isCompact ? "h-2 w-2 rounded-full" : "h-3 w-3 rounded-full"
                  }
                  style={{ backgroundColor: metadata.colors.accent }}
                />
                <PreviewLine
                  className={isCompact ? "h-0.5 w-2/3" : "h-1 w-2/3"}
                  style={{ backgroundColor: "rgba(45, 42, 36, 0.35)" }}
                />
              </div>
            </div>
          </div>

          <div
            className={`relative rounded-[14px] border border-[#D7C79A] bg-[#F8E08E]/85 ${isCompact ? "p-2" : "p-3"}`}
            style={{
              transform: "rotate(-4deg)",
              boxShadow: "0 10px 20px rgba(76, 62, 33, 0.12)",
            }}
          >
            <div
              className="absolute rounded-full bg-white/70"
              style={{
                top: isCompact ? "4px" : "6px",
                left: "50%",
                width: isCompact ? "18px" : "24px",
                height: isCompact ? "4px" : "6px",
                transform: "translateX(-50%)",
              }}
            />
            <div
              className={isCompact ? "mt-1.5 space-y-1" : "mt-2 space-y-1.5"}
            >
              <PreviewLine
                className={isCompact ? "h-1 w-4/5" : "h-1.5 w-4/5"}
                style={{ backgroundColor: "rgba(60, 47, 20, 0.55)" }}
              />
              <PreviewLine
                className={isCompact ? "h-1 w-full" : "h-1.5 w-full"}
                style={{ backgroundColor: "rgba(60, 47, 20, 0.36)" }}
              />
              <PreviewLine
                className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                style={{ backgroundColor: "rgba(60, 47, 20, 0.3)" }}
              />
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function StudioPreview({ metadata, isCompact }: PreviewSceneProps) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: metadata.colors.background }}
      />
      <div
        className="absolute inset-y-0 right-0 w-1/3"
        style={{ backgroundColor: "rgba(214, 191, 163, 0.14)" }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[20px] border border-slate-200 bg-white"
        style={{ boxShadow: metadata.shadowStyle }}
      >
        <div className="flex h-full flex-col">
          <div
            className={`flex items-center justify-between border-b border-slate-200 ${isCompact ? "h-4 px-2" : "h-6 px-3"}`}
          >
            <PreviewLine
              className={isCompact ? "h-1 w-8" : "h-1.5 w-12"}
              style={{ backgroundColor: "rgba(17, 24, 39, 0.12)" }}
            />
            <div className="flex gap-1.5">
              <div
                className={
                  isCompact ? "h-2 w-5 rounded-full" : "h-3 w-7 rounded-full"
                }
                style={{ backgroundColor: "rgba(214, 191, 163, 0.45)" }}
              />
              <div
                className={
                  isCompact ? "h-2 w-3 rounded-full" : "h-3 w-5 rounded-full"
                }
                style={{ backgroundColor: "rgba(17, 24, 39, 0.08)" }}
              />
            </div>
          </div>

          <div
            className={`grid flex-1 ${isCompact ? "grid-cols-[1.15fr_0.85fr] gap-2 p-2" : "grid-cols-[1.1fr_0.9fr] gap-3 p-3"}`}
          >
            <div
              className={`rounded-[18px] border border-stone-200 bg-[#FAF8F3] ${isCompact ? "p-2" : "p-3"}`}
            >
              <div
                className={`flex items-center justify-center rounded-[14px] border border-[#E7DED1] bg-[#EADBC7]/50 ${isCompact ? "h-10" : "h-14"}`}
              >
                <div
                  className={
                    isCompact
                      ? "h-4 w-4 rounded-full border border-[#BFA98C]"
                      : "h-6 w-6 rounded-full border border-[#BFA98C]"
                  }
                />
              </div>
              <div
                className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
              >
                <PreviewLine
                  className={isCompact ? "h-1 w-3/4" : "h-1.5 w-3/4"}
                  style={{ backgroundColor: metadata.colors.text }}
                />
                <PreviewLine
                  className={isCompact ? "h-1 w-1/2" : "h-1.5 w-1/2"}
                  style={{ backgroundColor: "rgba(17, 24, 39, 0.32)" }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div>
                <PreviewLine
                  className={isCompact ? "h-1 w-5/6" : "h-1.5 w-5/6"}
                  style={{ backgroundColor: metadata.colors.text }}
                />
                <div
                  className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
                >
                  <PreviewLine
                    className={isCompact ? "h-1 w-full" : "h-1.5 w-full"}
                    style={{ backgroundColor: "rgba(17, 24, 39, 0.16)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-3/4" : "h-1.5 w-3/4"}
                    style={{ backgroundColor: "rgba(17, 24, 39, 0.12)" }}
                  />
                </div>
              </div>

              <div
                className={`rounded-[16px] border border-stone-200 bg-white ${isCompact ? "p-2" : "p-3"}`}
              >
                <div
                  className={
                    isCompact
                      ? "h-5 rounded-[12px] bg-[#EADBC7]/55"
                      : "h-8 rounded-[14px] bg-[#EADBC7]/55"
                  }
                />
              </div>

              <div className="grid flex-1 grid-cols-2 gap-2">
                <div
                  className="rounded-[14px] border border-stone-200 bg-white"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.82)" }}
                />
                <div
                  className="rounded-[14px] border border-stone-200"
                  style={{ backgroundColor: "rgba(214, 191, 163, 0.28)" }}
                />
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function ClayPreview({ metadata, isCompact }: PreviewSceneProps) {
  const clayShadow =
    "12px 12px 24px rgba(214, 156, 138, 0.24), -10px -10px 24px rgba(255, 255, 255, 0.7)";

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: metadata.colors.background }}
      />
      <div
        className={`absolute rounded-full blur-3xl ${isCompact ? "-left-2 top-4 h-14 w-14" : "-left-2 top-6 h-24 w-24"}`}
        style={{ backgroundColor: metadata.colors.primary, opacity: 0.22 }}
      />
      <div
        className={`absolute rounded-full blur-3xl ${isCompact ? "right-0 top-0 h-16 w-16" : "right-1 top-2 h-24 w-24"}`}
        style={{
          backgroundColor: metadata.colors.accent || metadata.colors.secondary,
          opacity: 0.18,
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[26px] border border-white/50 bg-[#F9EADF]/85 backdrop-blur-sm"
        style={{ boxShadow: clayShadow }}
      >
        <div
          className={`grid h-full ${isCompact ? "grid-cols-[1.1fr_0.9fr] gap-2 p-2" : "grid-cols-[1.1fr_0.9fr] gap-3 p-3"}`}
        >
          <div
            className={`rounded-[22px] bg-[#FCEDE5] ${isCompact ? "p-2" : "p-3"}`}
            style={{ boxShadow: clayShadow }}
          >
            <div className="flex items-center gap-2">
              <div
                className={
                  isCompact ? "h-5 w-5 rounded-full" : "h-7 w-7 rounded-full"
                }
                style={{ backgroundColor: metadata.colors.primary }}
              />
              <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
                <PreviewLine
                  className={isCompact ? "h-1 w-8" : "h-1.5 w-12"}
                  style={{ backgroundColor: metadata.colors.text }}
                />
                <PreviewLine
                  className={isCompact ? "h-1 w-6" : "h-1.5 w-8"}
                  style={{ backgroundColor: "rgba(92, 70, 103, 0.32)" }}
                />
              </div>
            </div>

            <div className={isCompact ? "mt-3 space-y-1.5" : "mt-4 space-y-2"}>
              <div
                className={
                  isCompact ? "h-6 rounded-[14px]" : "h-8 rounded-[16px]"
                }
                style={{
                  background:
                    "linear-gradient(135deg, rgba(242,142,107,0.26), rgba(247,199,183,0.78))",
                }}
              />
              <div className="flex gap-2">
                <div
                  className={
                    isCompact
                      ? "h-4 flex-1 rounded-full"
                      : "h-5 flex-1 rounded-full"
                  }
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.7)" }}
                />
                <div
                  className={
                    isCompact ? "h-4 w-6 rounded-full" : "h-5 w-8 rounded-full"
                  }
                  style={{ backgroundColor: "rgba(140, 115, 255, 0.24)" }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div
              className={`rounded-[20px] bg-[#F6EEFF]/90 ${isCompact ? "h-10 p-2" : "h-14 p-3"}`}
              style={{ boxShadow: clayShadow }}
            >
              <PreviewLine
                className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                style={{ backgroundColor: metadata.colors.accent }}
              />
            </div>
            <div
              className="flex-1 rounded-[22px]"
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.75), rgba(247,199,183,0.72))",
                boxShadow: clayShadow,
              }}
            >
              <div className={isCompact ? "p-2" : "p-3"}>
                <div className="flex items-end gap-1">
                  {[0.45, 0.7, 0.55].map((height, index) => (
                    <div
                      key={height}
                      className={
                        isCompact ? "w-2 rounded-full" : "w-3 rounded-full"
                      }
                      style={{
                        height: `${height * (isCompact ? 16 : 24)}px`,
                        backgroundColor:
                          index === 1
                            ? metadata.colors.accent
                            : metadata.colors.primary,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function VintagePreview({ metadata, isCompact }: PreviewSceneProps) {
  const serifStyle = { fontFamily: "'Playfair Display', serif" };

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: metadata.colors.background }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(108,76,44,0.08) 1px, transparent 0)",
          backgroundSize: isCompact ? "8px 8px" : "10px 10px",
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[18px] border border-[#A58966] bg-[#E7D8BF]"
        style={{ boxShadow: metadata.shadowStyle }}
      >
        <div
          className={`absolute ${isCompact ? "inset-1.5" : "inset-2"} rounded-[14px] border border-[#B79A74]`}
        />

        <div className="relative flex h-full flex-col">
          <div
            className={`flex items-center justify-between ${isCompact ? "px-2 pb-1 pt-2" : "px-3 pb-1.5 pt-3"}`}
          >
            <span
              className={
                isCompact
                  ? "text-[6px] uppercase tracking-[0.24em] text-[#6C4C2C]"
                  : "text-[8px] uppercase tracking-[0.28em] text-[#6C4C2C]"
              }
              style={serifStyle}
            >
              Archive
            </span>
            <div
              className={
                isCompact
                  ? "flex h-4 w-4 items-center justify-center rounded-full border border-[#8F2D2D] text-[5px] text-[#8F2D2D]"
                  : "flex h-5 w-5 items-center justify-center rounded-full border border-[#8F2D2D] text-[6px] text-[#8F2D2D]"
              }
              style={serifStyle}
            >
              19
            </div>
          </div>

          <div
            className={`grid flex-1 ${isCompact ? "grid-cols-[1.05fr_0.95fr] gap-2 px-2 pb-2" : "grid-cols-[1.05fr_0.95fr] gap-3 px-3 pb-3"}`}
          >
            <div
              className={`rounded-[14px] border border-[#B79A74] bg-[#EFE4D0]/70 ${isCompact ? "p-2" : "p-3"}`}
              style={{ borderStyle: "dashed" }}
            >
              <div
                className={
                  isCompact
                    ? "h-6 rounded-[10px] bg-[#D6C3A3]/60"
                    : "h-9 rounded-[12px] bg-[#D6C3A3]/60"
                }
              />
              <div
                className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
              >
                <PreviewLine
                  className={isCompact ? "h-1 w-3/4" : "h-1.5 w-3/4"}
                  style={{ backgroundColor: metadata.colors.text }}
                />
                <PreviewLine
                  className={isCompact ? "h-1 w-1/2" : "h-1.5 w-1/2"}
                  style={{ backgroundColor: "rgba(58, 40, 22, 0.38)" }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div
                className={`rounded-[14px] border border-[#B79A74] bg-[#F2E8D7]/75 ${isCompact ? "p-2" : "p-3"}`}
              >
                <PreviewLine
                  className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                  style={{ backgroundColor: metadata.colors.accent }}
                />
                <div
                  className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
                >
                  <PreviewLine
                    className={isCompact ? "h-1 w-full" : "h-1.5 w-full"}
                    style={{ backgroundColor: "rgba(58, 40, 22, 0.2)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-4/5" : "h-1.5 w-4/5"}
                    style={{ backgroundColor: "rgba(58, 40, 22, 0.14)" }}
                  />
                </div>
              </div>

              <div
                className="flex-1 rounded-[14px] border border-[#B79A74]"
                style={{ backgroundColor: "rgba(239, 228, 208, 0.58)" }}
              >
                <div className={isCompact ? "p-2" : "p-3"}>
                  <div
                    className={
                      isCompact
                        ? "h-3 w-10 rounded-full border border-[#8F2D2D]/50"
                        : "h-4 w-14 rounded-full border border-[#8F2D2D]/50"
                    }
                    style={{ backgroundColor: "rgba(143, 45, 45, 0.08)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function GlassPreview({ metadata, isCompact }: PreviewSceneProps) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: metadata.colors.background }}
      />
      <div
        className={`absolute rounded-full blur-3xl ${isCompact ? "left-2 top-3 h-14 w-14" : "left-6 top-6 h-24 w-24"}`}
        style={{ backgroundColor: metadata.colors.primary, opacity: 0.38 }}
      />
      <div
        className={`absolute rounded-full blur-3xl ${isCompact ? "bottom-0 right-0 h-16 w-16" : "bottom-2 right-4 h-24 w-24"}`}
        style={{
          backgroundColor: metadata.colors.accent || metadata.colors.secondary,
          opacity: 0.24,
        }}
      />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: isCompact ? "20px 20px" : "28px 28px",
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[24px] border border-white/20 bg-white/10 backdrop-blur-xl"
        style={{ boxShadow: "0 22px 56px rgba(15, 23, 42, 0.35)" }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-white/30" />

        <div className="flex h-full flex-col">
          <div
            className={`flex items-center justify-between border-b border-white/15 ${isCompact ? "h-4 px-2" : "h-6 px-3"}`}
          >
            <ChromeDots
              colors={[
                "rgba(255,255,255,0.55)",
                "rgba(255,255,255,0.38)",
                "rgba(255,255,255,0.22)",
              ]}
              isCompact={isCompact}
            />
            <div className="flex gap-1.5">
              <div
                className={
                  isCompact
                    ? "h-2 w-4 rounded-full bg-white/20"
                    : "h-3 w-7 rounded-full bg-white/20"
                }
              />
              <div
                className={
                  isCompact
                    ? "bg-white/12 h-2 w-3 rounded-full"
                    : "bg-white/12 h-3 w-5 rounded-full"
                }
              />
            </div>
          </div>

          <div
            className={`grid flex-1 ${isCompact ? "grid-cols-[1.12fr_0.88fr] gap-2 p-2" : "grid-cols-[1.08fr_0.92fr] gap-3 p-3"}`}
          >
            <div
              className={`bg-white/14 rounded-[20px] border border-white/20 backdrop-blur-xl ${isCompact ? "p-2" : "p-3"}`}
              style={{
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className={
                    isCompact
                      ? "h-2 w-6 rounded-full bg-white/20"
                      : "h-3 w-10 rounded-full bg-white/20"
                  }
                />
                <div
                  className={
                    isCompact ? "h-2 w-2 rounded-full" : "h-3 w-3 rounded-full"
                  }
                  style={{ backgroundColor: metadata.colors.primary }}
                />
              </div>

              <div
                className={isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"}
              >
                <PreviewLine
                  className={isCompact ? "h-1 w-4/5" : "h-1.5 w-4/5"}
                  style={{ backgroundColor: "rgba(248, 250, 252, 0.9)" }}
                />
                <PreviewLine
                  className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                  style={{ backgroundColor: "rgba(248, 250, 252, 0.48)" }}
                />
              </div>

              <div
                className={
                  isCompact ? "mt-3 flex gap-1.5" : "mt-4 flex gap-1.5"
                }
              >
                {[
                  metadata.colors.primary,
                  metadata.colors.secondary,
                  metadata.colors.accent || metadata.colors.primary,
                ].map((color) => (
                  <div
                    key={color}
                    className={
                      isCompact
                        ? "h-4 flex-1 rounded-full"
                        : "h-5 flex-1 rounded-full"
                    }
                    style={{ backgroundColor: `${color}50` }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {[0.75, 1].map((opacity, index) => (
                <div
                  key={opacity}
                  className={`border-white/18 bg-white/12 rounded-[18px] border backdrop-blur-xl ${index === 0 ? (isCompact ? "p-2" : "p-3") : isCompact ? "flex-1 p-2" : "flex-1 p-3"}`}
                  style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)" }}
                >
                  <PreviewLine
                    className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                    style={{
                      backgroundColor: `rgba(248, 250, 252, ${opacity})`,
                    }}
                  />
                  <div
                    className={
                      isCompact ? "mt-2 space-y-1" : "mt-3 space-y-1.5"
                    }
                  >
                    <PreviewLine
                      className={isCompact ? "h-1 w-full" : "h-1.5 w-full"}
                      style={{
                        backgroundColor: `rgba(248, 250, 252, ${opacity * 0.5})`,
                      }}
                    />
                    <PreviewLine
                      className={isCompact ? "h-1 w-3/4" : "h-1.5 w-3/4"}
                      style={{
                        backgroundColor: `rgba(248, 250, 252, ${opacity * 0.35})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function TerminalPreview({ metadata, isCompact }: PreviewSceneProps) {
  const monoStyle = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: metadata.colors.background }}
      />
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(124,255,155,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(49,208,170,0.05) 1px, transparent 1px)",
          backgroundSize: "100% 4px, 10px 100%",
        }}
      />

      <PreviewFrame
        isCompact={isCompact}
        className="rounded-[16px] border border-[#14311F] bg-[#0B1510]"
        style={{ boxShadow: metadata.shadowStyle }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-[#7CFF9B]/20" />

        <div className="flex h-full flex-col">
          <div
            className={`flex items-center gap-2 border-b border-[#14311F] ${isCompact ? "h-4 px-2" : "h-6 px-3"}`}
          >
            <ChromeDots
              colors={[
                "#8F4B4B",
                metadata.colors.accent || "#F9D66B",
                metadata.colors.primary,
              ]}
              isCompact={isCompact}
            />
            <span
              className={
                isCompact
                  ? "text-[6px] uppercase tracking-[0.3em] text-[#7CFF9B]/70"
                  : "text-[8px] uppercase tracking-[0.34em] text-[#7CFF9B]/70"
              }
              style={monoStyle}
            >
              shell
            </span>
            <div className="ml-auto h-px w-12 bg-[#7CFF9B]/25" />
          </div>

          <div
            className={`grid flex-1 ${isCompact ? "grid-cols-[1.15fr_0.85fr] gap-2 p-2" : "grid-cols-[1.1fr_0.9fr] gap-3 p-3"}`}
          >
            <div
              className={`rounded-[12px] border border-[#163421] bg-black/20 ${isCompact ? "p-2" : "p-3"}`}
            >
              <div className={isCompact ? "space-y-1.5" : "space-y-2"}>
                {["$ init project", "$ deploy --prod", "$ tail logs"].map(
                  (command, index) => (
                    <div key={command} className="flex items-center gap-1.5">
                      <span
                        className={
                          isCompact
                            ? "text-[6px] text-[#31D0AA]"
                            : "text-[8px] text-[#31D0AA]"
                        }
                        style={monoStyle}
                      >
                        &gt;
                      </span>
                      <span
                        className={
                          isCompact
                            ? `text-[6px] ${index === 1 ? "text-[#F9D66B]" : "text-[#C9FFD6]/85"}`
                            : `text-[8px] ${index === 1 ? "text-[#F9D66B]" : "text-[#C9FFD6]/85"}`
                        }
                        style={monoStyle}
                      >
                        {command}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div
                className={`rounded-[12px] border border-[#163421] bg-black/20 ${isCompact ? "p-2" : "p-3"}`}
              >
                <PreviewLine
                  className={isCompact ? "h-1 w-2/3" : "h-1.5 w-2/3"}
                  style={{ backgroundColor: "rgba(124, 255, 155, 0.65)" }}
                />
                <div
                  className={
                    isCompact
                      ? "mt-2 flex items-end gap-1"
                      : "mt-3 flex items-end gap-1"
                  }
                >
                  {[0.4, 0.7, 0.55].map((height, index) => (
                    <div
                      key={height}
                      className={
                        isCompact ? "w-2 rounded-t-sm" : "w-3 rounded-t-sm"
                      }
                      style={{
                        height: `${height * (isCompact ? 14 : 20)}px`,
                        backgroundColor:
                          index === 1
                            ? metadata.colors.accent ||
                              metadata.colors.secondary
                            : metadata.colors.primary,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div
                className={`flex-1 rounded-[12px] border border-[#163421] bg-black/20 ${isCompact ? "p-2" : "p-3"}`}
              >
                <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
                  <PreviewLine
                    className={isCompact ? "h-1 w-full" : "h-1.5 w-full"}
                    style={{ backgroundColor: "rgba(201, 255, 214, 0.3)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-4/5" : "h-1.5 w-4/5"}
                    style={{ backgroundColor: "rgba(201, 255, 214, 0.18)" }}
                  />
                  <PreviewLine
                    className={isCompact ? "h-1 w-3/5" : "h-1.5 w-3/5"}
                    style={{ backgroundColor: "rgba(49, 208, 170, 0.36)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </PreviewFrame>
    </>
  );
}

function renderPreviewScene({
  metadata,
  isCompact,
}: PreviewSceneProps): React.ReactNode {
  switch (metadata.previewStyle) {
    case "minimal":
      return <MinimalPreview metadata={metadata} isCompact={isCompact} />;
    case "modern":
      return <ModernPreview metadata={metadata} isCompact={isCompact} />;
    case "neobrutal":
      return <NeobrutalPreview metadata={metadata} isCompact={isCompact} />;
    case "papery":
      return <PaperyPreview metadata={metadata} isCompact={isCompact} />;
    case "notebook":
      return <NotebookPreview metadata={metadata} isCompact={isCompact} />;
    case "studio":
      return <StudioPreview metadata={metadata} isCompact={isCompact} />;
    case "clay":
      return <ClayPreview metadata={metadata} isCompact={isCompact} />;
    case "vintage":
      return <VintagePreview metadata={metadata} isCompact={isCompact} />;
    case "glass":
      return <GlassPreview metadata={metadata} isCompact={isCompact} />;
    case "terminal":
      return <TerminalPreview metadata={metadata} isCompact={isCompact} />;
    default:
      return null;
  }
}

export function ThemePreview({
  theme,
  isHovered,
  size = "large",
}: {
  theme: string;
  isHovered?: boolean;
  size?: "large" | "compact";
}) {
  const metadata = themeMetadata[theme as keyof typeof themeMetadata];

  if (!metadata) {
    return null;
  }

  const isCompact = size === "compact";

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${isCompact ? "rounded-xl" : "rounded-[20px]"}`}
    >
      <div
        className="absolute inset-0"
        style={{ background: metadata.colors.background }}
      />
      {renderPreviewScene({ metadata, isCompact })}
      <PaletteRail metadata={metadata} isCompact={isCompact} />
      {isHovered && (
        <div className="bg-white/6 absolute inset-0 mix-blend-screen" />
      )}
    </div>
  );
}

export function ThemeCard({
  theme,
  isSelected,
  isSubmitting,
  isHovered,
  size = "large",
  onSelect,
  onHover,
}: {
  theme: string;
  isSelected?: boolean;
  isSubmitting?: boolean;
  isHovered?: boolean;
  size?: "large" | "compact";
  onSelect?: (theme: string) => void;
  onHover?: (theme: string | null) => void;
}) {
  const metadata = themeMetadata[theme as keyof typeof themeMetadata];

  if (!metadata) {
    return null;
  }

  const isCompact = size === "compact";

  return (
    <button
      type="button"
      disabled={isSubmitting}
      aria-pressed={isSelected}
      className={`group relative overflow-hidden bg-card/70 text-left transition-all duration-150 ${
        isSelected
          ? "ring-2 ring-primary"
          : "ring-1 ring-border/20 hover:bg-muted/40 hover:ring-primary/40"
      } ${isCompact ? "rounded-lg" : "rounded-xl"} ${
        isSubmitting ? "cursor-not-allowed opacity-50" : ""
      }`}
      onClick={() => onSelect?.(theme)}
      onMouseEnter={() => onHover?.(theme)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className={`w-full overflow-hidden ${isCompact ? "h-24" : "h-32"}`}>
        <ThemePreview theme={theme} isHovered={isHovered} size={size} />
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="truncate text-sm font-medium text-foreground/90">
          {theme}
        </span>
        {isSelected && (
          <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary">
            <svg
              className="h-2.5 w-2.5 text-primary-foreground"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}
