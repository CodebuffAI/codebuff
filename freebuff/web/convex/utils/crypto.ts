"use node";
import { v } from "convex/values";
import crypto from "crypto";
import { action } from "../_generated/server";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto as any;
}

/**
 * Generate a cryptographically secure random string
 */
export const generateSecureState = action({
  args: {},
  returns: v.string(),
  handler: async () => {
    return crypto.randomBytes(32).toString("hex");
  },
});

/**
 * Verify GitHub webhook HMAC signature
 */
export const verifyGitHubSignature = action({
  args: {
    payload: v.string(),
    signature: v.string(),
    secret: v.string(),
  },
  returns: v.boolean(),
  handler: async (_, args) => {
    const { payload, signature, secret } = args;

    console.log("GitHub signature verification started", {
      payloadLength: payload.length,
      signaturePrefix: signature.substring(0, 12) + "...",
      hasSecret: !!secret,
    });

    if (!signature.startsWith("sha256=")) {
      console.log("Invalid signature format - missing sha256= prefix");
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");

    const receivedSignature = signature.replace("sha256=", "");

    // Use crypto.timingSafeEqual for constant-time comparison
    if (
      Buffer.byteLength(expectedSignature, "hex") !==
      Buffer.byteLength(receivedSignature, "hex")
    ) {
      console.log("Signature length mismatch");
      return false;
    }
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(receivedSignature, "hex"),
    );

    console.log("GitHub signature verification completed", {
      isValid,
      expectedPrefix: expectedSignature.substring(0, 8) + "...",
      receivedPrefix: receivedSignature.substring(0, 8) + "...",
    });

    return isValid;
  },
});
