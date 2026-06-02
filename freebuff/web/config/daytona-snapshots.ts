/**
 * Configuration for available Daytona workspace snapshots
 * Used for upgrading/downgrading workspaces in the Monitoring view
 */

export interface DaytonaSnapshot {
  id: string;
  name: string;
  tier: "small" | "medium" | "large";
  recommended?: boolean;
  specs: {
    cpu: string;
    ram: string;
    disk: string;
  };
}

/**
 * List of available Daytona snapshots
 * Update this list when new snapshots are created
 */
export const DAYTONA_SNAPSHOTS: DaytonaSnapshot[] = [
  {
    id: "vly-template-0-0-5-free",
    name: "Small",
    tier: "small",
    specs: {
      cpu: "2",
      ram: "4GB",
      disk: "6GB",
    },
  },
  {
    id: "vly-template-0-0-1-hobby",
    name: "Medium",
    tier: "medium",
    recommended: true,
    specs: {
      cpu: "2",
      ram: "6GB",
      disk: "8GB",
    },
  },
  {
    id: "vly-template-0-0-1-pro",
    name: "Large",
    tier: "large",
    specs: {
      cpu: "2",
      ram: "8GB",
      disk: "10GB",
    },
  },
];

/**
 * Get snapshot by ID
 */
export function getSnapshotById(id: string): DaytonaSnapshot | undefined {
  return DAYTONA_SNAPSHOTS.find((snapshot) => snapshot.id === id);
}
