import { api, internal } from "!/_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "!/_generated/server";
import { getAuthUser } from "!/users";
import { v } from "convex/values";
import {
  FreestyleSandboxes,
  HandleVerifyWildcardError,
  HandleVerifyWildcardResponse,
} from "freestyle-sandboxes";
import { getRootDomain } from "../lib/utils";
import {
  requireFeatureAccess,
  BOOLEAN_FEATURE_IDS,
} from "./lib/featureAccessControl";

type SuccessOrError =
  | {
      success: true;
    }
  | {
      success: false;
      message: string;
    };

type DnsAnswer = {
  name: string;
  type: number;
  TTL: number;
  data: string;
};

type DnsResponse = {
  Answer?: DnsAnswer[];
};

const DNS_RECORD_TYPES = {
  A: 1,
  CNAME: 5,
} as const;

const DNS_CONFIG = {
  A_RECORD_IP: "35.235.84.134",
  CNAME_TARGETS: [
    "cname.vly-dns.com.",
    "cname.vly-dns.com",
  ] as readonly string[],
} as const;

export const create = internalMutation({
  args: {
    domain: v.string(),
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    if (!user) {
      throw new Error("User not found");
    }

    const domainId = await ctx.db.insert("domain", {
      domain: args.domain.toLowerCase(),
      ownership_verified: false,
      wildcard_cert_generated: false,
      pointing_verified: false,
      owner: user._id,
      rootDomain: getRootDomain(args.domain),
    });

    await ctx.db.insert("project_domain", {
      projectId: args.projectId,
      domainId: domainId,
    });

    return domainId;
  },
});

export const getDomainDetails = query({
  args: {
    domain: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("domain")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();
  },
});

export const setVerificationCode = internalMutation({
  args: {
    domainId: v.id("domain"),
    verificationCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.domainId, {
      ownershipVerificationCode: args.verificationCode,
    });
  },
});

async function initializeDomainVerification(
  ctx: any,
  domainId: any,
  rootDomain: string,
  freestyle: FreestyleSandboxes,
): Promise<void> {
  const ownershipProvedDomains = await freestyle.listDomains();
  const isAlreadyVerified = ownershipProvedDomains.some(
    (d: { domain: string }) => d.domain === rootDomain,
  );

  if (isAlreadyVerified) {
    await ctx.runMutation(internal.domains.setDomainState, {
      domainId,
      ownershipVerified: true,
    });
  } else {
    const result = await freestyle.createDomainVerificationRequest(rootDomain);

    await ctx.runMutation(internal.domains.setVerificationCode, {
      domainId,
      verificationCode: result.verificationCode,
    });
  }
}

export const listAllWithRoot = internalQuery({
  args: {
    rootDomain: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("domain")
      .withIndex("by_rootDomain", (q) => q.eq("rootDomain", args.rootDomain))
      .collect();
  },
});

export const registerDomainAndGetVerificationCode = action({
  args: {
    projectId: v.id("project"),
    domain: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Resilient server-side check: SDK + REST API fallback for infrastructure-cost protection
    const featureResult = await requireFeatureAccess(
      ctx,
      BOOLEAN_FEATURE_IDS.CUSTOM_DOMAINS,
    );
    if (!featureResult.success) {
      throw new Error(featureResult.message);
    }

    const existingDomain = await ctx.runQuery(api.domains.getDomainDetails, {
      domain: args.domain,
    });

    if (existingDomain) {
      throw new Error("Domain already exists");
    }

    const domainId = await ctx.runMutation(internal.domains.create, {
      domain: args.domain,
      projectId: args.projectId,
    });

    const freestyle = new FreestyleSandboxes({
      apiKey: process.env.FREESTYLE_API_KEY!,
    });

    const rootDomain = getRootDomain(args.domain);
    await initializeDomainVerification(ctx, domainId, rootDomain, freestyle);

    await ctx.runAction(api.domains.verifyAll, { domain: args.domain });
  },
});

function buildDomainStateFlags(args: {
  ownershipVerified?: boolean;
  wildcardCertGenerated?: boolean;
  pointingVerified?: boolean;
}) {
  return Object.fromEntries(
    Object.entries({
      ownership_verified: args.ownershipVerified,
      wildcard_cert_generated: args.wildcardCertGenerated,
      pointing_verified: args.pointingVerified,
    }).filter(([_key, value]) => value !== undefined),
  );
}

