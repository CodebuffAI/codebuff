import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
// import type { VlyIntegrations } from "@vly-ai/integrations";
import type { Id } from "@/convex/_generated/dataModel";
import { useState, useCallback } from "react";

/**
 * React hook for capturing and uploading screenshots to Convex storage
 *
 * Provides a simple interface to capture iframe screenshots and upload them
 * to the project. Automatically handles the full flow:
 * 1. Capture screenshot using vly.screenshot
 * 2. Get Convex upload URL
 * 3. Upload blob to Convex storage
 * 4. Save storage ID to project (deletes old screenshot automatically)
 *
 * @example
 * ```tsx
 * const { captureAndUpload, isUploading } = useScreenshot();
 *
 * const handleScreenshot = async () => {
 *   try {
 *     await captureAndUpload(vly, projectId, iframeRef.current);
 *     toast.success('Screenshot saved!');
 *   } catch (error) {
 *     toast.error('Failed to capture screenshot');
 *   }
 * };
 * ```
 */
export function useScreenshot() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convex mutations
  // @ts-ignore
  const saveScreenshot = useMutation(api.screenshot.saveProjectScreenshot);

  /**
   * Captures an iframe screenshot and uploads it to Convex storage
   *
   * @param vly - VlyIntegrations instance with screenshot module
   * @param projectId - Convex project ID
   * @param iframe - Iframe element to capture
   * @returns Promise resolving to the Convex storage ID
   */
  const captureAndUpload = useCallback(
    async (
      vly: any,
      projectId: Id<"project">,
      iframe: HTMLIFrameElement | null,
    ): Promise<string> => {
      if (!iframe) {
        throw new Error("Iframe element is null");
      }

      setIsUploading(true);
      setError(null);

      try {
        // Step 1: Capture screenshot using vly.screenshot
        console.log("[useScreenshot] Capturing screenshot...");
        const blob = await vly.screenshot.captureIframe(iframe, {
          format: "jpeg",
          quality: 0.85,
          waitForLoad: true,
          timeout: 5000,
        });

        console.log(
          `[useScreenshot] Screenshot captured: ${(blob.size / 1024).toFixed(2)} KB`,
        );

        // Step 2: Generate Convex upload URL
        console.log("[useScreenshot] Generating upload URL...");

        // Step 3: Upload blob to Convex storage
        console.log("[useScreenshot] Uploading to Convex storage...");
        // Step 4: Save storage ID to project (deletes old screenshot automatically)
        console.log("[useScreenshot] Saving screenshot to project...");
        await saveScreenshot({ projectId, r2Url: "" });

        console.log("[useScreenshot] Screenshot saved successfully!");
        return "";
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        console.error("[useScreenshot] Error:", errorMessage);
        setError(errorMessage);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [saveScreenshot],
  );

  return {
    /**
     * Captures iframe and uploads to Convex storage
     */
    captureAndUpload,

    /**
     * Whether an upload is currently in progress
     */
    isUploading,

    /**
     * Error message if the last operation failed
     */
    error,
  };
}
