// Server component - no "use client" directive
export function HeroGlassmorphism({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[35px]">
      {/* Gradient border layer */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[35px] p-[2px] shadow-md"
        style={{
          background:
            "linear-gradient(to bottom, #F7F5FA 0%, #F7F5FA 33%, rgba(255,255,255,0) 90%)",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {/* Inner content wrapper to create the border effect */}
      <div
        className="relative h-full w-full rounded-[20px]"
        style={{ background: "none" }}
      >
        {/* Overlay for true rounded corners */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[35px]"
          style={{ zIndex: 2 }}
        />
        {/* Border and masked background layer */}
        <div className="absolute inset-0 z-0 rounded-[33px] [mask-image:linear-gradient(to_bottom,black_0%,black_15%,transparent_100%)]"></div>

        {/* Content layer - above the masked background */}
        <div className="v-screen flex items-center justify-center">
          {/* Hero Card with stable initial styling */}
          <div
            className="mb-[5vh] flex min-h-[56vh] w-[95vw] flex-col rounded-[31px] md:w-[75vw]"
            style={{ background: "none" }}
          >
            {/* Inner gradient border container */}
            <div
              className="absolute inset-[20px] rounded-[35px] p-0 md:inset-[25px]"
              style={{ background: "none" }}
            >
              {/* Simple gradient border */}
              <div
                className="pointer-events-none absolute inset-0 rounded-[35px]"
                style={{
                  background:
                    "linear-gradient(to bottom, #FFFFFF 0%, #FFFFFF 33%, rgba(255,255,255,0) 60%)",
                }}
              />
              {/* Performance-optimized Glassmorphism with GPU acceleration */}
              <div className="pointer-events-none absolute inset-0 rounded-[35px]">
                {/* Main backdrop blur layer - GPU accelerated */}
                <div
                  className="absolute h-full w-full rounded-[35px]"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.05) 100%)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    transform: "translateZ(0)", // Force GPU layer
                    willChange: "transform",
                  }}
                />
                {/* Inner glow effect - reduced layers */}
                <div
                  className="absolute left-[3%] top-[10%] h-[80%] w-[94%] rounded-[30px]"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 50%, transparent 100%)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    transform: "translateZ(0)",
                    willChange: "transform",
                  }}
                />
                {/* Subtle border highlight */}
                <div
                  className="absolute inset-0 rounded-[35px]"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.1) 30%, transparent 70%)",
                    boxShadow:
                      "inset 0px 1px 0px rgba(255,255,255,0.8), 0px 4px 24px rgba(204,184,218,0.12)",
                    transform: "translateZ(0)",
                  }}
                />
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
