// Export all GitHub authentication functions from organized structure
export * from "./auth/oauth";
export * from "./auth/connections";
export * from "./auth/installation";
// Export remaining auth functions that aren't organized yet
export {
  handleGitHubOAuthCallback,
  refreshGitHubToken,
  verifyOAuthStateInternal,
  storeGitHubConnectionInternal,
  getProjectDetails,
  getProjectOwner,
  getSyncStatesByRepo,
  getSyncStateByProject,
} from "./auth";

// Export all GitHub repository functions
export * from "./repositories";

// Export all GitHub sync functions
export * from "./sync";
// Legacy sync/core functions removed - migrated to secure credentials system

// Export all GitHub sync status functions (backward compatibility)
export * from "./sync/status";

// Export all GitHub deployment functions
export * from "./deployments";
