import { Id } from "@/convex/_generated/dataModel";

/**
 * Generate a secure image URL for a Convex storage ID.
 * This is a client-side utility that constructs the URL to the Convex HTTP endpoint
 * that serves images securely.
 *
 * @param storageId - The Convex storage ID for the image
 * @returns The complete URL to fetch the image
 */
export function getImageUrl(storageId: Id<"_storage">): string {
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

  if (!convexSiteUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not configured");
  }

  return `${convexSiteUrl}/image?storageId=${storageId}`;
}
