"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageLayout } from "@/components/test-landing/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";

type EmailPreferences = {
  email: string;
  promotionalEmailsSubscribed: boolean;
  promotionalEmailsUnsubscribed: boolean;
} | null;

export default function DashboardPreferencesPage() {
  const searchParams = useSearchParams();
  const shouldUnsubscribeFromLink = searchParams.get("unsubscribe") === "1";
  const getMyEmailPreferences = useAction(
    api.email_blasts_node.getMyEmailPreferences,
  );
  const setMyPromotionalEmailsSubscribed = useAction(
    api.email_blasts_node.setMyPromotionalEmailsSubscribed,
  );

  const [preferences, setPreferences] = useState<EmailPreferences | undefined>(
    undefined,
  );
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoUnsubscribing, setIsAutoUnsubscribing] = useState(false);
  const [unsubscribeApplied, setUnsubscribeApplied] = useState(false);
  const [unsubscribeResultMessage, setUnsubscribeResultMessage] = useState<
    string | null
  >(null);

  const promotionalSubscribed = useMemo(() => {
    if (!preferences || preferences === null) {
      return false;
    }
    return preferences.promotionalEmailsSubscribed === true;
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPreferences(true);

    getMyEmailPreferences({})
      .then((result) => {
        if (cancelled) return;
        setPreferences(result);
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load email preferences.";
        toast.error(message);
        setPreferences(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingPreferences(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getMyEmailPreferences]);

  useEffect(() => {
    if (!shouldUnsubscribeFromLink || unsubscribeApplied) {
      return;
    }
    if (preferences === undefined) {
      return;
    }
    if (preferences === null) {
      setUnsubscribeResultMessage(
        "Sign in to confirm unsubscribe from promotional emails.",
      );
      return;
    }
    if (preferences.promotionalEmailsUnsubscribed) {
      setUnsubscribeResultMessage(
        "You are already unsubscribed from promotional emails.",
      );
      setUnsubscribeApplied(true);
      return;
    }

    let isCancelled = false;
    setIsAutoUnsubscribing(true);

    setMyPromotionalEmailsSubscribed({ subscribed: false })
      .then(() => {
        if (isCancelled) return;
        setPreferences((current) =>
          current
            ? {
                ...current,
                promotionalEmailsSubscribed: false,
                promotionalEmailsUnsubscribed: true,
              }
            : current,
        );
        setUnsubscribeResultMessage(
          "You have been unsubscribed from all promotional emails.",
        );
        toast.success("You were unsubscribed from promotional emails.");
      })
      .catch((error) => {
        if (isCancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to process unsubscribe request.";
        setUnsubscribeResultMessage(message);
        toast.error(message);
      })
      .finally(() => {
        if (isCancelled) return;
        setUnsubscribeApplied(true);
        setIsAutoUnsubscribing(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [
    preferences,
    setMyPromotionalEmailsSubscribed,
    shouldUnsubscribeFromLink,
    unsubscribeApplied,
  ]);

  const handleToggle = async (checked: boolean) => {
    if (!preferences || preferences === null) {
      return;
    }

    setIsSaving(true);
    try {
      await setMyPromotionalEmailsSubscribed({ subscribed: checked });
      setPreferences({
        ...preferences,
        promotionalEmailsSubscribed: checked,
        promotionalEmailsUnsubscribed: !checked,
      });
      toast.success(
        checked
          ? "Promotional emails enabled."
          : "Promotional emails disabled.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update email preferences.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      showHome={true}
      showParallax={false}
      contentClassName="pt-[16vh]"
    >
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Email Preferences</CardTitle>
            <p className="text-sm text-muted-foreground">
              Control promotional emails from vly.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {isAutoUnsubscribing && (
              <Banner
                icon={<Loader2 className="h-4 w-4 animate-spin" />}
                text="Processing your unsubscribe request..."
              />
            )}

            {!isAutoUnsubscribing && unsubscribeResultMessage && (
              <Banner
                icon={<CheckCircle2 className="h-4 w-4" />}
                text={unsubscribeResultMessage}
              />
            )}

            {isLoadingPreferences && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Loading preferences...
              </div>
            )}

            {!isLoadingPreferences && preferences === null && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Sign in to manage preferences for your account.
              </div>
            )}

            {!isLoadingPreferences && preferences && (
              <div className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MailWarning className="h-4 w-4" />
                      Promotional Emails
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enabled by default. Turn this off to unsubscribe from all
                      promotional blasts.
                    </p>
                  </div>
                  <Switch
                    checked={promotionalSubscribed}
                    onCheckedChange={handleToggle}
                    disabled={isSaving || isAutoUnsubscribing}
                    aria-label="Promotional email preference"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

function Banner({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      {icon}
      <span>{text}</span>
    </div>
  );
}