export const setDomainState = internalMutation({
  args: {
    domainId: v.id("domain"),
    ownershipVerified: v.optional(v.boolean()),
    wildcardCertGenerated: v.optional(v.boolean()),
    pointingVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const flags = buildDomainStateFlags({
      ownershipVerified: args.ownershipVerified,
      wildcardCertGenerated: args.wildcardCertGenerated,
      pointingVerified: args.pointingVerified,
    });

    await ctx.db.patch(args.domainId, flags);
  },
});

export const checkVerification = action({
  args: {
    domain: v.string(),
  },
  handler: async (ctx, args): Promise<SuccessOrError> => {
    const domainDetails = await ctx.runQuery(api.domains.getDomainDetails, {
      domain: args.domain,
    });

    if (!domainDetails) {
      throw new Error("Domain not found");
    }

    const freestyle = new FreestyleSandboxes({
      apiKey: process.env.FREESTYLE_API_KEY!,
    });

    try {
      const result = await freestyle.verifyDomain(getRootDomain(args.domain));
      if ("domain" in result) {
        return { success: true };
      } else {
        console.error("Domain verification returned error", result.message);
        return { success: false, message: result.message };
      }
    } catch (err) {
      console.error("Failed to verify domain");
      throw err;
    }
  },
});

export const generateCert = action({
  args: {
    domain: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: true } | { success: false; message: string }> => {
    const freestyle = new FreestyleSandboxes({
      apiKey: process.env.FREESTYLE_API_KEY!,
    });

    const rootDomain = getRootDomain(args.domain);

    console.log("rootDomain", rootDomain);

    const result = (await freestyle.provisionWildcard(rootDomain)) as
      | HandleVerifyWildcardResponse
      | HandleVerifyWildcardError;

    console.log("cert result", result);

    if ("message" in result) {
      return {
        success: false,
        message: result.message,
      };
    } else {
      return {
        success: true,
      };
    }
  },
});

async function fetchDnsRecords(domain: string): Promise<DnsResponse> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}`;
  const options = {
    method: "GET",
    headers: { Accept: "application/dns-json" },
  };

  const result = await fetch(url, options);
  if (result.status !== 200) {
    console.error("Failed to fetch DNS records", await result.text());
    throw new Error("Failed to fetch DNS records");
  }

  return await result.json();
}

function checkDnsRecords(domain: string, dnsAnswers: DnsAnswer[]): boolean {
  const isRootDomain = getRootDomain(domain) === domain;

  if (isRootDomain) {
    return dnsAnswers.some(
      (answer) =>
        answer.data === DNS_CONFIG.A_RECORD_IP &&
        answer.type === DNS_RECORD_TYPES.A,
    );
  } else {
    return dnsAnswers.some(
      (answer) =>
        DNS_CONFIG.CNAME_TARGETS.includes(answer.data) &&
        answer.type === DNS_RECORD_TYPES.CNAME,
    );
  }
}

export const verifyPointing = internalAction({
  args: {
    domain: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      const response = await fetchDnsRecords(args.domain);
      console.log("DNS response", response);

      if (!response.Answer) {
        return {
          success: false,
          message: "No DNS answer found",
        };
      }

      const pointingCorrectly = checkDnsRecords(args.domain, response.Answer);

      return {
        success: pointingCorrectly,
        ...(pointingCorrectly
          ? {}
          : { message: "DNS pointing is not correctly configured" }),
      };
    } catch (error) {
      console.error("DNS verification error:", error);
      return {
        success: false,
        message: "Failed to verify DNS pointing",
      };
    }
  },
});

export const getProjectIdFromDomain = internalQuery({
  args: {
    domainId: v.id("domain"),
  },
  handler: async (ctx, args) => {
    const domainProject = await ctx.db
      .query("project_domain")
      .withIndex("by_domain", (q) => q.eq("domainId", args.domainId))
      .first();

    return domainProject?.projectId;
  },
});

export const deleteDomain = action({
  args: {
    domain: v.string(),
  },
  handler: async (ctx, args): Promise<SuccessOrError> => {
    // Feature access is enforced client-side via useFeatureAccess hook.
    // Server-side autumn.check() was incorrectly blocking paying users
    // due to Autumn API sync issues, so the hard gate was removed here.

    try {
      const domainDetails = await ctx.runQuery(api.domains.getDomainDetails, {
        domain: args.domain,
      });

      if (!domainDetails) {
        return {
          success: false,
          message: "Domain not found",
        };
      }

      // Check if domain is verified
      const isFullyVerified =
        domainDetails.ownership_verified &&
        domainDetails.wildcard_cert_generated &&
        domainDetails.pointing_verified;

      // If verified, unmap from Freestyle first
      if (isFullyVerified) {
        console.log(
          `[DEBUG] Unmapping verified domain ${args.domain} from Freestyle`,
        );

        try {
          const response = await fetch(
            `https://api.freestyle.sh/domains/v1/mappings/${encodeURIComponent(args.domain.toLowerCase())}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${process.env.FREESTYLE_API_KEY}`,
                "Content-Type": "application/json",
              },
            },
          );

          const text = await response.text();
          console.log(`[DEBUG] Unmap result status: ${response.status}`);

          // Allow 200 or 404 (already unmapped)
          if (response.status !== 200 && response.status !== 404) {
            console.error(
              `[DEBUG] Failed to unmap domain. Status: ${response.status}, Response: ${text}`,
            );
            return {
              success: false,
              message: `Failed to unmap domain from Freestyle: ${text || "Unknown error"}`,
            };
          }
        } catch (error) {
          console.error("Failed to call Freestyle API:", error);
          return {
            success: false,
            message: "Failed to unmap domain from Freestyle",
          };
        }
      }

      // TODO: Clean up any external records (DNS, Freestyle, etc.)
      // - Remove DNS verification records
      // - Cancel any pending verification requests
      // - Clean up any partial certificate generation

      // Delete from database
      await ctx.runMutation(internal.domains.removeDomain, {
        domainId: domainDetails._id,
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to delete domain:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete domain",
      };
    }
  },
});

