import { cn } from "@/vly/lib/utils";

interface VlyCoinProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeConfig = {
  sm: {
    container: "h-6 w-6",
    logo: { width: 12, height: 12 },
    logoContainer: "h-4 w-4",
  },
  md: {
    container: "h-8 w-8",
    logo: { width: 14, height: 14 },
    logoContainer: "h-6 w-6",
  },
  lg: {
    container: "h-10 w-10",
    logo: { width: 18, height: 18 },
    logoContainer: "h-7 w-7",
  },
};

export function VlyCoin({ size = "md", className }: VlyCoinProps) {
  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        config.container,
        className,
      )}
    >
      {/* Coin base — acid-green metallic gradient */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#9bff64] via-[#7CFF3F] to-[#124921] shadow-[0_0_18px_-2px_rgba(124,255,63,0.55)]" />
      {/* Inner highlight ring */}
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-[#a8ff7c] via-[#7CFF3F] to-[#2a7a35]" />
      {/* Logo container */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full bg-[#0a0a0b]",
          config.logoContainer,
        )}
      >
        {/* Current Freebuff Web logo */}
        <img
          src="/freebuff-logo.svg"
          alt="Freebuff credit"
          width={config.logo.width}
          height={config.logo.height}
        />
      </div>
      {/* Shine effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/20 via-transparent to-transparent opacity-50" />
    </div>
  );
}
