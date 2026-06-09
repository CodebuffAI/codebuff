import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useConvex, useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Github,
  XCircle,
  X,
  Loader,
  Globe,
} from "lucide-react";
import { useCallback, useState } from "react";
import { DeleteDeploymentButton } from "./DeleteDeploymentButton";
import { UpdateDeploymentSlugDialog } from "./UpdateDeploymentSlugDialog";
import { useCustomer } from "@/vly/lib/billing-disabled-react";
import { getActivePlan } from "@/vly/lib/billing";
import { freePlan } from "@/autumn.config";

export const DeployManager = ({
  projectId,
  onSwitchToDomains,
  onDeployTriggered,
}: {
  projectId: string;
  onSwitchToDomains?: () => void;
  onDeployTriggered?: () => void;
}) => {
  const projectDeployments = useQuery(api.deployment.getProjectDeployments, {
    projectId: projectId as Id<"project">,
  });

  return (
    <div className="min-h-0">
      {(!projectDeployments || projectDeployments.length === 0) && (
        <FirstDeploymentView
          projectId={projectId}
          onSwitchToDomains={onSwitchToDomains}
          onDeployTriggered={onDeployTriggered}
        />
      )}

      {projectDeployments && projectDeployments.length > 0 && (
        <DeploymentManager
          projectId={projectId}
          deployments={projectDeployments}
          onDeployTriggered={onDeployTriggered}
        />
      )}
    </div>
  );
};

const FirstDeploymentView = ({
  projectId,
  onSwitchToDomains,
  onDeployTriggered,
}: {
  projectId: string;
  onSwitchToDomains?: () => void;
  onDeployTriggered?: () => void;
}) => {
  const [slug, setSlug] = useState("");
  const { customer } = useCustomer();

  const convex = useConvex();

  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);

  // Check if user is on Free plan
  const isOnFreePlan = () => {
    if (!customer?.products) return true; // Default to free if no products
    const { planId } = getActivePlan(customer.products, customer, freePlan.id);
    return planId === freePlan.id;
  };

  const validateSlug = (input: string) => {
    return input.toLowerCase().replace(/[^a-z0-9]/g, ""); // only lowercase letters and numbers
  };

  // Check if slug is valid for deployment (must start with a letter)
  const isSlugFormatValid = slug.length > 0 && /^[a-z]/.test(slug);

  const checkIfDomainValid = async (domain: string) => {
    if (!slug.trim()) {
      return;
    }
    console.log("Checking if domain is valid", domain);
    setIsSlugAvailable(null);

    const result = await convex.query(api.deployment.checkIfSlugAvailable, {
      slug: domain,
    });

    setIsSlugAvailable(result);
  };

  const deploy = useMutation(api.deployment.createDeployment);

  const [isDeploying, setIsDeploying] = useState(false);

  const handleDeploy = useCallback(async () => {
    setIsDeploying(true);
    const result = await deploy({
      projectId: projectId as Id<"project">,
      slug: slug,
    });
    console.log("deploy result", result);
    setIsDeploying(false);

    // Notify parent that deploy was triggered (for community publishing)
    if (onDeployTriggered) {
      onDeployTriggered();
    }
  }, [deploy, projectId, slug, onDeployTriggered]);

  return (
    <div className="space-y-3">
      <span className="text-sm font-medium text-muted-foreground">Domain</span>

      <div className="flex items-center">
        <Input
          placeholder="myapp"
          className="rounded-r-none border-border bg-background text-right font-mono text-sm text-foreground"
          disabled={isDeploying}
          value={slug}
          onChange={(e) => {
            const validatedSlug = validateSlug(e.target.value.trim());
            setSlug(validatedSlug);

            // TODO: debounce this
            checkIfDomainValid(validatedSlug);
          }}
        />
        <div className="flex h-9 items-center rounded-r-md border border-l-0 border-border bg-muted/40 pl-2 pr-2 font-mono text-sm text-muted-foreground">
          .freebuff.app
        </div>
      </div>
      <div className="min-h-5">
        {slug && !isSlugFormatValid && (
          <span className="text-sm font-bold text-red-500">
            Must start with a letter
          </span>
        )}
        {slug && isSlugFormatValid && isSlugAvailable === null && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader className="h-2 w-2 animate-spin" /> Checking...
          </span>
        )}
        {slug && isSlugFormatValid && isSlugAvailable === false && (
          <span className="text-sm font-bold text-red-500">
            Domain not available
          </span>
        )}
        {slug && isSlugFormatValid && isSlugAvailable === true && (
          <span className="text-sm font-bold text-green-500">
            Domain available
          </span>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {isOnFreePlan() && (
          <Button
            variant="outline"
            onClick={() => {
              if (onSwitchToDomains) {
                onSwitchToDomains();
              }
            }}
          >
            Add custom domain
          </Button>
        )}
        <Button
          disabled={
            !isSlugAvailable ||
            !isSlugFormatValid ||
            !slug.trim() ||
            isDeploying
          }
          onClick={handleDeploy}
          variant="default"
        >
          {!isDeploying && "Deploy"}
          {isDeploying && (
            <div className="flex items-center gap-2">
              <Loader className="h-2 w-2 animate-spin" /> Deploying...
            </div>
          )}
        </Button>
      </div>
    </div>
  );
};

