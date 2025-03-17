interface SplashProps {
  className?: string;
}

interface ColorBarProps extends SplashProps {
  color: "primary" | "yellow" | "cyan";
  width: number;
  height?: number;
}

export function GreenSplash({ className = "" }: SplashProps) {
  return (
    <div
      className={`absolute w-[300px] h-[300px] rounded-full bg-primary/20 blur-[100px] -z-10 ${className}`}
    />
  );
}

export function YellowSplash({ className = "" }: SplashProps) {
  return (
    <div
      className={`absolute w-[300px] h-[300px] rounded-full bg-yellow-300/20 blur-[100px] -z-10 ${className}`}
    />
  );
}

export function ColorBar({ color, width, height = 8, className = "" }: ColorBarProps) {
  const colors = {
    primary: "bg-primary",
    yellow: "bg-yellow-300",
    cyan: "bg-cyan-500",
  };

  return (
    <div
      className={`${colors[color]} ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}