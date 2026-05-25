"use node";

/**
 * @deprecated COMMENTED OUT - TOO EXPENSIVE
 *
 * This Convex action was consuming 897+ hours of action compute time because
 * Convex actions are billed by wall-clock time (not CPU time). Every millisecond
 * waiting for Gravity's API response was billed, making this extremely costly.
 *
 * Gravity ads are now fetched client-side directly from the browser
 * in components/project-2/agent-chat/GravityAdSlot.tsx to avoid these costs.
 *
 * The client-side implementation:
 * - Uses NEXT_PUBLIC_GRAVITY_API_KEY instead of GRAVITY_API_KEY
 * - Has a 3-second timeout to prevent long waits
 * - Eliminates 100% of Convex action compute costs for ads
 *
 * This file is kept for reference/rollback purposes only.
 */

// These imports are kept commented out for reference if we ever need to restore the action
// import { action } from "./_generated/server";
// import { v } from "convex/values";
// import { getAuthUser } from "./users";

// const GRAVITY_API_URL = "https://server.trygravity.ai/api/v1/ad";

// Type kept for reference - now defined in GravityAdSlot.tsx instead
// export type GravityAd = {
//   adText: string;
//   title: string;
//   cta: string;
//   brandName: string;
//   url: string;
//   favicon?: string;
//   impUrl: string;
//   clickUrl: string;
// };

// /** Placement ID sent to Gravity for reporting/targeting. */
// const PLACEMENT_CHAT = "agent-chat-below-response";
// const PLACEMENT_CENTER = "project-center";
// const PLACEMENT_SIDEBAR = "project-sidebar";

/*
 * COMMENTED OUT - This action was too expensive (897+ hours of compute time).
 * See deprecation notice above. Ads are now fetched client-side.
 *
// export const getGravityAd = action({
//   args: {
//     messages: v.array(
//       v.object({
//         role: v.string(),
//         content: v.string(),
//       }),
//     ),
//     sessionId: v.string(),
//     testAd: v.optional(v.boolean()),
//     placementId: v.optional(v.string()),
//   },
//   handler: async (ctx, args): Promise<GravityAd | null> => {
//     const apiKey = process.env.GRAVITY_API_KEY;
//     if (!apiKey) {
//       return null;
//     }
//
//     const placementId =
//       args.placementId === "center"
//         ? PLACEMENT_CENTER
//         : args.placementId === "sidebar"
//           ? PLACEMENT_SIDEBAR
//           : PLACEMENT_CHAT;
//
//     const user = await getAuthUser(ctx);
//     const body: Record<string, unknown> = {
//       messages: args.messages,
//       sessionId: args.sessionId,
//       placements: [
//         {
//           placement:
//             placementId === PLACEMENT_CHAT
//               ? "below_response"
//               : placementId === PLACEMENT_CENTER
//                 ? "inline_response"
//                 : "left_response",
//           placement_id: placementId,
//         },
//       ],
//       testAd: args.testAd ?? false,
//     };
//     if (user) {
//       const tier = user.tier;
//       const gravityTier = !tier || tier === "free" ? "free" : "pro";
//       body.user = {
//         id: user._id,
//         email: user.email,
//         subscription_tier: gravityTier,
//       };
//     }
//
//     try {
//       const res = await fetch(GRAVITY_API_URL, {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(body),
//       });
//
//       if (res.status === 204 || !res.ok) {
//         return null;
//       }
//
//       const data = (await res.json()) as unknown;
//       if (!Array.isArray(data) || data.length === 0) {
//         return null;
//       }
//
//       const first = data[0];
//       if (
//         typeof first !== "object" ||
//         first === null ||
//         typeof (first as { adText?: unknown }).adText !== "string" ||
//         typeof (first as { impUrl?: unknown }).impUrl !== "string" ||
//         typeof (first as { clickUrl?: unknown }).clickUrl !== "string"
//       ) {
//         return null;
//       }
//
//       return {
//         adText: (first as { adText: string }).adText,
//         title: (first as { title?: string }).title ?? "",
//         cta: (first as { cta?: string }).cta ?? "",
//         brandName: (first as { brandName?: string }).brandName ?? "",
//         url: (first as { url?: string }).url ?? "",
//         favicon: (first as { favicon?: string }).favicon,
//         impUrl: (first as { impUrl: string }).impUrl,
//         clickUrl: (first as { clickUrl: string }).clickUrl,
//       };
//     } catch {
//       return null;
//     }
//   },
// });
*/

// Placeholder export to prevent "no exports" errors
export const _deprecated = true;
