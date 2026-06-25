"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { getAuthUser } from "../users";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";

const CUSTOM_LINKS_CONFIG_PATH = ".freebuff/custom-links.json";
const MAX_CUSTOM_LINKS = 20;

type CustomLink = {
  id: string;
  label: string;
  url: string;
  embed: boolean;
  description: string | null;
};

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeLabel(value: unknown, fallbackUrl: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 80);
  }
  try {
    return new URL(fallbackUrl).hostname;
  } catch {
    return "Custom link";
  }
}

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 180) : null;
}

function normalizeId(value: unknown, fallbackIndex: number): string {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    if (normalized) {
      return normalized.slice(0, 64);
    }
  }
  return `link-${fallbackIndex + 1}`;
}

function normalizeCustomLinks(payload: unknown): CustomLink[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as any).links)
      ? (payload as any).links
      : [];

  const normalized: CustomLink[] = [];
  const seen = new Set<string>();

  for (const candidate of source) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const url =
      normalizeUrl((candidate as any).url) ??
      normalizeUrl((candidate as any).href) ??
      normalizeUrl((candidate as any).link);
    if (!url) {
      continue;
    }

    const id = normalizeId((candidate as any).id, normalized.length);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    normalized.push({
      id,
      label: normalizeLabel((candidate as any).label ?? (candidate as any).title, url),
      url,
      embed:
        (candidate as any).embed === true ||
        (candidate as any).panel === "embed" ||
        (candidate as any).mode === "embed",
      description: normalizeDescription((candidate as any).description),
    });

    if (normalized.length >= MAX_CUSTOM_LINKS) {
      break;
    }
  }

  return normalized;
}

export const getCustomLinks = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.object({
    links: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        url: v.string(),
        embed: v.boolean(),
        description: v.union(v.string(), v.null()),
      }),
    ),
    configPath: v.string(),
    exists: v.boolean(),
    parseError: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const project = await ctx.runQuery(
      internal.cloud.connectRepoMutations.getConnectedRepoForMember,
      { semanticIdentifier: args.semanticIdentifier, userId: user._id },
    );
    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or access denied");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
      "new",
    );
    if (!(codebase instanceof DaytonaCodebase)) {
      throw new Error("Connected repos require a Daytona-backed sandbox");
    }

    let rawConfig = "";
    try {
      rawConfig = await codebase.readFile(CUSTOM_LINKS_CONFIG_PATH);
    } catch {
      return {
        links: [],
        configPath: CUSTOM_LINKS_CONFIG_PATH,
        exists: false,
        parseError: null,
      };
    }

    try {
      const parsed = JSON.parse(rawConfig);
      return {
        links: normalizeCustomLinks(parsed),
        configPath: CUSTOM_LINKS_CONFIG_PATH,
        exists: true,
        parseError: null,
      };
    } catch {
      return {
        links: [],
        configPath: CUSTOM_LINKS_CONFIG_PATH,
        exists: true,
        parseError:
          "Could not parse custom-links.json. Use valid JSON with an array of links.",
      };
    }
  },
});
