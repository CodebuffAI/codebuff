import { v } from "convex/values";
import { Resend } from "resend";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { getAuthUser } from "./users";
import { rateLimiter } from "./coding_agent/rateLimiter";

// =====================================================================
// Constants
// =====================================================================

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_FROM_EMAIL = "vly.ai <no-reply@vly.ai>";

// =====================================================================
// Helpers
// =====================================================================

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateSixDigitCode(): string {
  // Use Web Crypto for non-predictable codes (Convex runtime supports it).
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

function buildOtpEmailHtml(code: string, expiresInMinutes: number): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <p>Hi,</p>
      <p>Someone (hopefully you) requested to import projects from this email address into a Freebuff account.</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 16px 0;">${code}</p>
      <p>This code expires in ${expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}

function buildOtpEmailText(code: string, expiresInMinutes: number): string {
  return [
    "Hi,",
    "",
    "Someone (hopefully you) requested to import projects from this email address into a Freebuff account.",
    "",
    `Your verification code is: ${code}`,
    "",
    `This code expires in ${expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email.`,
  ].join("\n");
}

// =====================================================================
// Internal queries / mutations
// =====================================================================

/**
 * Look up a single user row by email. Returns null if none, or the most
 * recently created row if multiple share an email (a known data drift case
 * the existing schema doesn't enforce uniqueness on).
 */
export const getLegacyUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeEmail(args.email);
    const matches = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .collect();

    if (matches.length === 0) return null;
    // If multiple, pick the one with the most projects (best candidate),
    // mirroring the existing resolveUserByFreebuffIdOrEmail heuristic.
    const scored = await Promise.all(
      matches.map(async (user) => {
        const memberships = await ctx.db
          .query("project_member")
          .withIndex("by_user", (q) => q.eq("user", user._id))
          .collect();
        return { user, count: memberships.length };
      }),
    );
    scored.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.user._creationTime - a.user._creationTime;
    });
    return scored[0].user;
  },
});

/**
 * Insert a fresh OTP record. Caller is responsible for deleting any prior
 * unconsumed OTPs for the same (requester, email) pair.
 */
export const insertOtpInternal = internalMutation({
  args: {
    requesterUserId: v.id("users"),
    email: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeEmail(args.email);

    // Invalidate any existing unconsumed OTP for the same pair so a new code
    // supersedes the old one.
    const existing = await ctx.db
      .query("import_email_otps")
      .withIndex("by_requester_and_email", (q) =>
        q.eq("requester_user_id", args.requesterUserId).eq("email", normalized),
      )
      .collect();
    for (const row of existing) {
      if (!row.consumed) {
        await ctx.db.delete(row._id);
      }
    }

    return await ctx.db.insert("import_email_otps", {
      requester_user_id: args.requesterUserId,
      email: normalized,
      code: args.code,
      expires_at: args.expiresAt,
      attempts: 0,
      consumed: false,
      created_at: Date.now(),
    });
  },
});

// =====================================================================
// Action: request OTP
// =====================================================================