export const removeDomain = internalMutation({
  args: {
    domainId: v.id("domain"),
  },
  handler: async (ctx, args) => {
    // Delete the project_domain relationship first
    const projectDomain = await ctx.db
      .query("project_domain")
      .withIndex("by_domain", (q) => q.eq("domainId", args.domainId))
      .first();

    if (projectDomain) {
      await ctx.db.delete(projectDomain._id);
    }

    // Delete the domain itself
    await ctx.db.delete(args.domainId);
  },
});
async function callFreestyleDomainApi(
  domain: string,
  deploymentId: string,
): Promise<{ status: number; text: string }> {
  const response = await fetch(
    `https://api.freestyle.sh/domains/v1/mappings/${encodeURIComponent(domain.toLowerCase())}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FREESTYLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deploymentId }),
    },
  );

  const text = await response.text();
  return { status: response.status, text };
}

export const pointDomainToDeployment = action({
  args: {
    domain: v.string(),
    freestyleDeploymentId: v.string(),
  },
  handler: async (ctx, args): Promise<SuccessOrError> => {
    // Feature access is enforced client-side via useFeatureAccess hook.
    // Server-side autumn.check() was incorrectly blocking paying users
    // due to Autumn API sync issues, so the hard gate was removed here.

    console.log(
      "[DEBUG] Pointing domain",
      args.domain,
      "to deployment",
      args.freestyleDeploymentId,
    );

    try {
      const result = await callFreestyleDomainApi(
        args.domain,
        args.freestyleDeploymentId,
      );

      console.log("[DEBUG] Freestyle API response status:", result.status);

      if (result.status === 200) {
        console.log("[DEBUG] Successfully pointed domain to deployment");
        return { success: true };
      }

      console.error(
        "[DEBUG] Failed to point domain. Status:",
        result.status,
        "Response:",
        result.text,
      );

      return {
        success: false,
        message: result.text || "Failed to point domain to deployment",
      };
    } catch (error) {
      console.error("[DEBUG] Error in pointDomainToDeployment:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

async function verifyOwnership(
  ctx: any,
  domain: string,
  domainId: any,
): Promise<boolean> {
  try {
    const freestyle = new FreestyleSandboxes({
      apiKey: process.env.FREESTYLE_API_KEY!,
    });

    const registeredDomains = await freestyle.listDomains();
    const isAlreadyRegistered = registeredDomains.some(
      (d: { domain: string }) => d.domain === domain,
    );

    if (isAlreadyRegistered) {
      await ctx.runMutation(internal.domains.setDomainState, {
        domainId,
        ownershipVerified: true,
      });
      return true;
    }

    const verificationResult = await ctx.runAction(
      api.domains.checkVerification,
      { domain },
    );

    if (verificationResult.success) {
      await ctx.runMutation(internal.domains.setDomainState, {
        domainId,
        ownershipVerified: true,
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("Ownership verification failed:", error);
    return false;
  }
}

async function generateWildcardCert(
  ctx: any,
  domain: string,
  domainId: any,
): Promise<boolean> {
  try {
    console.debug("Generating wildcard cert for", domain);
    const result = await ctx.runAction(api.domains.generateCert, { domain });

    console.debug("Wildcard cert generation result:", result);

    if (result.success) {
      await ctx.runMutation(internal.domains.setDomainState, {
        domainId,
        wildcardCertGenerated: true,
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("Wildcard cert generation failed:", error);
    return false;
  }
}

async function verifyDnsPointing(
  ctx: any,
  domain: string,
  domainId: any,
): Promise<boolean> {
  try {
    const result = await ctx.runAction(internal.domains.verifyPointing, {
      domain,
    });

    if (result.success) {
      await ctx.runMutation(internal.domains.setDomainState, {
        domainId,
        pointingVerified: true,
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("Pointing verification failed:", error);
    return false;
  }
}

async function pointToLatestDeployment(
  ctx: any,
  domain: string,
  domainId: any,
): Promise<SuccessOrError> {
  const projectId = await ctx.runQuery(
    internal.domains.getProjectIdFromDomain,
    { domainId },
  );

  if (!projectId) {
    return {
      success: false,
      message: "Domain not found in any project",
    };
  }

  const latestDeployment = await ctx.runQuery(
    api.deployment.getLatestActiveDeployment,
    { projectId },
  );

  console.log("latestDeployment", latestDeployment);

  if (!latestDeployment?.freestyleDeploymentId) {
    return {
      success: false,
      message: "No active deployment found",
    };
  }

  await ctx.runAction(api.domains.pointDomainToDeployment, {
    domain,
    freestyleDeploymentId: latestDeployment.freestyleDeploymentId,
  });

  console.log("Successfully pointed domain to deployment");
  return { success: true };
}

export const verifyAll = action({
  args: {
    domain: v.string(),
  },
  handler: async (ctx, args): Promise<SuccessOrError> => {
    try {
      const domainDetails = await ctx.runQuery(api.domains.getDomainDetails, {
        domain: args.domain,
      });

      if (!domainDetails) {
        return {
          success: false,
          message: "Domain not found",
        };
      }

      const matchingRootDomain = await ctx.runQuery(
        internal.domains.listAllWithRoot,
        {
          rootDomain: getRootDomain(args.domain),
        },
      );

      /**
       * Wildcard certs are generated for the root domain and used for all
       * subdomains. So, if any other domain with the same root domain has a
       * wildcard cert generated, we can skip re-generating it.
       */
      if (matchingRootDomain.some((d: any) => d.wildcard_cert_generated)) {
        domainDetails.wildcard_cert_generated = true;
        await ctx.runMutation(internal.domains.setDomainState, {
          domainId: domainDetails._id,
          wildcardCertGenerated: true,
        });
      }

      // Check if all verifications are already complete
      const isAlreadyVerified =
        domainDetails.ownership_verified &&
        domainDetails.wildcard_cert_generated &&
        domainDetails.pointing_verified;

      if (isAlreadyVerified) {
        console.log(
          "Domain already fully verified, pointing to latest deployment",
        );
        return await pointToLatestDeployment(
          ctx,
          args.domain,
          domainDetails._id,
        );
      }

      // Perform verification checks only for incomplete steps
      const verificationResults = {
        ownership:
          domainDetails.ownership_verified ||
          (await verifyOwnership(ctx, args.domain, domainDetails._id)),
        wildcardCert:
          domainDetails.wildcard_cert_generated ||
          (await generateWildcardCert(ctx, args.domain, domainDetails._id)),
        dnsPointing:
          domainDetails.pointing_verified ||
          (await verifyDnsPointing(ctx, args.domain, domainDetails._id)),
      };

      const allVerified = Object.values(verificationResults).every(
        (result) => result === true,
      );

      if (!allVerified) {
        const failedSteps = Object.entries(verificationResults)
          .filter(([_step, success]) => !success)
          .map(([step]) => step);

        return {
          success: false,
          message: `Verification failed for: ${failedSteps.join(", ")}`,
        };
      }

      console.log("All verifications passed, updating domain pointers");
      return await pointToLatestDeployment(ctx, args.domain, domainDetails._id);
    } catch (error) {
      console.error("Domain verification failed:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Domain verification failed",
      };
    }
  },
});
