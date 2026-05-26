"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Button } from "@/vly/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/vly/components/ui/card";
import { Input } from "@/vly/components/ui/input";
import { Textarea } from "@/vly/components/ui/textarea";
import { Badge } from "@/vly/components/ui/badge";
import {
  CheckCircle2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Users,
} from "lucide-react";

const DEFAULT_DRAFT_SUBJECT = "New promotional email";
const DEFAULT_DRAFT_CONTENT = `Write your message in Markdown.

Supported:
- **Bold text**
- [Hyperlinks](https://vly.ai)
- ![Images](https://images.unsplash.com/photo-1518779578993-ec3579fee39f?auto=format&fit=crop&w=900&q=80)
`;

type BlastStatus = "draft" | "queued" | "sent";

type BlastSummary = {
  id: string;
  name: string;
  status: BlastStatus;
  createdAt: number;
  scheduledAt: number | null;
  sentAt: number | null;
};

type BlastDetail = {
  id: string;
  subject: string;
  contentMarkdown: string;
  status: BlastStatus;
  createdAt: number;
  scheduledAt: number | null;
  sentAt: number | null;
};

export default function AdminEmailBlastsPage() {
  const listBlasts = useAction(api.email_blasts_node.listBroadcasts);
  const getBlast = useAction(api.email_blasts_node.getBroadcastDraft);
  const createDraft = useAction(api.email_blasts_node.createDraft);
  const updateDraft = useAction(api.email_blasts_node.updateDraft);
  const deleteDraft = useAction(api.email_blasts_node.deleteDraft);
  const syncAudienceContactsBatch = useAction(
    api.email_blasts_node.syncAudienceContactsBatch,
  );

  const [blasts, setBlasts] = useState<BlastSummary[] | undefined>(undefined);
  const [selectedBlastId, setSelectedBlastId] = useState<string | null>(null);
  const [selectedBlast, setSelectedBlast] = useState<BlastDetail | null>(null);
  const [subject, setSubject] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingBlast, setIsLoadingBlast] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncingAudience, setIsSyncingAudience] = useState(false);

  const refreshBlasts = async (preferredBlastId?: string | null) => {
    setIsRefreshing(true);
    try {
      const result = await listBlasts({});
      const nextBlasts = result.blasts as BlastSummary[];
      setBlasts(nextBlasts);
      setSelectedBlastId((current) => {
        const preferred = preferredBlastId ?? current;
        if (preferred && nextBlasts.some((blast) => blast.id === preferred)) {
          return preferred;
        }
        return nextBlasts[0]?.id ?? null;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load email drafts";
      toast.error(message);
      setBlasts([]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadBlast = async (blastId: string) => {
    setIsLoadingBlast(true);
    try {
      const blast = (await getBlast({ broadcastId: blastId })) as BlastDetail;
      setSelectedBlast(blast);
      setSubject(blast.subject);
      setContentMarkdown(blast.contentMarkdown);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load draft details";
      toast.error(message);
      setSelectedBlast(null);
      setSubject("");
      setContentMarkdown("");
    } finally {
      setIsLoadingBlast(false);
    }
  };

  useEffect(() => {
    void refreshBlasts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedBlastId) {
      setSelectedBlast(null);
      setSubject("");
      setContentMarkdown("");
      return;
    }
    void loadBlast(selectedBlastId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlastId]);

  const hasUnsavedChanges =
    !!selectedBlast &&
    (subject !== selectedBlast.subject ||
      contentMarkdown !== selectedBlast.contentMarkdown);

  const canEdit = !!selectedBlast && selectedBlast.status === "draft";

  const selectedBlastSummary = useMemo(
    () => blasts?.find((blast) => blast.id === selectedBlastId) ?? null,
    [blasts, selectedBlastId],
  );

  const handleCreateDraft = async () => {
    setIsCreating(true);
    try {
      const result = await createDraft({
        subject: DEFAULT_DRAFT_SUBJECT,
        contentMarkdown: DEFAULT_DRAFT_CONTENT,
      });
      await refreshBlasts(result.blastId);
      toast.success("Email draft created");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create draft";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedBlast) return;

    setIsSaving(true);
    try {
      await updateDraft({
        blastId: selectedBlast.id,
        subject,
        contentMarkdown,
      });
      await loadBlast(selectedBlast.id);
      await refreshBlasts(selectedBlast.id);
      toast.success("Draft saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save draft";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!selectedBlast) return;
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;

    setIsDeleting(true);
    try {
      await deleteDraft({ blastId: selectedBlast.id });
      await refreshBlasts();
      toast.success("Draft deleted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete draft";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSyncAudience = async () => {
    setIsSyncingAudience(true);
    try {
      const batch = await syncAudienceContactsBatch({
        batchSize: 250,
      });

      toast.success(
        `Audience sync complete. Processed ${batch.processedUsers} users across ${batch.pagesProcessed} pages, created ${batch.created}, updated ${batch.updated}, failed ${batch.failed}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed syncing audience";
      toast.error(message);
    } finally {
      setIsSyncingAudience(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Email Drafts</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshBlasts()}
                disabled={isRefreshing}
                className="gap-2"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={handleCreateDraft}
                disabled={isCreating}
                className="gap-2"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                New
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Create and manage broadcast drafts here. Send final blasts from the
            Resend dashboard after review.
          </p>
          <Button
            variant="outline"
            onClick={handleSyncAudience}
            disabled={isSyncingAudience}
            className="w-full gap-2"
          >
            {isSyncingAudience ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            Sync Users to Resend Audience
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {blasts === undefined && (
            <div className="text-sm text-muted-foreground">
              Loading drafts...
            </div>
          )}

          {blasts?.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No drafts yet.
            </div>
          )}

          {blasts?.map((blast) => {
            const isSelected = blast.id === selectedBlastId;
            return (
              <button
                key={blast.id}
                onClick={() => setSelectedBlastId(blast.id)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-black bg-black/5"
                    : "border-border hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium">
                    {blast.name || "(Untitled)"}
                  </p>
                  <StatusBadge status={blast.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Created {new Date(blast.createdAt).toLocaleString()}
                </p>
                {blast.sentAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent {new Date(blast.sentAt).toLocaleString()}
                  </p>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {!selectedBlastId ? (
          <Card>
            <CardContent className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Select a draft or create a new blast.
            </CardContent>
          </Card>
        ) : isLoadingBlast ? (
          <Card>
            <CardContent className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading draft...
            </CardContent>
          </Card>
        ) : !selectedBlast ? (
          <Card>
            <CardContent className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Unable to load selected draft.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    <CardTitle className="text-xl">Compose Broadcast</CardTitle>
                    <StatusBadge status={selectedBlast.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={handleDeleteDraft}
                      disabled={!canEdit || isDeleting}
                      className="gap-2"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSaveDraft}
                      disabled={!canEdit || !hasUnsavedChanges || isSaving}
                      className="gap-2"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Draft
                    </Button>
                    <Button
                      disabled
                      className="gap-2"
                      title="Sending from this page is disabled. Send from the Resend dashboard."
                    >
                      <Send className="h-4 w-4" />
                      Send in Resend Dashboard
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Sending is disabled in this admin page. Use{" "}
                  <a
                    href="https://resend.com/broadcasts"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    Resend Broadcasts
                  </a>{" "}
                  to send the blast after saving your draft here.
                </div>

                <div className="grid gap-3 rounded-md bg-muted/50 p-3 md:grid-cols-3">
                  <StatItem
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Status"
                    value={selectedBlast.status}
                  />
                  <StatItem
                    icon={<Mail className="h-4 w-4" />}
                    label="Created"
                    value={new Date(
                      selectedBlastSummary?.createdAt ??
                        selectedBlast.createdAt,
                    ).toLocaleString()}
                  />
                  <StatItem
                    icon={<Send className="h-4 w-4" />}
                    label="Sent"
                    value={
                      selectedBlast.sentAt
                        ? new Date(selectedBlast.sentAt).toLocaleString()
                        : "Not sent"
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Email subject"
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Email Body (Markdown)
                  </label>
                  <Textarea
                    value={contentMarkdown}
                    onChange={(event) => setContentMarkdown(event.target.value)}
                    placeholder="Write your message..."
                    disabled={!canEdit}
                    className="min-h-[260px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Markdown supported: bold, links, images, headings, lists,
                    and paragraphs.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <article className="space-y-3 text-sm leading-6 [&_a]:underline [&_img]:max-h-56 [&_img]:rounded-md [&_img]:border [&_img]:object-cover">
                  <ReactMarkdown>
                    {contentMarkdown || "_No content yet_"}
                  </ReactMarkdown>
                </article>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BlastStatus }) {
  if (status === "draft") {
    return <Badge variant="outline">Draft</Badge>;
  }
  if (status === "queued") {
    return (
      <Badge className="gap-1 bg-blue-600 text-white">
        <Loader2 className="h-3 w-3 animate-spin" />
        Queued
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-600 text-white">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      Sent
    </Badge>
  );
}

function StatItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-background p-3">
      <div className="mb-1 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