const DeploymentManager = ({
  projectId,
  deployments,
  onDeployTriggered,
}: {
  projectId: string;
  deployments: FunctionReturnType<typeof api.deployment.getProjectDeployments>;
  onDeployTriggered?: () => void;
}) => {
  const prodSlug = useQuery(api.project.getProdDeploymentSlug, {
    projectId: projectId as Id<"project">,
  });

  const activeProjectDomains = useQuery(api.project.getActiveProjectDomains, {
    projectId: projectId as Id<"project">,
  });

  const unresolvedBuildErrors = useQuery(
    api.build_errors.getUnresolvedBuildErrors,
    {
      projectId: projectId as Id<"project">,
    },
  );

  // Check if project is published to community for showing listing link
  const communityPost = useQuery(api.community.getPostByProject, {
    projectId: projectId as Id<"project">,
  });
  const hasActiveDeployment = deployments.some((d) => d.state === "active");

  const redeploy = useMutation(
    api.deployment.createDeployment,
  ).withOptimisticUpdate((localStore, args) => {
    const { projectId } = args;

    const existingDeployments = localStore.getQuery(
      api.deployment.getProjectDeployments,
      {
        projectId,
      },
    );

    if (existingDeployments !== undefined) {
      localStore.setQuery(api.deployment.getProjectDeployments, { projectId }, [
        ...existingDeployments,
        {
          _id: crypto.randomUUID() as Id<"deployments">,
          project: projectId,
          state: "deploying",
          _creationTime: Date.now(),
        },
      ]);
    }
  });
  const [isRedeploying, setIsRedeploying] = useState(false);

  const cancelDeployment = useMutation(
    api.deployment.cancelDeployment,
  ).withOptimisticUpdate((localStore, args) => {
    const { deploymentId } = args;

    const projectDeployments = localStore.getQuery(
      api.deployment.getProjectDeployments,
      {
        projectId: projectId as Id<"project">,
      },
    );

    if (projectDeployments !== undefined) {
      const updatedDeployments = projectDeployments.map((d) =>
        d._id === deploymentId
          ? {
              ...d,
              state: "cancelled" as const,
              deploy_status_text: "Deployment cancelled",
            }
          : d,
      );
      localStore.setQuery(
        api.deployment.getProjectDeployments,
        { projectId: projectId as Id<"project"> },
        updatedDeployments,
      );
    }
  });

  const handleRedeploy = useCallback(async () => {
    if (!prodSlug || isRedeploying) {
      return;
    }

    setIsRedeploying(true);
    try {
      await redeploy({
        projectId: projectId as Id<"project">,
        slug: prodSlug,
      });

      // Notify parent that deploy was triggered (for community publishing)
      if (onDeployTriggered) {
        onDeployTriggered();
      }
    } finally {
      setIsRedeploying(false);
    }
  }, [isRedeploying, onDeployTriggered, prodSlug, projectId, redeploy]);

  const isAnotherDeploymentRunning = deployments.some(
    (deployment) =>
      deployment.state === "deploying" || deployment.state === "cancelling",
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Latest deployment</span>
        <Button
          disabled={!prodSlug || isRedeploying || isAnotherDeploymentRunning}
          onClick={handleRedeploy}
          variant="default"
          size="sm"
        >
          {isRedeploying ? (
            <div className="flex items-center gap-2">
              <Loader className="animate-spin" /> Redeploying...
            </div>
          ) : (
            <span>Redeploy</span>
          )}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {deployments.map((deployment) => (
          <div
            className="flex flex-col rounded-md border border-border/70 bg-muted/20 p-3"
            key={deployment._id}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {deployment.state === "active" && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {deployment.state === "deploying" && (
                  <Loader className="h-4 w-4 animate-spin" />
                )}
                {deployment.state === "cancelling" && (
                  <Loader className="h-4 w-4 animate-spin text-orange-500" />
                )}
                {deployment.state === "cancelled" && (
                  <X className="h-4 w-4 text-orange-500" />
                )}
                {deployment.state === "error" && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                {deployment.state === "obsolete" && (
                  <XCircle className="h-4 w-4 text-neutral-400" />
                )}
                <span className="font-mono text-sm font-semibold text-foreground">
                  {deployment._id.trim().slice(0, 8)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* Cancel button for deploying deployments */}
                {deployment.state === "deploying" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      cancelDeployment({ deploymentId: deployment._id })
                    }
                    className="flex items-center gap-1 text-orange-600 hover:text-orange-700"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </Button>
                )}

                {/* Edit and Delete buttons for active deployments */}
                {deployment.state === "active" && (
                  <>
                    <UpdateDeploymentSlugDialog
                      deploymentId={deployment._id}
                      currentDomain={deployment.deploymentDomain || ""}
                      onUpdated={() => {
                        // Refresh deployments on successful update
                      }}
                    />
                    <DeleteDeploymentButton
                      deploymentId={deployment._id}
                      domain={deployment.deploymentDomain || ""}
                      onDeleted={() => {
                        // Refresh deployments on successful delete
                      }}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-col gap-1 sm:ml-6">
              {deployment.state === "active" && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {[
                    ...(activeProjectDomains ?? []),
                    { domain: `${prodSlug}.freebuff.app`, _id: "freebuff-site" },
                  ].map((domain) => (
                    <a
                      href={`https://${domain.domain}`}
                      target="_blank"
                      key={domain._id}
                      className="flex min-w-0 items-center gap-1 break-all text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary"
                    >
                      {domain.domain} <ExternalLink className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              )}

              <span className="text-sm text-muted-foreground">
                {deployment.state === "deploying" ? (
                  <span className="animate-pulse">
                    {deployment.deploy_status_text}
                  </span>
                ) : deployment.state === "active" ? (
                  <>
                    Deployed{" "}
                    {new Date(deployment._creationTime).toLocaleString()}
                  </>
                ) : deployment.state === "cancelling" ? (
                  <span className="animate-pulse text-orange-500">
                    Cancelling deployment...
                  </span>
                ) : deployment.state === "cancelled" ? (
                  <span className="text-orange-500">Deployment cancelled</span>
                ) : deployment.state === "error" ? (
                  <span className="text-red-500">Deployment failed</span>
                ) : deployment.state === "obsolete" ? (
                  <span>Superseded by a newer deployment</span>
                ) : (
                  <span>{deployment.state}</span>
                )}
              </span>

              {deployment.state === "active" &&
                deployment.deploy_status_text && (
                  <div className="mt-1 flex items-start gap-1 text-xs text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{deployment.deploy_status_text}</span>
                  </div>
                )}

              {/* GitHub Deployment Status */}
              {deployment.github_deployment_id && (
                <div className="mt-1 flex items-center gap-2">
                  <Github className="h-3 w-3 text-gray-500" />
                  <span className="text-xs text-gray-500">
                    GitHub: {deployment.github_deployment_id}
                  </span>
                  {deployment.github_deployment_url && (
                    <a
                      href={deployment.github_deployment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Build error indicator */}
        {unresolvedBuildErrors && unresolvedBuildErrors.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-200">
                Build errors detected
              </span>
            </div>
            <p className="mb-2 text-xs text-amber-100/80">
              {unresolvedBuildErrors.length} unresolved build error
              {unresolvedBuildErrors.length > 1 ? "s" : ""} found. These can
              be automatically fixed by the AI agent.
            </p>
            <p className="text-xs font-medium text-amber-100/80">
              Check the chat panel for error details and click "Fix" to resolve
              them.
            </p>
          </div>
        )}

        {/* Compact listing link - shows after successful deployment AND published to community */}
        {hasActiveDeployment && communityPost && (
          <button
            onClick={() =>
              window.open(`/web/community/project/${communityPost._id}`, "_blank")
            }
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Globe className="h-3.5 w-3.5" />
            View Community Listing
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};
