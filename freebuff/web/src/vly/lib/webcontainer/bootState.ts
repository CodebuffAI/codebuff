/**
 * Boot state machine for the WebContainer singleton, mirroring browserPod's
 * `ContainerBootState`. Implemented as a tiny framework-agnostic pub/sub
 * store (instead of nanostores) so it can be read with React's
 * `useSyncExternalStore` without adding a new dependency.
 */

export enum ContainerBootState {
  UNSUPPORTED = -2,
  ERROR = -1,
  STARTING = 0,
  LOADING_SNAPSHOT = 1,
  DOWNLOADING_DEPENDENCIES = 2,
  SETTING_UP_CONVEX_PROJECT = 3,
  SETTING_UP_CONVEX_ENV_VARS = 4,
  CONFIGURING_CONVEX_AUTH = 5,
  STARTING_BACKUP = 6,
  READY = 7,
}

export interface ContainerBootStatus {
  state: ContainerBootState;
  error?: unknown;
}

type Listener = (status: ContainerBootStatus) => void;

let currentStatus: ContainerBootStatus = { state: ContainerBootState.STARTING };
const listeners = new Set<Listener>();

export function getContainerBootStatus(): ContainerBootStatus {
  return currentStatus;
}

export function setContainerBootState(state: ContainerBootState, error?: unknown): void {
  currentStatus = { state, error };
  for (const listener of listeners) {
    listener(currentStatus);
  }
}

export function subscribeToContainerBootState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Wait until the container reaches a specific boot state (or a later one).
 * Mirrors browserPod's wait helper so non-React callers can safely gate work.
 */
export function waitForContainerBootState(
  targetState: ContainerBootState,
  timeoutMs = 120_000,
): Promise<ContainerBootStatus> {
  const current = getContainerBootStatus();
  if (current.state >= targetState) {
    return Promise.resolve(current);
  }
  if (current.state === ContainerBootState.ERROR) {
    return Promise.reject(
      current.error ?? new Error("WebContainer boot failed before reaching target state."),
    );
  }
  if (current.state === ContainerBootState.UNSUPPORTED) {
    return Promise.reject(
      current.error ?? new Error("WebContainer is unsupported in this browser."),
    );
  }

  return new Promise<ContainerBootStatus>((resolve, reject) => {
    const startedAt = Date.now();
    const unsubscribe = subscribeToContainerBootState((status) => {
      if (status.state >= targetState) {
        unsubscribe();
        resolve(status);
        return;
      }
      if (status.state === ContainerBootState.ERROR) {
        unsubscribe();
        reject(status.error ?? new Error("WebContainer boot failed."));
        return;
      }
      if (status.state === ContainerBootState.UNSUPPORTED) {
        unsubscribe();
        reject(status.error ?? new Error("WebContainer is unsupported in this browser."));
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        unsubscribe();
        reject(
          new Error(
            `Timed out waiting for WebContainer state ${targetState}. Current state: ${status.state}`,
          ),
        );
      }
    });
  });
}

/**
 * Wait until a boot step is completed (i.e. state has moved past that step).
 * Equivalent to browserPod's "waitForBootStepCompleted" behavior.
 */
export function waitForBootStepCompleted(
  step: ContainerBootState,
  timeoutMs = 120_000,
): Promise<ContainerBootStatus> {
  if (step >= ContainerBootState.READY) {
    return waitForContainerBootState(ContainerBootState.READY, timeoutMs);
  }
  return waitForContainerBootState(step + 1, timeoutMs);
}
