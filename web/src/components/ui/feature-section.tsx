import { Button } from "./button";
import Link from "next/link";
import Image from "next/image";
import { GreenSplash, YellowSplash, ColorBar } from "./decorative-splash";

interface FeatureSectionProps {
  title: string;
  description: string;
  bgColor: "yellow" | "dark" | "green";
  imageUrl?: string;
  imagePosition?: "left" | "right";
  codeSample?: string[];
  featureTag?: string;
}

export function FeatureSection({
  title,
  description,
  bgColor,
  imageUrl,
  imagePosition = "right",
  codeSample,
  featureTag,
}: FeatureSectionProps) {
  // Define background colors
  const bgColors = {
    yellow: "bg-[#ffff33]",
    dark: "bg-black",
    green: "bg-[#003300]",
  };

  // Define text colors based on background
  const textColors = {
    yellow: "text-black",
    dark: "text-white",
    green: "text-white",
  };

  return (
    <section className={`py-24 ${bgColors[bgColor]} relative overflow-hidden`}>
      {/* Decorative backgrounds */}
      {bgColor === "yellow" && (
        <>
          <YellowSplash className="top-1/4 left-1/4 opacity-70" />
          <YellowSplash className="bottom-1/4 right-1/3 opacity-50" />
          <ColorBar
            color="yellow"
            width={150}
            className="absolute top-12 right-24 opacity-80 rotate-12 hidden md:block"
          />
          <ColorBar
            color="yellow"
            width={120}
            className="absolute bottom-16 left-10 opacity-80 -rotate-12 hidden md:block"
          />
        </>
      )}

      {bgColor === "dark" && (
        <>
          <GreenSplash className="top-1/4 right-1/4" />
          <GreenSplash className="bottom-10 left-10 opacity-40" />
          <ColorBar
            color="primary"
            width={120}
            className="absolute top-28 left-1/4 opacity-80 rotate-45 hidden md:block"
          />
          <ColorBar
            color="primary"
            width={80}
            className="absolute bottom-20 right-1/4 opacity-80 -rotate-12 hidden md:block"
          />
        </>
      )}

      {bgColor === "green" && (
        <>
          <GreenSplash className="top-10 left-10" />
          <GreenSplash className="bottom-1/3 right-1/3" />
          <ColorBar
            color="primary"
            width={200}
            className="absolute top-1/3 right-10 opacity-80 rotate-12 hidden md:block"
          />
        </>
      )}

      <div className="codebuff-container relative z-10">
        {featureTag && (
          <div className="mb-4">
            <span className={`text-xs font-semibold uppercase tracking-wider ${bgColor === "yellow" ? "text-black/70" : "text-primary"} inline-flex items-center`}>
              {bgColor !== "yellow" && (
                <span className="w-5 h-[2px] bg-primary mr-2"></span>
              )}
              {featureTag}
              {bgColor !== "yellow" && (
                <span className="w-5 h-[2px] bg-primary ml-2"></span>
              )}
            </span>
          </div>
        )}

        <div className={`grid grid-cols-1 ${imageUrl || codeSample ? "lg:grid-cols-2" : ""} gap-12 items-center`}>
          <div className={`${imagePosition === "right" ? "order-1" : "order-2 lg:order-1"}`}>
            <h2 className={`text-3xl lg:text-4xl font-serif font-medium mb-6 ${textColors[bgColor]}`}>
              {title}
            </h2>
            <p className={`text-lg mb-8 ${bgColor === "yellow" ? "text-black/70" : "text-zinc-300"}`}>
              {description}
            </p>
            <Button
              asChild
              className={`${bgColor === "yellow" ? "bg-black text-white hover:bg-black/90" : ""} transition-transform duration-300 hover:scale-105`}
            >
              <Link href="/signup" className="text-sm font-medium">
                Try Free
              </Link>
            </Button>
          </div>

          {imageUrl && (
            <div className={`relative ${imagePosition === "right" ? "order-2" : "order-1 lg:order-2"}`}>
              <div className="relative h-[300px] w-full transform transition-transform duration-500 hover:scale-105">
                <Image
                  src={imageUrl}
                  alt={title}
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          )}

          {codeSample && (
            <div className={`${imagePosition === "right" ? "order-2" : "order-1 lg:order-2"}`}>
              <div className="bg-black border border-zinc-800 rounded-md overflow-hidden terminal transform transition-all duration-500 hover:shadow-[0_0_25px_rgba(170,255,51,0.3)]">
                <div className="bg-zinc-900 p-2 border-b border-zinc-800">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                </div>
                <div className="p-4 font-mono text-sm text-zinc-300">
                  {codeSample.map((line, index) => (
                    <div
                      key={index}
                      className={`mb-1 ${line.startsWith(">") ? "text-primary font-semibold" : line.startsWith("•") ? "text-orange-400" : ""}`}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}