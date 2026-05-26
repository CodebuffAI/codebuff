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
      {/* Coin base with metallic gradient */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 shadow-lg" />
      {/* Inner highlight ring - slimmer */}
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-purple-300 via-purple-400 to-purple-600" />
      {/* Logo container */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full bg-gradient-to-br from-white/90 to-purple-50",
          config.logoContainer,
        )}
      >
        {/* Current Vly logo */}
        <img
          src="/logo.svg"
          alt="Vly token"
          width={config.logo.width}
          height={config.logo.height}
          className="text-purple-600"
        />
      </div>
      {/* Shine effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/30 via-transparent to-transparent opacity-60" />
    </div>
  );
}