export const requestImportOtp = action({
  args: { email: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true }
    | { ok: false; error: string; retryAfter?: number }
  > => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return { ok: false, error: "Not authenticated" };
    }

    const normalized = normalizeEmail(args.email);
    if (!normalized) {
      return { ok: false, error: "Email is required" };
    }
    if (normalized === normalizeEmail(user.email)) {
      return {
        ok: false,
        error: "That's the email of the account you're already signed in to.",
      };
    }

    // Rate limit: max 3 sends per hour per requester
    const rl = await rateLimiter.limit(ctx, "importOtpSends", {
      key: user._id,
      throws: false,
    });
    if (!rl.ok) {
      return {
        ok: false,
        error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60000)} minute(s).`,
        retryAfter: rl.retryAfter,
      };
    }

    // Look up legacy user
    const legacy: Doc<"users"> | null = await ctx.runQuery(
      internal.import_projects.getLegacyUserByEmail,
      { email: normalized },
    );

    if (!legacy) {
      return {
        ok: false,
        error: "No account found with that email.",
      };
    }
    if (legacy._id === user._id) {
      // Defensive: same row matched both freebuff_user_id and email.
      return {
        ok: false,
        error: "That email already belongs to your current account.",
      };
    }
    if (
      legacy.freebuff_user_id &&
      legacy.freebuff_user_id !== user.freebuff_user_id
    ) {
      return {
        ok: false,
        error: "That account is already linked to another GitHub login.",
      };
    }

    // Generate code, persist, send
    const code = generateSixDigitCode();
    const expiresAt = Date.now() + OTP_TTL_MS;

    await ctx.runMutation(internal.import_projects.insertOtpInternal, {
      requesterUserId: user._id,
      email: normalized,
      code,
      expiresAt,
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[requestImportOtp] RESEND_API_KEY is not configured");
      return { ok: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const ttlMinutes = Math.round(OTP_TTL_MS / 60000);
    const { error } = await resend.emails.send({
      from: OTP_FROM_EMAIL,
      to: [normalized],
      subject: "Your Freebuff project-import code",
      text: buildOtpEmailText(code, ttlMinutes),
      html: buildOtpEmailHtml(code, ttlMinutes),
    });

    if (error) {
      console.error(
        `[requestImportOtp] Failed to send to ${normalized}: ${error.message}`,
      );
      return { ok: false, error: "Failed to send verification email." };
    }

    return { ok: true };
  },
});

// =====================================================================
// Mutation: verify OTP and run transfer (Strategy A or B)
// =====================================================================

type VerifyResult =
  | { ok: true; strategy: "A" | "B"; importedProjectCount: number }
  | { ok: false; error: string; retryAfter?: number };

export const verifyAndImport = mutation({
  args: {
    email: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args): Promise<VerifyResult> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return { ok: false, error: "Not authenticated" };
    }

    const normalized = normalizeEmail(args.email);
    if (!normalized) {
      return { ok: false, error: "Email is required" };
    }
    const submittedCode = args.code.trim();
    if (submittedCode.length !== 6) {
      return { ok: false, error: "Invalid code" };
    }

    // Rate limit verify attempts (per requester)
    const rl = await rateLimiter.limit(ctx, "importOtpVerifies", {
      key: user._id,
      throws: false,
    });
    if (!rl.ok) {
      return {
        ok: false,
        error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 1000)}s.`,
        retryAfter: rl.retryAfter,
      };
    }

    // Find OTP record (must be issued to this requester for this email)
    const otpRows = await ctx.db
      .query("import_email_otps")
      .withIndex("by_requester_and_email", (q) =>
        q.eq("requester_user_id", user._id).eq("email", normalized),
      )
      .collect();
    const otp = otpRows
      .filter((r) => !r.consumed)
      .sort((a, b) => b.created_at - a.created_at)[0];

    if (!otp) {
      return { ok: false, error: "No active code. Request a new one." };
    }
    if (otp.expires_at < Date.now()) {
      return { ok: false, error: "Code expired. Request a new one." };
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      return {
        ok: false,
        error: "Too many failed attempts. Request a new code.",
      };
    }

    if (otp.code !== submittedCode) {
      await ctx.db.patch(otp._id, { attempts: otp.attempts + 1 });
      return { ok: false, error: "Incorrect code." };
    }

    // ---- OTP verified. Re-run all guards before mutating. ----
    const legacyMatches = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .collect();
    const legacy = legacyMatches.find((u) => u._id !== user._id) ?? null;
    if (!legacy) {
      await ctx.db.patch(otp._id, { consumed: true });
      return { ok: false, error: "No account found with that email." };
    }
    if (
      legacy.freebuff_user_id &&
      legacy.freebuff_user_id !== user.freebuff_user_id
    ) {
      await ctx.db.patch(otp._id, { consumed: true });
      return {
        ok: false,
        error: "That account is already linked to another GitHub login.",
      };
    }

    // ---- Hybrid decision: A if current has no project_members, else B. ----
    const currentMemberships = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", user._id))
      .collect();

    const legacyMemberships = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", legacy._id))
      .collect();

    if (currentMemberships.length === 0) {
      // ===== Strategy A: claim legacy row, delete current stub =====
      const identity = await ctx.auth.getUserIdentity();
      const freebuffUserId = identity?.subject ?? user.freebuff_user_id;
      if (!freebuffUserId) {
        return { ok: false, error: "Missing identity subject." };
      }

      // Patch legacy row to take over the current GitHub identity.
      await ctx.db.patch(legacy._id, {
        freebuff_user_id: freebuffUserId,
        clerk_id: freebuffUserId,
      });

      // Delete the current stub row. Confirmed it has no project_member rows.
      // Other tables may reference it (community, hiring forms, etc.) but
      // those are out-of-scope per the screenshot's note about secondary
      // surfaces. We don't delete those rows; we just delete the stub user.
      await ctx.db.delete(user._id);

      await ctx.db.patch(otp._id, { consumed: true });

      // importedProjectCount is the count of distinct projects the legacy
      // user has membership in (which the user now sees, since they ARE
      // legacy now).
      const distinctProjects = new Set(
        legacyMemberships.map((m) => m.project),
      );
      return {
        ok: true,
        strategy: "A",
        importedProjectCount: distinctProjects.size,
      };
    }

    // ===== Strategy B: transfer project_member rows =====
    let transferred = 0;
    const currentMembershipByProject = new Map<Id<"project">, Doc<"project_member">>();
    for (const m of currentMemberships) {
      currentMembershipByProject.set(m.project, m);
    }

    for (const legacyM of legacyMemberships) {
      const existing = currentMembershipByProject.get(legacyM.project);
      if (existing) {
        // Conflict: current user already a member. Delete legacy row;
        // current's role wins to preserve the user's existing state.
        await ctx.db.delete(legacyM._id);
      } else {
        // Re-parent the membership to the current user; preserve role.
        await ctx.db.patch(legacyM._id, { user: user._id });
        transferred += 1;
      }
    }

    await ctx.db.patch(otp._id, { consumed: true });

    return {
      ok: true,
      strategy: "B",
      importedProjectCount: transferred,
    };
  },
});
