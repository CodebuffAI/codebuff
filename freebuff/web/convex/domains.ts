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
  A_RECORD_IP: "76.76.21.21",
  CNAME_TARGETS: [
    "cname.vercel-dns.com.",
    "cname.vercel-dns.com",
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
      wildcard_cert_generated: true,
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
  domain: string,
  vercelProjectId: string,
): Promise<void> {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${vercelProjectId}/domains?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    },
  );

  const data = await response.json();

  if (data.verified) {
    await ctx.runMutation(internal.domains.setDomainState, {
      domainId,
      ownershipVerified: true,
    });
  } else if (data.verification) {
    const txtRecord = data.verification.find(
      (v: { type: string }) => v.type === "TXT",
    );
    if (txtRecord) {
      await ctx.runMutation(internal.domains.setVerificationCode, {
        domainId,
        verificationCode: txtRecord.value,
      });
    }
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

    // Get the Vercel project ID from the latest active deployment
    const latestDeployment = await ctx.runQuery(
      api.deployment.getLatestActiveDeployment,
      { projectId: args.projectId },
    );
    const vercelProjectId = latestDeployment?.freestyleDeploymentId;

    if (vercelProjectId) {
      await initializeDomainVerification(
        ctx,
        domainId,
        args.domain,
        vercelProjectId,
      );
    }

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

    const projectId = await ctx.runQuery(
      internal.domains.getProjectIdFromDomain,
      { domainId: domainDetails._id },
    );

    if (!projectId) {
      return { success: false, message: "Domain not linked to a project" };
    }

    const latestDeployment = await ctx.runQuery(
      api.deployment.getLatestActiveDeployment,
      { projectId },
    );

    const vercelProjectId = latestDeployment?.freestyleDeploymentId;

    if (!vercelProjectId) {
      return { success: false, message: "No Vercel project found" };
    }

    const vercelToken = process.env.VERCEL_API_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    try {
      const response = await fetch(
        `https://api.vercel.com/v10/projects/${vercelProjectId}/domains/${encodeURIComponent(args.domain)}/verify?teamId=${teamId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${vercelToken}` },
        },
      );

      const data = await response.json();

      if (data.verified) {
        return { success: true };
      } else {
        return {
          success: false,
          message: "Domain not yet verified. Please check your DNS records.",
        };
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
    _ctx,
    _args,
  ): Promise<{ success: true } | { success: false; message: string }> => {
    // Vercel auto-provisions SSL certificates — no manual cert generation needed
    return { success: true };
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

async function getVercelDomainConfigErrors(
  vercelProjectId: string,
  domain: string,
): Promise<string | null> {
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  try {
    const response = await fetch(
      `https://api.vercel.com/v10/projects/${vercelProjectId}/domains/${encodeURIComponent(domain)}?teamId=${teamId}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (!data.misconfigured) return null;

    // Vercel returns conflicts and required records in the config response
    // Build a user-friendly message
    const parts: string[] = [];

    if (data.conflicts && data.conflicts.length > 0) {
      const conflictList = data.conflicts
        .map(
          (c: { type: string; name: string; value: string }) =>
            `${c.type} record "${c.name}" → ${c.value}`,
        )
        .join(", ");
      parts.push(`Remove conflicting DNS records: ${conflictList}`);
    }

    if (data.intended) {
      parts.push(
        `Set ${data.intended.type} record for "${data.intended.name || "@"}" → ${data.intended.value}`,
      );
    }

    return parts.length > 0
      ? parts.join(". ") + "."
      : "Domain is misconfigured. Check your DNS settings in your domain provider.";
  } catch {
    return null;
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
        domainDetails.ownership_verified && domainDetails.pointing_verified;

      // If verified, remove from Vercel first
      if (isFullyVerified) {
        console.log(
          `[DEBUG] Removing verified domain ${args.domain} from Vercel`,
        );

        try {
          const projectId = await ctx.runQuery(
            internal.domains.getProjectIdFromDomain,
            { domainId: domainDetails._id },
          );

          if (projectId) {
            const vercelToken = process.env.VERCEL_API_TOKEN;
            const teamId = process.env.VERCEL_TEAM_ID;

            const latestDeployment = await ctx.runQuery(
              api.deployment.getLatestActiveDeployment,
              { projectId },
            );

            let vercelProjectId =
              latestDeployment?.freestyleDeploymentId || null;

            // Verify stored ID, fall back to slug lookup
            if (vercelProjectId) {
              const checkResponse = await fetch(
                `https://api.vercel.com/v9/projects/${encodeURIComponent(vercelProjectId)}?teamId=${teamId}`,
                { headers: { Authorization: `Bearer ${vercelToken}` } },
              );
              if (!checkResponse.ok) vercelProjectId = null;
            }

            if (!vercelProjectId) {
              const project: any = await ctx.runQuery(
                internal.project.getProject,
                { projectId },
              );
              if (project?.prod_deployment_slug) {
                const lookupResponse = await fetch(
                  `https://api.vercel.com/v9/projects/${encodeURIComponent(project.prod_deployment_slug)}?teamId=${teamId}`,
                  { headers: { Authorization: `Bearer ${vercelToken}` } },
                );
                if (lookupResponse.ok) {
                  const data = await lookupResponse.json();
                  vercelProjectId = data.id;
                }
              }
            }

            if (vercelProjectId) {
              const response = await fetch(
                `https://api.vercel.com/v10/projects/${vercelProjectId}/domains/${encodeURIComponent(args.domain.toLowerCase())}?teamId=${teamId}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${vercelToken}`,
                  },
                },
              );

              console.log(
                `[DEBUG] Vercel domain removal status: ${response.status}`,
              );

              if (!response.ok && response.status !== 404) {
                const text = await response.text();
                console.error(
                  `[DEBUG] Failed to remove domain. Status: ${response.status}, Response: ${text}`,
                );
                return {
                  success: false,
                  message: `Failed to remove domain from Vercel: ${text || "Unknown error"}`,
                };
              }
            }
          }
        } catch (error) {
          console.error("Failed to call Vercel API:", error);
          return {
            success: false,
            message: "Failed to remove domain from Vercel",
          };
        }
      }

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
export const pointDomainToDeployment = action({
  args: {
    domain: v.string(),
    freestyleDeploymentId: v.string(),
  },
  handler: async (ctx, args): Promise<SuccessOrError> => {
    console.log(
      "[DEBUG] Pointing domain",
      args.domain,
      "to Vercel project",
      args.freestyleDeploymentId,
    );

    try {
      const vercelToken = process.env.VERCEL_API_TOKEN;
      const teamId = process.env.VERCEL_TEAM_ID;

      // Resolve Vercel project ID: verify stored ID, fall back to slug lookup
      let vercelProjectId: string | null = args.freestyleDeploymentId;

      const checkResponse = await fetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(vercelProjectId)}?teamId=${teamId}`,
        { headers: { Authorization: `Bearer ${vercelToken}` } },
      );

      if (!checkResponse.ok) {
        console.log(
          `[DEBUG] Stored ID ${vercelProjectId} not found on Vercel, looking up by domain`,
        );
        vercelProjectId = null;

        // Find project slug from domain table → project → prod_deployment_slug
        const domainDetails = await ctx.runQuery(api.domains.getDomainDetails, {
          domain: args.domain,
        });
        if (domainDetails) {
          const projectId = await ctx.runQuery(
            internal.domains.getProjectIdFromDomain,
            { domainId: domainDetails._id },
          );
          if (projectId) {
            const project: any = await ctx.runQuery(
              internal.project.getProject,
              { projectId },
            );
            if (project?.prod_deployment_slug) {
              const lookupResponse = await fetch(
                `https://api.vercel.com/v9/projects/${encodeURIComponent(project.prod_deployment_slug)}?teamId=${teamId}`,
                { headers: { Authorization: `Bearer ${vercelToken}` } },
              );
              if (lookupResponse.ok) {
                const projectData = await lookupResponse.json();
                vercelProjectId = projectData.id;
                console.log(
                  `[DEBUG] Found Vercel project by slug ${project.prod_deployment_slug}: ${vercelProjectId}`,
                );
              }
            }
          }
        }
      }

      if (!vercelProjectId) {
        return {
          success: false,
          message: "Could not find Vercel project for this deployment",
        };
      }

      const response = await fetch(
        `https://api.vercel.com/v10/projects/${vercelProjectId}/domains?teamId=${teamId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: args.domain }),
        },
      );

      if (response.ok || response.status === 409) {
        console.log("[DEBUG] Successfully pointed domain to Vercel project");
        return { success: true };
      }

      const text = await response.text();
      console.error(
        "[DEBUG] Failed to point domain. Status:",
        response.status,
        "Response:",
        text,
      );

      return {
        success: false,
        message: text || "Failed to point domain to deployment",
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
  _domain: string,
  domainId: any,
): Promise<boolean> {
  // Vercel auto-provisions SSL — always mark as generated
  await ctx.runMutation(internal.domains.setDomainState, {
    domainId,
    wildcardCertGenerated: true,
  });
  return true;
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
    freestyleDeploymentId: latestDeployment.freestyleDeploymentId, // now stores Vercel project ID
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

      // Check if all verifications are already complete
      // Vercel handles SSL automatically, so wildcard_cert is always true
      const isAlreadyVerified =
        domainDetails.ownership_verified && domainDetails.pointing_verified;

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

        // Try to get specific DNS config errors from Vercel
        let configError: string | null = null;
        try {
          const projectId = await ctx.runQuery(
            internal.domains.getProjectIdFromDomain,
            { domainId: domainDetails._id },
          );
          if (projectId) {
            const latestDeployment = await ctx.runQuery(
              api.deployment.getLatestActiveDeployment,
              { projectId },
            );
            const vercelProjId = latestDeployment?.freestyleDeploymentId;
            if (vercelProjId) {
              configError = await getVercelDomainConfigErrors(
                vercelProjId,
                args.domain,
              );
            }
          }
        } catch {
          // Best-effort — fall back to generic message
        }

        return {
          success: false,
          message:
            configError ||
            `Verification failed for: ${failedSteps.join(", ")}. Check your DNS records.`,
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
