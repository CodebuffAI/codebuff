"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUser } from "./users";
import {
  encryptByokSecret,
  getByokEncryptionSecret,
} from "./coding_agent/cli_agent/byokAuth";

const KIND = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("bedrock"),
);

export const saveByokSecret = action({
  args: { kind: KIND, secret: v.string() },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const secret = args.secret.trim();
    if (!secret) throw new Error(`${args.kind} secret is required`);

    const encryptionSecret = getByokEncryptionSecret();
    if (!encryptionSecret)
      throw new Error("BYOK encryption secret is not configured");

    const encrypted = encryptByokSecret(secret, encryptionSecret);
    if (!encrypted) throw new Error(`Failed to encrypt ${args.kind} secret`);

    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    await ctx.runMutation(internal.users.patchByokSecretInternal, {
      userId: user._id,
      kind: args.kind,
      encrypted: encrypted.encryptedPayload,
      version: encrypted.encryptionVersion,
    });
    return { success: true };
  },
});
