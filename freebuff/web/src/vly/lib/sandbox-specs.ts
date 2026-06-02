// Sandbox resource specifications by size
// Sizes map to plan tiers for backward compatibility with UI

export type SandboxSize = "small" | "medium" | "large";

// Specs by sandbox size (aligned with Daytona snapshots)
export const sandboxSpecsBySize = {
  small: {
    vcpu: 1,
    ram_gb: 3,
    disk_gb: 4,
  },
  medium: {
    vcpu: 1,
    ram_gb: 4,
    disk_gb: 8,
  },
  large: {
    vcpu: 2,
    ram_gb: 8,
    disk_gb: 10,
  },
} as const;

// Specs by plan tier (includes both legacy and custom plan IDs)
export const sandboxSpecs = {
  free_plan: sandboxSpecsBySize.small,
  // Hobby tier (legacy + custom)
  hobby_plan: sandboxSpecsBySize.medium,
  hobby_custom_plan: sandboxSpecsBySize.medium,
  // Pro tier (legacy + custom)
  pro_plan: sandboxSpecsBySize.large,
  pro_custom_plan: sandboxSpecsBySize.large,
  // Team tier
  team_plan: {
    vcpu: 4,
    ram_gb: 16,
    disk_gb: 32,
  },
  team_custom_plan: {
    vcpu: 4,
    ram_gb: 16,
    disk_gb: 32,
  },
  // Enterprise tier
  enterprise_plan: {
    vcpu: 8,
    ram_gb: 32,
    disk_gb: 64,
  },
  enterprise_custom_plan: {
    vcpu: 8,
    ram_gb: 32,
    disk_gb: 64,
  },
} as const;

// Helper to get specs by size
export function getSpecsBySize(size: SandboxSize | undefined) {
  return sandboxSpecsBySize[size ?? "small"];
}

// Helper to get size display name
export function getSizeDisplayName(size: SandboxSize | undefined): string {
  const actualSize = size ?? "small";
  return actualSize.charAt(0).toUpperCase() + actualSize.slice(1);
}
