// ============================================================================
// Autumn Configuration
// ============================================================================
//
// This file serves as the main entry point for `npx atmn push`.
// IMPORTANT: Only export products and features here - the Autumn SDK validates
// that all exports must be either a product (with 'items' field) or a feature
// (with 'type' field).
//
// Configuration is organized in three files:
// - autumn/config.ts: Features and products (Autumn SDK objects) - exported here
// - autumn/constants.ts: Pricing constants and helper functions - import directly
// - autumn/helpers.ts: Composable builder functions for internal use

// Re-export all configuration (features, packs, plans)
// NOTE: Only config.ts contains valid Autumn SDK objects
export * from "./autumn/config";

// DO NOT re-export constants or helpers here!
// The Autumn SDK requires all exports to be products or features.
// Import constants directly from '@/autumn/constants' where needed.
