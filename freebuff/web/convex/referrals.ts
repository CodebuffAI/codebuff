import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser } from "./users";

// Generate a unique referral code
function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a new referral code for the authenticated user
export const createReferralCode = mutation({
  args: {
    customCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    let code: string;

    if (args.customCode) {
      // Validate custom code
      const trimmedCode = args.customCode.trim().toUpperCase();

      // Validate format: alphanumeric only, 3-20 characters
      if (!/^[A-Z0-9]{3,20}$/.test(trimmedCode)) {
        throw new Error(
          "Code must be 3-20 characters long and contain only letters and numbers",
        );
      }

      // Check if custom code already exists
      const existing = await ctx.db
        .query("referral_codes")
        .withIndex("by_code", (q) => q.eq("code", trimmedCode))
        .unique();

      if (existing) {
        throw new Error(
          "This code is already taken. Please choose a different one.",
        );
      }

      code = trimmedCode;
    } else {
      // Auto-generate code
      code = generateReferralCode();
      let attempts = 0;

      // Ensure the code is unique
      while (attempts < 10) {
        const existing = await ctx.db
          .query("referral_codes")
          .withIndex("by_code", (q) => q.eq("code", code))
          .unique();

        if (!existing) {
          break;
        }

        code = generateReferralCode();
        attempts++;
      }

      if (attempts >= 10) {
        throw new Error("Failed to generate unique code");
      }
    }

    const referralCodeId = await ctx.db.insert("referral_codes", {
      code,
      owner: user._id,
      created_at: Date.now(),
      uses_count: 0,
      active: true,
    });

    return { code, id: referralCodeId };
  },
});

// Get all referral codes for the authenticated user
export const getUserReferralCodes = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const codes = await ctx.db
      .query("referral_codes")
      .withIndex("by_owner", (q) => q.eq("owner", user._id))
      .collect();

    return codes.map((code) => ({
      ...code,
      url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/web/?ref=${code.code}`,
    }));
  },
});

// Get referral statistics for a specific code
export const getReferralStats = query({
  args: {
    codeId: v.id("referral_codes"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const code = await ctx.db.get(args.codeId);
    if (!code) {
      throw new Error("Code not found");
    }

    // Check if user owns this code or is admin/godmode
    if (
      code.owner !== user._id &&
      user.role !== "god" &&
      user.role !== "admin"
    ) {
      throw new Error("Unauthorized");
    }

    // Get users who signed up with this code
    const referredUsers = await ctx.db
      .query("users")
      .withIndex("by_referral_code", (q) => q.eq("referral_code", code.code))
      .collect();

    return {
      code: code.code,
      uses_count: code.uses_count,
      created_at: code.created_at,
      active: code.active,
      referred_users: referredUsers.map((u) => ({
        name: u.name,
        email: u.email,
        signupDate: u._creationTime,
      })),
    };
  },
});

// Get all referral codes (godmode only)
export const getAllReferralCodes = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      return [];
    }

    const codes = await ctx.db.query("referral_codes").collect();

    // Get owner information for each code
    const codesWithOwners = await Promise.all(
      codes.map(async (code) => {
        const owner = await ctx.db.get(code.owner);
        return {
          ...code,
          ownerName: owner?.name || "Unknown",
          ownerEmail: owner?.email || "Unknown",
          url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/web/?ref=${code.code}`,
        };
      }),
    );

    return codesWithOwners;
  },
});

// Toggle active status of a referral code
export const toggleReferralCode = mutation({
  args: {
    codeId: v.id("referral_codes"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const code = await ctx.db.get(args.codeId);
    if (!code) {
      throw new Error("Code not found");
    }

    // Check if user owns this code or is admin/godmode
    if (
      code.owner !== user._id &&
      user.role !== "god" &&
      user.role !== "admin"
    ) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.codeId, {
      active: !code.active,
    });

    return { active: !code.active };
  },
});

// Get summary statistics for the dashboard
export const getReferralSummary = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    if (user.role === "god" || user.role === "admin") {
      // For admin users, show all stats
      const allCodes = await ctx.db.query("referral_codes").collect();
      const totalSignups = allCodes.reduce(
        (sum, code) => sum + code.uses_count,
        0,
      );

      return {
        totalCodes: allCodes.length,
        totalSignups,
        activeCodes: allCodes.filter((c) => c.active).length,
      };
    } else {
      // For regular users, show their stats
      const userCodes = await ctx.db
        .query("referral_codes")
        .withIndex("by_owner", (q) => q.eq("owner", user._id))
        .collect();

      const totalSignups = userCodes.reduce(
        (sum, code) => sum + code.uses_count,
        0,
      );

      return {
        totalCodes: userCodes.length,
        totalSignups,
        activeCodes: userCodes.filter((c) => c.active).length,
      };
    }
  },
});
