export function HeroBackground() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 z-0 h-full min-h-full w-full bg-background"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(124, 255, 63, 0.16), transparent 55%), radial-gradient(ellipse 60% 35% at 50% 30%, rgba(18, 73, 33, 0.55), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(124,255,63,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(124,255,63,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>
    </>
  );
}
