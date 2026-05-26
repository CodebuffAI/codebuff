// Server component - no "use client" directive

export function HeroHeadline() {
  return (
    <>
      <h1 className="animate-fadeInSlideUpHeadline flex w-full flex-col items-center justify-center gap-2 text-center md:flex-row">
        <span className="font-serif text-3xl font-light sm:text-4xl md:text-4xl">
          Launch <span className="text-[#A37FBC]">complex</span> software in{" "}
          <span className="text-[#A37FBC]">seconds</span> without code
        </span>
      </h1>

      <p
        className="animate-fadeInSlideUpSubtitle mt-[2vh] text-center font-sans font-normal"
        style={{
          fontSize: "16px",
          marginBottom: 0,
          paddingBottom: 0,
        }}
      >
        The AI developer that outperforms Lovable, replit, and bolt in making
        web apps that actually work
      </p>
    </>
  );
}
