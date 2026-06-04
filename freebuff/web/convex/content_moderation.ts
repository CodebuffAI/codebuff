import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * Content moderation - check for restricted project types.
 */

export type ModerationCategory =
  | "crypto"
  | "stock_market"
  | "constant_monitoring"
  | "high_resource";

const PATTERNS: Record<ModerationCategory, RegExp[]> = {
  crypto: [
    /\bcrypto\b/i,
    /\bblockchain\b/i,
    /\bweb3\b/i,
    /\bnft\b/i,
    /\bdefi\b/i,
    /\bsmart\s*contract\b/i,
    /\berc[\-\s]?20\b/i,
    /\berc[\-\s]?721\b/i,
    /\bethereum\b/i,
    /\bsolana\b/i,
    /\bbitcoin\b/i,
    /\bmetamask\b/i,
    /\btoken\s+web/i,
    /\btoken\s+site/i,
    /\btoken\s+app/i,
    /\btoken\s+platform/i,
    /\btokenomics\b/i,
    /\bdapp\b/i,
    /\bwagmi\b/i,
    /\bhardhat\b/i,
    /\bopenzeppelin\b/i,
    /\bconnect\s*wallet\b/i,
    /\bmint.*token/i,
    /\bmint.*nft/i,
    /\bairdrop\b/i,
    /\bstaking\b/i,
    /\bico\b/i,
    /\bpresale\b/i,
  ],
  stock_market: [
    /\bstock\s+(?:market|trading|tracker)\b/i,
    /\btrading\s+(?:bot|platform|system)\b/i,
    /\bforex\b/i,
    /\balgo(?:rithmic)?\s+trading\b/i,
    /\bday\s+trading\b/i,
    /\bhigh[\-\s]?frequency\s+trading\b/i,
    /\bhedge\s+fund\b/i,
  ],
  constant_monitoring: [
    /\b24\/7\s+monitor/i,
    /\bcontinuous\s+(?:scraping|polling|monitor)/i,
    /\bprice\s+(?:alert|monitor|tracker)\b/i,
    /\barbitrage\b/i,
    /\bauto(?:mated)?\s+trading\b/i,
  ],
  high_resource: [
    /\bmassive\s+(?:data|traffic)\b/i,
    /\b(?:millions?|billions?)\s+(?:of\s+)?requests?\b/i,
    /\bweb\s+crawler\b/i,
    /\bddos\b/i,
    /\bload\s+test/i,
  ],
};

const CATEGORY_MESSAGES: Record<ModerationCategory, string> = {
  crypto: "Cryptocurrency, blockchain, or Web3 projects",
  stock_market: "Stock market or trading software",
  constant_monitoring: "Software requiring constant monitoring",
  high_resource: "High bandwidth or compute-intensive applications",
};

export interface ModerationResult {
  blocked: boolean;
  category?: ModerationCategory;
  message?: string;
}

/**
 * Pure function - check if content should be blocked (regex only).
 * Use this in mutations.
 */
export function checkContentModeration(content: string): ModerationResult {
  if (!content) return { blocked: false };

  for (const [category, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        const cat = category as ModerationCategory;
        return {
          blocked: true,
          category: cat,
          message: `This platform doesn't support: ${CATEGORY_MESSAGES[cat]}`,
        };
      }
    }
  }

  return { blocked: false };
}

/**
 * Action - check content with regex (AI removed for simplicity).
 * Use this from frontend.
 */
export const checkContent = action({
  args: { content: v.string() },
  handler: async (ctx, args) => {
    if (!args.content?.trim()) {
      return { flagged: false, categories: [], reason: "Empty content" };
    }

    const result = checkContentModeration(args.content);
    if (result.blocked) {
      return {
        flagged: true,
        categories: result.category ? [result.category] : [],
        reason: result.message || "Matched restricted keywords",
      };
    }

    return { flagged: false, categories: [], reason: "Content allowed" };
  },
});
