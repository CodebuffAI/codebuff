import { NewDomainWorkflow, NewDomainWorkflowPage } from "./NewDomainWorkflow";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { CheckCircle, ChevronRight, PlusCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FeatureGate, UpgradePrompt } from "@/components/billing/FeatureGate";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const DomainManager = ({ projectId }: { projectId: Id<"project"> }) => {
  const domains = useQuery(api.project.getProjectDomains, {
    projectId: projectId,
  });

  const latestDeployment = useQuery(api.deployment.getLatestActiveDeployment, {
    projectId: projectId,
  });

  const deleteDomain = useAction(api.domains.deleteDomain);

  // Check feature access for custom domains
  const { hasAccess: _hasCustomDomainAccess, isLoading: _isAccessLoading } =
    useFeatureAccess("custom_domains");

  const fullyVerified = (d: Doc<"domain">) =>
    d.ownership_verified && d.wildcard_cert_generated && d.pointing_verified;

  const [addDomainConfirmation, setAddDomainConfirmation] = useState<{
    domain: string;
    page: NewDomainWorkflowPage;
  } | null>(null);

  const [domainToDelete, setDomainToDelete] = useState<Doc<"domain"> | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFinishSetup = (d: Doc<"domain">) => {
    setAddDomainConfirmation({
      domain: d.domain,
      page: "set-records",
    });
  };

  const handleDeleteDomain = async () => {
    if (!domainToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteDomain({ domain: domainToDelete.domain });
      if (result.success) {
        toast.success("Domain deleted successfully");
        setDomainToDelete(null);
      } else {
        toast.error(result.message || "Failed to delete domain");
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to delete domain");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-full">
      {!addDomainConfirmation && (
        <>
          <div className="flex flex-row-reverse">
            <FeatureGate
              featureId="custom_domains"
              fallback={
                <UpgradePrompt featureId="custom_domains" variant="compact" />
              }
            >
              <Button
                onClick={() => {
                  if (!latestDeployment) {
                    toast.error(
                      "Please first deploy your application under the Deployments tab before adding a custom domain.",
                    );
                    return;
                  }
                  setAddDomainConfirmation({
                    domain: "",
                    page: "new",
                  });
                }}
                variant="secondary"
              >
                <PlusCircle className="mr-1 h-3 w-3 text-zinc-800" /> Add Domain
              </Button>
            </FeatureGate>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {(domains ?? []).map((d) => (
              <div
                className="flex items-center justify-between rounded-md bg-neutral-300 p-2"
                key={d._id}
              >
                {fullyVerified(d) && (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="font-bold"> {d.domain}</span>
                    </div>
                  </>
                )}

                {!fullyVerified(d) && (
                  <>
                    <div>
                      <span className="font-bold"> {d.domain}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleFinishSetup(d)}
                        variant="secondary"
                      >
                        Finish Setup{" "}
                        <ChevronRight className="ml-1 h-3 w-3 text-zinc-800" />
                      </Button>
                      <Button
                        onClick={() => setDomainToDelete(d)}
                        variant="ghost"
                        size="icon"
                        className="hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </>
                )}

                {fullyVerified(d) && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setDomainToDelete(d)}
                      variant="ghost"
                      size="icon"
                      className="hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {domains !== undefined && domains.length === 0 && (
              <div className="text-italic text-center text-sm text-neutral-400">
                No domains added yet
              </div>
            )}
          </div>
        </>
      )}
      {addDomainConfirmation !== null && (
        <NewDomainWorkflow
          projectId={projectId}
          initialPage={addDomainConfirmation.page}
          domain={addDomainConfirmation.domain}
          onFinish={() => setAddDomainConfirmation(null)}
        />
      )}

      <AlertDialog
        open={!!domainToDelete}
        onOpenChange={(open) => !open && setDomainToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the domain{" "}
              <strong>{domainToDelete?.domain}</strong>? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDomain}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
