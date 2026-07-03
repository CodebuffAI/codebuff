/** Paths excluded from WebContainer filesystem snapshots (mirrors browserPod). */
export const IGNORED_SNAPSHOT_PATHS = ["dist", "node_modules", ".env.local"];

export const WEBCONTAINER_SANDBOX_PREFIX = "webcontainer:";

export function isWebContainerSandboxId(
  sandboxId: string | null | undefined,
): boolean {
  return !!sandboxId?.startsWith(WEBCONTAINER_SANDBOX_PREFIX);
}
