/**
 * Reusable billing icon components
 * Consistent purple gradient styling for billing UI
 */

import {
  Rocket,
  Cpu,
  Database,
  HardDrive,
  Unplug,
  type LucideIcon,
} from "lucide-react";

interface GradientIconProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Base purple gradient circle container
 * Used as foundation for all billing icons
 */
function GradientIconContainer({
  children,
  size = "md",
  className = "",
}: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const innerSizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const iconSizeClasses = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  };

  return (
    <div
      className={`${sizeClasses[size]} ${className} flex items-center justify-center rounded-full bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 shadow-md`}
    >
      <div
        className={`${innerSizeClasses[size]} flex items-center justify-center rounded-full bg-gradient-to-br from-white/90 to-purple-50`}
      >
        <div className={iconSizeClasses[size]}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Email icon - Purple gradient circle with envelope SVG
 */
export function EmailIcon({ size = "md", className }: GradientIconProps) {
  return (
    <GradientIconContainer size={size} className={className}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-purple-600"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    </GradientIconContainer>
  );
}

/**
 * AI icon - Purple gradient circle with CPU glyph
 */
export function AIIcon({ size = "md", className }: GradientIconProps) {
  return (
    <GradientIconContainer size={size} className={className}>
      <Cpu className="h-full w-full text-purple-600" />
    </GradientIconContainer>
  );
}

/**
 * Generic Convex resource icon - Purple gradient circle with custom lucide icon
 */
export function ConvexResourceIcon({
  icon: Icon,
  size = "md",
  className,
}: GradientIconProps & { icon: LucideIcon }) {
  return (
    <GradientIconContainer size={size} className={className}>
      <Icon className="h-full w-full text-purple-600" />
    </GradientIconContainer>
  );
}

/**
 * Pre-configured Convex resource icons
 */
export const ConvexFunctionCallsIcon = (props: GradientIconProps) => (
  <ConvexResourceIcon icon={Rocket} {...props} />
);

export const ConvexComputeIcon = (props: GradientIconProps) => (
  <ConvexResourceIcon icon={Cpu} {...props} />
);

export const ConvexDatabaseIcon = (props: GradientIconProps) => (
  <ConvexResourceIcon icon={Database} {...props} />
);

export const ConvexFileIcon = (props: GradientIconProps) => (
  <ConvexResourceIcon icon={HardDrive} {...props} />
);

/**
 * Convex Logo Icon - Just returns the Convex SVG without gradient wrapper
 * For use in contexts where the logo itself should be shown
 */
export function ConvexIcon({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeMap = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <img
      src="/convex-color.svg"
      alt="Convex"
      className={`${sizeMap[size]} ${className || ""}`}
    />
  );
}

/**
 * Integration Icon - Unplug icon for integration features
 */
export function IntegrationIcon({
  size = "sm",
  className = "text-purple-600",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeMap = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return <Unplug className={`${sizeMap[size]} ${className}`} />;
}

/**
 * Token Icon - Metallic coin with logo for agent credits display
 */
export function TokenIcon({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const sizeMap = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const logoSizeMap = {
    sm: { width: 8, height: 8, containerClass: "h-3 w-3" },
    md: { width: 10, height: 10, containerClass: "h-4 w-4" },
    lg: { width: 12, height: 12, containerClass: "h-5 w-5" },
  };

  return (
    <div
      className={`relative flex items-center justify-center ${sizeMap[size]}`}
    >
      {/* Coin base with metallic gradient */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 shadow-sm" />
      {/* Inner highlight ring */}
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-purple-300 via-purple-400 to-purple-600" />
      {/* Logo container — rounded-md (not rounded-full) so the square logo
          artwork isn't corner-cropped by a circular mask. */}
      <div
        className={`relative z-10 flex items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-white/90 to-purple-50 ${logoSizeMap[size].containerClass}`}
      >
        <img
          src="/logo-icon.png"
          alt="Freebuff credit"
          width={logoSizeMap[size].width}
          height={logoSizeMap[size].height}
          className="h-full w-full object-contain text-purple-600"
        />
      </div>
      {/* Shine effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/30 via-transparent to-transparent opacity-60" />
    </div>
  );
}
