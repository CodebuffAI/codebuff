import Image from "next/image";
import { GreenSplash, YellowSplash, ColorBar } from "./decorative-splash";

export function CompetitionSection() {
  return (
    <section className="py-24 bg-[#003300] relative overflow-hidden">
      {/* Decorative elements */}
      <GreenSplash className="top-10 left-10" />
      <GreenSplash className="bottom-1/3 right-1/3" />
      <ColorBar
        color="primary"
        width={180}
        className="absolute top-1/3 right-10 opacity-80 rotate-12 hidden md:block"
      />
      <ColorBar
        color="primary"
        width={120}
        className="absolute bottom-20 left-20 opacity-80 -rotate-12 hidden md:block"
      />

      <div className="codebuff-container relative z-10">
        <div className="text-center mb-16 relative">
          <h2 className="text-3xl lg:text-4xl font-serif font-medium mb-6 text-white relative inline-block">
            Competition
            <span className="absolute -bottom-2 left-0 w-full h-1 bg-primary"></span>
          </h2>
          <p className="text-lg mb-8 text-zinc-300 max-w-3xl mx-auto">
            A million times smarter than any other tool. And if that's not good enough, our secret supervillain hacker
            fig never stopping that autocompletion until your code works.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
          {/* Left card - Other assistants */}
          <div className="bg-black/50 p-6 rounded-lg border border-zinc-800 relative transform transition-all duration-300 hover:translate-y-[-5px] hover:shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <div className="absolute top-0 left-0 w-full h-1 bg-zinc-700"></div>
            <h3 className="text-xl font-medium mb-4 text-white flex items-center">
              <span className="w-2 h-2 rounded-full bg-zinc-600 mr-3"></span>
              Other Assistants
            </h3>
            <div className="h-[350px] relative rounded-md overflow-hidden">
              <Image
                src="https://web-assets.same.dev/295087755/47351755.png"
                alt="Other AI assistants"
                fill
                className="object-contain opacity-70 transition-transform duration-500 hover:scale-105"
              />
            </div>
          </div>

          {/* Right card - Codebuff */}
          <div className="bg-black/50 p-6 rounded-lg border border-zinc-800 relative transform transition-all duration-300 hover:translate-y-[-5px] hover:shadow-[0_0_25px_rgba(170,255,51,0.3)]">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
            <h3 className="text-xl font-medium mb-4 text-white flex items-center">
              <span className="w-2 h-2 rounded-full bg-primary mr-3"></span>
              Codebuff
            </h3>
            <div className="h-[350px] relative rounded-md overflow-hidden">
              <Image
                src="https://web-assets.same.dev/2103704530/1685424398.png"
                alt="Codebuff interface"
                fill
                className="object-contain transition-transform duration-500 hover:scale-105"
              />
            </div>
          </div>

          {/* Connecting line */}
          <div className="absolute top-1/2 left-1/2 w-16 h-1 bg-primary hidden md:block" style={{ transform: 'translate(-50%, -50%)' }}></div>
        </div>
      </div>
    </section>
  );
}