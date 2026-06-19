/**
 * Pure parsing helpers for Gravity Index tool output. Kept free of Convex
 * imports so they can be unit-tested directly (see gravity_parse.test.ts).
 */

export interface ParsedGravitySearchResult {
  searchId: string;
  slug: string;
  requiredEnvVars: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Pull {searchId, slug, requiredEnvVars} out of a gravity_index search tool
 * output. The tool output is the SDK envelope `[{type:'json', value}]` where
 * `value` is the Gravity search response. Returns null unless all three are
 * present — we only want fully-actionable recommendations (a save can't confirm
 * a service whose required env vars we don't know).
 */
export function extractGravitySearchResult(
  output: unknown,
): ParsedGravitySearchResult | null {
  const items = Array.isArray(output) ? output : [output];
  for (const item of items) {
    const itemRecord = asRecord(item);
    const value = itemRecord && "value" in itemRecord ? itemRecord.value : item;
    const result = asRecord(value);
    if (!result) continue;

    const searchId =
      typeof result.search_id === "string" ? result.search_id.trim() : "";
    if (!searchId) continue;

    const recommendation = asRecord(result.recommendation);
    const slug =
      recommendation && typeof recommendation.slug === "string"
        ? recommendation.slug.trim().toLowerCase()
        : "";
    if (!slug) continue;

    const credentialRequest = asRecord(result.credential_request);
    const requiredEnvVars = credentialRequest
      ? asStringArray(credentialRequest.required_env_vars)
      : [];
    const installEnvVars = asStringArray(asRecord(result.install)?.env_vars);
    const envVars = Array.from(
      new Set(
        (requiredEnvVars.length > 0 ? requiredEnvVars : installEnvVars)
          .map((key) => key.trim())
          .filter(Boolean),
      ),
    );
    if (envVars.length === 0) continue;

    return { searchId, slug, requiredEnvVars: envVars };
  }
  return null;
}
