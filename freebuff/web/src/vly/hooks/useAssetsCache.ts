import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface AssetMetadata {
  id: string;
  fileName: string;
  originalName: string;
  description?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  filePath: string;
}

interface AssetsCacheState {
  assets: AssetMetadata[];
  isLoading: boolean;
  error: string | null;
  lastFetch: number;
}

const CACHE_DURATION = 300000; // 5 minutes cache (only invalidated manually)
const DEBOUNCE_DELAY = 300; // 300ms debounce

// Global cache to share between components
const globalAssetsCache = new Map<string, AssetsCacheState>();
const pendingRequests = new Map<string, Promise<AssetMetadata[]>>();
const cacheListeners = new Map<
  string,
  Set<(state: AssetsCacheState) => void>
>();

// Helper to notify all listeners for a semantic identifier
const notifyCacheListeners = (
  semanticIdentifier: string,
  state: AssetsCacheState,
) => {
  const listeners = cacheListeners.get(semanticIdentifier);
  if (listeners) {
    listeners.forEach((listener) => listener(state));
  }
};

// Global function to invalidate cache for a specific project
export const invalidateAssetsCache = (semanticIdentifier: string) => {
  const cached = globalAssetsCache.get(semanticIdentifier);
  if (cached) {
    const invalidatedState = {
      ...cached,
      lastFetch: 0, // Force refresh
    };
    globalAssetsCache.set(semanticIdentifier, invalidatedState);
    notifyCacheListeners(semanticIdentifier, invalidatedState);
  }
};

export function useAssetsCache(semanticIdentifier: string) {
  const getAssetsAction = useAction(api.assets.getAssets);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<AssetsCacheState>(() => {
    const cached = globalAssetsCache.get(semanticIdentifier);
    return (
      cached || {
        assets: [],
        isLoading: false,
        error: null,
        lastFetch: 0,
      }
    );
  });

  const isCacheValid = useCallback((lastFetch: number) => {
    return Date.now() - lastFetch < CACHE_DURATION;
  }, []);

  const fetchAssets = useCallback(
    async (force = false): Promise<AssetMetadata[]> => {
      const cached = globalAssetsCache.get(semanticIdentifier);

      // Return cached data if valid and not forced
      if (!force && cached && isCacheValid(cached.lastFetch) && !cached.error) {
        return cached.assets;
      }

      // Check if there's already a pending request for this identifier
      const pending = pendingRequests.get(semanticIdentifier);
      if (pending) {
        return pending;
      }

      // Create new request
      const request = (async () => {
        try {
          const assetsData = await getAssetsAction({ semanticIdentifier });

          const newState: AssetsCacheState = {
            assets: assetsData,
            isLoading: false,
            error: null,
            lastFetch: Date.now(),
          };

          globalAssetsCache.set(semanticIdentifier, newState);
          setState(newState);
          notifyCacheListeners(semanticIdentifier, newState);

          return assetsData;
        } catch (error) {
          const errorState: AssetsCacheState = {
            assets: cached?.assets || [],
            isLoading: false,
            error:
              error instanceof Error ? error.message : "Failed to load assets",
            lastFetch: cached?.lastFetch || 0,
          };

          globalAssetsCache.set(semanticIdentifier, errorState);
          setState(errorState);
          notifyCacheListeners(semanticIdentifier, errorState);

          console.error("Failed to load assets:", error);
          throw error;
        } finally {
          pendingRequests.delete(semanticIdentifier);
        }
      })();

      pendingRequests.set(semanticIdentifier, request);
      return request;
    },
    [semanticIdentifier, getAssetsAction, isCacheValid],
  );

  const debouncedFetch = useCallback(
    (force = false) => {
      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set loading state immediately for responsiveness
      const currentState = globalAssetsCache.get(semanticIdentifier);
      if (!currentState || force) {
        const loadingState: AssetsCacheState = {
          assets: currentState?.assets || [],
          isLoading: true,
          error: null,
          lastFetch: currentState?.lastFetch || 0,
        };
        globalAssetsCache.set(semanticIdentifier, loadingState);
        setState(loadingState);
        notifyCacheListeners(semanticIdentifier, loadingState);
      }

      // Debounce the actual fetch
      debounceRef.current = setTimeout(() => {
        fetchAssets(force).catch(() => {
          // Error handling is done in fetchAssets
        });
      }, DEBOUNCE_DELAY);
    },
    [semanticIdentifier, fetchAssets],
  );

  const loadAssets = useCallback(
    (force = false) => {
      debouncedFetch(force);
    },
    [debouncedFetch],
  );

  const refreshAssets = useCallback(() => {
    loadAssets(true);
  }, [loadAssets]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Fetch assets on mount if cache is empty or expired
  useEffect(() => {
    const cached = globalAssetsCache.get(semanticIdentifier);

    // If no cache exists or cache is empty/expired, fetch on mount
    if (
      !cached ||
      cached.assets.length === 0 ||
      !isCacheValid(cached.lastFetch)
    ) {
      loadAssets(false); // Use non-forced load to avoid unnecessary fetches
    }
  }, [semanticIdentifier, loadAssets, isCacheValid]);

  // Subscribe to cache changes with event-based updates instead of polling
  useEffect(() => {
    // Get or create listener set for this semantic identifier
    let listeners = cacheListeners.get(semanticIdentifier);
    if (!listeners) {
      listeners = new Set();
      cacheListeners.set(semanticIdentifier, listeners);
    }

    // Add this component's listener
    const listener = (newState: AssetsCacheState) => {
      setState(newState);
    };
    listeners.add(listener);

    // Check for initial cache state
    const cached = globalAssetsCache.get(semanticIdentifier);
    if (cached && cached !== state) {
      setState(cached);
    }

    // Cleanup on unmount
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        cacheListeners.delete(semanticIdentifier);
      }
    };
  }, [semanticIdentifier]);

  return {
    assets: state.assets,
    isLoading: state.isLoading,
    error: state.error,
    loadAssets,
    refreshAssets,
  };
}
