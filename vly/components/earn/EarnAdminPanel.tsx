"use client";

import { SignInButton } from "@/components/auth/AuthComponents";
import { PageLayout } from "@/components/test-landing/PageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSignedInUser } from "@/hooks/use-user";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Edit,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function formatCredits(credits?: number | null) {
  const safeCredits = Number(credits ?? 0);
  if (!Number.isFinite(safeCredits)) {
    return "0";
  }

  if (safeCredits >= 1_000_000) {
    return `${(safeCredits / 1_000_000).toFixed(1)}M`.replace(".0M", "M");
  }

  return safeCredits.toLocaleString();
}

function parseLinks(text: string) {
  return text
    .split(/\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
}

type SubmissionFilter = "all" | "pending" | "approved" | "rejected" | "revoked";

type BountyFormState = {
  title: string;
  description: string;
  instructions: string;
  evidenceRequirements: string;
  linksText: string;
  rewardCredits: string;
  status: "active" | "paused" | "archived";
  previewImageId?: Id<"_storage">;
  previewImageUrl?: string | null;
};

const defaultBountyForm = (): BountyFormState => ({
  title: "",
  description: "",
  instructions: "",
  evidenceRequirements: "",
  linksText: "",
  rewardCredits: "2000000",
  status: "active",
  previewImageId: undefined,
  previewImageUrl: null,
});

export default function EarnAdminPanel() {
  const user = useSignedInUser();
  const isAdmin = user?.role === "god" || user?.role === "admin";

  const [submissionFilter, setSubmissionFilter] =
    useState<SubmissionFilter>("pending");

  const adminBounties = useQuery(
    api.earn.getAdminBounties,
    isAdmin ? {} : "skip",
  );
  const adminSubmissions = useQuery(
    api.earn.getAdminBountySubmissions,
    isAdmin
      ? {
          status: submissionFilter === "all" ? undefined : submissionFilter,
        }
      : "skip",
  );

  const createBounty = useMutation(api.earn.createBounty);
  const updateBounty = useMutation(api.earn.updateBounty);
  const deleteBounty = useMutation(api.earn.deleteBounty);
  const reviewBountySubmission = useMutation(api.earn.reviewBountySubmission);
  const generateUploadUrl = useMutation(api.earn.generateUploadUrl);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBountyId, setEditingBountyId] = useState<Id<"bounties"> | null>(
    null,
  );
  const [bountyForm, setBountyForm] =
    useState<BountyFormState>(defaultBountyForm());
  const [savingBounty, setSavingBounty] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);

  const [deleteDialogBountyId, setDeleteDialogBountyId] =
    useState<Id<"bounties"> | null>(null);
  const [deletingBounty, setDeletingBounty] = useState(false);

  const [reviewDialogSubmissionId, setReviewDialogSubmissionId] =
    useState<Id<"bounty_submissions"> | null>(null);
  const [reviewAction, setReviewAction] = useState<
    "approve" | "reject" | "revoke"
  >("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewingSubmission, setReviewingSubmission] = useState(false);
  const [approvingSubmissionId, setApprovingSubmissionId] =
    useState<Id<"bounty_submissions"> | null>(null);

  const editingBounty = useMemo(() => {
    if (!adminBounties || !editingBountyId) {
      return null;
    }
    return (
      adminBounties.find((bounty) => bounty._id === editingBountyId) ?? null
    );
  }, [adminBounties, editingBountyId]);

  const openCreateDialog = () => {
    setEditingBountyId(null);
    setBountyForm(defaultBountyForm());
    setEditorOpen(true);
  };

  const openEditDialog = (bountyId: Id<"bounties">) => {
    const bounty = adminBounties?.find((item) => item._id === bountyId);
    if (!bounty) {
      return;
    }

    setEditingBountyId(bountyId);
    setBountyForm({
      title: bounty.title,
      description: bounty.description,
      instructions: bounty.instructions,
      evidenceRequirements: bounty.evidenceRequirements,
      linksText: bounty.links.join("\n"),
      rewardCredits: `${bounty.rewardCredits}`,
      status: bounty.status,
      previewImageId: undefined,
      previewImageUrl: bounty.previewImageUrl,
    });
    setEditorOpen(true);
  };

  const closeEditorDialog = () => {
    setEditorOpen(false);
    setEditingBountyId(null);
    setBountyForm(defaultBountyForm());
    setSavingBounty(false);
    setUploadingPreview(false);
  };

  const handleUploadPreviewImage = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingPreview(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Image upload failed");
      }

      const { storageId } = await response.json();

      setBountyForm((previous) => ({
        ...previous,
        previewImageId: storageId as Id<"_storage">,
        previewImageUrl: URL.createObjectURL(file),
      }));
      toast.success("Preview image uploaded");
    } catch (error) {
      console.error("Failed to upload bounty preview:", error);
      toast.error("Failed to upload preview image");
    } finally {
      setUploadingPreview(false);
      event.target.value = "";
    }
  };

  const handleSaveBounty = async () => {
    const rewardCredits = Number(bountyForm.rewardCredits);
    const evidenceRequirements =
      bountyForm.evidenceRequirements.trim() ||
      bountyForm.instructions.trim() ||
      "Follow the bounty instructions and submit clear evidence links or screenshots.";
    if (!bountyForm.title.trim()) {
      toast.error("Bounty title is required");
      return;
    }

    if (!Number.isFinite(rewardCredits) || rewardCredits <= 0) {
      toast.error("Reward credits must be greater than 0");
      return;
    }

    setSavingBounty(true);
    try {
      if (editingBountyId) {
        await updateBounty({
          bountyId: editingBountyId,
          title: bountyForm.title,
          description: bountyForm.description,
          instructions: bountyForm.instructions,
          evidenceRequirements,
          links: parseLinks(bountyForm.linksText),
          rewardCredits,
          status: bountyForm.status,
          previewImageId:
            bountyForm.previewImageId ??
            (bountyForm.previewImageUrl ? undefined : null),
        });
        toast.success("Bounty updated");
      } else {
        await createBounty({
          title: bountyForm.title,
          description: bountyForm.description,
          instructions: bountyForm.instructions,
          evidenceRequirements,
          links: parseLinks(bountyForm.linksText),
          rewardCredits,
          status: bountyForm.status,
          previewImageId: bountyForm.previewImageId,
        });
        toast.success("Bounty created");
      }

      closeEditorDialog();
    } catch (error: any) {
      console.error("Failed to save bounty:", error);
      toast.error(error?.message || "Failed to save bounty");
      setSavingBounty(false);
    }
  };

  const handleDeleteBounty = async () => {
    if (!deleteDialogBountyId) {
      return;
    }

    setDeletingBounty(true);
    try {
      await deleteBounty({ bountyId: deleteDialogBountyId });
      toast.success("Bounty archived");
      setDeleteDialogBountyId(null);
    } catch (error: any) {
      console.error("Failed to archive bounty:", error);
      toast.error(error?.message || "Failed to archive bounty");
    } finally {
      setDeletingBounty(false);
    }
  };

  const openReviewDialog = (
    submissionId: Id<"bounty_submissions">,
    action: "approve" | "reject" | "revoke",
  ) => {
    setReviewDialogSubmissionId(submissionId);
    setReviewAction(action);
    setReviewNote("");
  };

  const closeReviewDialog = () => {
    setReviewDialogSubmissionId(null);
    setReviewNote("");
    setReviewingSubmission(false);
  };

  const handleApproveSubmission = async (
    submissionId: Id<"bounty_submissions">,
  ) => {
    if (approvingSubmissionId || reviewingSubmission) {
      return;
    }

    setApprovingSubmissionId(submissionId);
    try {
      await reviewBountySubmission({
        submissionId,
        action: "approve",
      });

      toast.success("Submission approved");
    } catch (error: any) {
      console.error("Failed to approve submission:", error);
      toast.error(error?.message || "Failed to approve submission");
    } finally {
      setApprovingSubmissionId(null);
    }
  };

  const handleReviewSubmission = async () => {
    if (!reviewDialogSubmissionId) {
      return;
    }

    setReviewingSubmission(true);
    try {
      await reviewBountySubmission({
        submissionId: reviewDialogSubmissionId,
        action: reviewAction,
        adminNote: reviewNote.trim() || undefined,
      });

      toast.success(`Submission ${reviewAction}d`);
      closeReviewDialog();
    } catch (error: any) {
      console.error("Failed to review submission:", error);
      toast.error(error?.message || "Failed to review submission");
      setReviewingSubmission(false);
    }
  };

  if (user === undefined) {
    return (
      <PageLayout showHome={true} showParallax={false}>
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageLayout>
    );
  }

  if (user === null) {
    return (
      <PageLayout showHome={true} showParallax={false}>
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <h1 className="mb-3 text-3xl font-semibold text-zinc-900">
            Earn Admin Access
          </h1>
          <p className="mb-8 text-zinc-600">Sign in with an admin account.</p>
          <SignInButton mode="modal" asChild>
            <Button className="rounded-full bg-emerald-600 px-8 text-white hover:bg-emerald-700">
              Sign in
            </Button>
          </SignInButton>
        </div>
      </PageLayout>
    );
  }

  if (!isAdmin) {
    return (
      <PageLayout showHome={true} showParallax={false}>
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-600" />
          <h1 className="mb-2 text-3xl font-semibold text-zinc-900">
            Access restricted
          </h1>
          <p className="text-zinc-600">
            Only admin users can review bounty submissions.
          </p>
          <Button
            asChild
            className="mt-6 rounded-full bg-zinc-900 px-6 text-white"
          >
            <Link href="/earn">Back to Earn</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout showHome={true} showParallax={false}>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge className="mb-3 border-emerald-300 bg-emerald-100 text-emerald-700">
                Earn Admin
              </Badge>
              <h1 className="text-3xl font-semibold text-zinc-900">
                Bounty management and review
              </h1>
              <p className="text-sm text-zinc-600">
                Create, edit, archive bounties and process pending submissions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="border-zinc-300">
                <Link href="/earn" className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Earn
                </Link>
              </Button>
              <Button
                onClick={openCreateDialog}
                className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create bounty
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900">Bounties</h2>
          </div>

          <div className="space-y-4">
            {adminBounties?.map((bounty) => (
              <div
                key={bounty._id}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-zinc-900">
                        {bounty.title}
                      </h3>
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                        {formatCredits(bounty.rewardCredits)} credits
                      </Badge>
                      <Badge className="border-zinc-200 bg-zinc-100 text-zinc-700">
                        {bounty.status}
                      </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-zinc-600">
                      {bounty.description}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                      <span className="rounded-full bg-white px-3 py-1">
                        Pending: {bounty.stats.pending}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1">
                        Approved: {bounty.stats.approved}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1">
                        Rejected: {bounty.stats.rejected}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1">
                        Revoked: {bounty.stats.revoked}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="border-zinc-300"
                      onClick={() => openEditDialog(bounty._id)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="border-amber-300 text-amber-700"
                      onClick={() => setDeleteDialogBountyId(bounty._id)}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                  </div>
                </div>

                {bounty.previewImageUrl && (
                  <div className="mt-3 h-40 w-full max-w-xs overflow-hidden rounded-xl border border-zinc-200">
                    <img
                      src={bounty.previewImageUrl}
                      alt={bounty.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>
            ))}

            {!adminBounties?.length && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
                No bounties yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-zinc-900">Submissions</h2>
            <select
              value={submissionFilter}
              onChange={(event) =>
                setSubmissionFilter(event.target.value as SubmissionFilter)
              }
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>

          <div className="space-y-4">
            {adminSubmissions?.map((submission) => (
              <div
                key={submission._id}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {submission.bounty?.title || "Deleted bounty"}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {submission.user?.name} ({submission.user?.email})
                    </p>
                    <p className="text-xs text-zinc-500">
                      Submitted:{" "}
                      {submission.submittedAt
                        ? new Date(submission.submittedAt).toLocaleString()
                        : "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="border-zinc-200 bg-zinc-100 text-zinc-700">
                      {submission.status}
                    </Badge>
                    <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                      {formatCredits(submission.awardedCredits)} credits
                    </Badge>
                  </div>
                </div>

                {submission.evidenceText && (
                  <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
                    {submission.evidenceText}
                  </div>
                )}

                {submission.evidenceLinks.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {submission.evidenceLinks.map((link) => (
                      <a
                        key={`${submission._id}-${link}`}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-emerald-700 underline"
                      >
                        {link}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ))}
                  </div>
                )}

                {submission.evidenceImageUrls.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {submission.evidenceImageUrls.map((url) => (
                      <div
                        key={url}
                        className="h-24 overflow-hidden rounded-lg border border-zinc-200"
                      >
                        <img
                          src={url}
                          alt="Evidence"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {submission.adminReviewNote && (
                  <Alert className="mb-3 border-zinc-200 bg-white">
                    <AlertDescription className="text-zinc-700">
                      Admin note: {submission.adminReviewNote}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleApproveSubmission(submission._id)}
                    disabled={
                      (submission.status === "approved" &&
                        submission.creditStatus === "granted") ||
                      !!approvingSubmissionId
                    }
                  >
                    {approvingSubmissionId === submission._id ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-300 text-rose-700"
                    onClick={() => openReviewDialog(submission._id, "reject")}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700"
                    onClick={() => openReviewDialog(submission._id, "revoke")}
                    disabled={submission.creditStatus !== "granted"}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Revoke Credits
                  </Button>
                </div>
              </div>
            ))}

            {!adminSubmissions?.length && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
                No submissions found for the selected filter.
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => !open && closeEditorDialog()}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingBounty ? "Edit bounty" : "Create bounty"}
            </DialogTitle>
            <DialogDescription>
              Configure bounty requirements and rewards for users.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">Title</p>
              <Input
                value={bountyForm.title}
                onChange={(event) =>
                  setBountyForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                placeholder="Twitter engagement bounty"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-800">
                  Reward credits
                </p>
                <select
                  value={bountyForm.rewardCredits}
                  onChange={(event) =>
                    setBountyForm((previous) => ({
                      ...previous,
                      rewardCredits: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  {![
                    "1000000",
                    "2000000",
                    "4000000",
                    "5000000",
                    "10000000",
                    "20000000",
                    "30000000",
                    "50000000",
                    "70000000",
                    "100000000",
                  ].includes(bountyForm.rewardCredits) && (
                    <option value={bountyForm.rewardCredits}>
                      {formatCredits(Number(bountyForm.rewardCredits))} credits
                      (legacy)
                    </option>
                  )}
                  <option value="1000000">1M credits</option>
                  <option value="2000000">2M credits</option>
                  <option value="4000000">4M credits</option>
                  <option value="5000000">5M credits</option>
                  <option value="10000000">10M credits</option>
                  <option value="20000000">20M credits</option>
                  <option value="30000000">30M credits</option>
                  <option value="50000000">50M credits</option>
                  <option value="70000000">70M credits</option>
                  <option value="100000000">100M credits</option>
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-800">Status</p>
                <select
                  value={bountyForm.status}
                  onChange={(event) =>
                    setBountyForm((previous) => ({
                      ...previous,
                      status: event.target.value as
                        | "active"
                        | "paused"
                        | "archived",
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">
                Description (markdown)
              </p>
              <Textarea
                rows={4}
                value={bountyForm.description}
                onChange={(event) =>
                  setBountyForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">
                Instructions (markdown)
              </p>
              <Textarea
                rows={4}
                value={bountyForm.instructions}
                onChange={(event) =>
                  setBountyForm((previous) => ({
                    ...previous,
                    instructions: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">
                Instruction links
              </p>
              <Textarea
                rows={3}
                value={bountyForm.linksText}
                onChange={(event) =>
                  setBountyForm((previous) => ({
                    ...previous,
                    linksText: event.target.value,
                  }))
                }
                placeholder="One link per line"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">Preview image</p>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 hover:bg-zinc-100">
                {uploadingPreview ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {uploadingPreview ? "Uploading..." : "Upload preview image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadPreviewImage}
                  disabled={uploadingPreview}
                />
              </label>

              {bountyForm.previewImageUrl && (
                <div className="h-40 w-full max-w-xs overflow-hidden rounded-xl border border-zinc-200">
                  <img
                    src={bountyForm.previewImageUrl}
                    alt="Bounty preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>

            <Alert className="border-amber-200 bg-amber-50">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
              <AlertDescription className="text-amber-800">
                Keep instructions specific so reviewers can approve or reject
                submissions quickly and consistently.
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeEditorDialog}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveBounty}
                disabled={savingBounty || uploadingPreview}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {savingBounty ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : editingBounty ? (
                  "Save changes"
                ) : (
                  "Create bounty"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteDialogBountyId}
        onOpenChange={(open) => !open && setDeleteDialogBountyId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive bounty</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the bounty from the marketplace while preserving
              review history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBounty}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBounty}
              disabled={deletingBounty}
            >
              {deletingBounty ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Archiving...
                </span>
              ) : (
                "Archive"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!reviewDialogSubmissionId}
        onOpenChange={(open) => !open && closeReviewDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve"
                ? "Approve submission"
                : reviewAction === "reject"
                  ? "Reject submission"
                  : "Revoke credited submission"}
            </DialogTitle>
            <DialogDescription>
              Add an optional note that will be visible in submission status.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            rows={4}
            placeholder="Optional reviewer note"
          />

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={closeReviewDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleReviewSubmission}
              disabled={reviewingSubmission}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {reviewingSubmission ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Confirm ${reviewAction}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
