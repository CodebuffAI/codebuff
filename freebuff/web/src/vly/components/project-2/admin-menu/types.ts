import { Id } from "@/convex/_generated/dataModel";

export type RolloutStrategy =
  | "disabled"
  | "god_only"
  | "beta"
  | "percentage"
  | "enabled";

export interface FlagDefinition {
  key: string;
  description?: string;
  defaultStrategy: RolloutStrategy;
  defaultPercentage?: number;
}

export interface DisplayFlag {
  _id?: string;
  key: string;
  rollout_strategy: RolloutStrategy;
  rollout_percentage?: number;
  description?: string;
  isNew?: boolean;
}

export interface AdminQuickMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: Id<"project">;
}

export interface UserInfo {
  _id: Id<"users">;
  name: string;
  email: string;
  clerk_id: string;
}

export interface CreditBalance {
  featureId: string;
  name: string;
  balance: number | "unlimited";
  used?: number;
  unlimited?: boolean;
  allowed: boolean;
}

export interface PauseStatus {
  active: boolean;
  pauseReason?: string;
  pausedBy?: Id<"users">;
  pausedByName?: string;
  pausedByEmail?: string;
  autoUnpauseEnabled?: boolean;
  _creationTime?: number;
}

export interface ProjectMember {
  _id: string;
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  role: string;
  addedAt: number;
}

export interface DeploymentDetails {
  hasConvex: boolean;
  project: {
    name: string;
    sandbox_id?: string;
    semantic_identifier: string;
    packageManager: "pnpm" | "bun";
  };
  convex?: {
    devDeploymentName: string;
    prodDeploymentName?: string;
    convexProjectId: string;
    devDeploymentUrl: string;
    prodDeploymentUrl?: string | null;
  };
}

export interface SessionLog {
  sessionId: string;
  commandId: string;
  stdout: string;
  stderr: string;
  combined: string;
  timestamp: number;
}

export interface SessionLogsResponse {
  success: boolean;
  logs: SessionLog[];
  error?: string;
}

export interface PlatformStatistics {
  users: {
    total: number;
    active24h: number;
    active7d: number;
    active30d: number;
    recentSignups: number;
    godUsers: number;
    freeUsers: number;
    paidUsers: number;
  };
  projects: {
    total: number;
  };
  deployments: {
    total: number;
    active: number;
    paused: number;
  };
}
