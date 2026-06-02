"use client";

import React, { useCallback, useState } from "react";
import { X, Loader, ArrowRight, Mail, Check, AlertCircle } from "lucide-react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/vly/components/ui/dialog";
import { Input } from "@/vly/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/vly/components/ui/input-otp";

type Stage = "email" | "code" | "success";

interface ImportProjectsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful import so callers can refetch projects. */
  onSuccess?: () => void;
}

export default function ImportProjectsDialog({
  isOpen,
  onClose,
  onSuccess,
}: ImportProjectsDialogProps) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultStrategy, setResultStrategy] = useState<"A" | "B" | null>(null);
  const [resultCount, setResultCount] = useState(0);

  const requestOtp = useAction(api.import_projects.requestImportOtp);
  const verifyAndImport = useMutation(api.import_projects.verifyAndImport);

  const reset = useCallback(() => {
    setStage("email");
    setEmail("");
    setCode("");
    setError(null);
    setIsSubmitting(false);
    setResultStrategy(null);
    setResultCount(0);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSendCode = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!email.trim()) {
        setError("Please enter an email.");
        return;
      }
      setError(null);
      setIsSubmitting(true);
      try {
        const result = await requestOtp({ email: email.trim() });
        if (result.ok) {
          setStage("code");
          toast.success("Verification code sent to your email.");
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send verification code.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, requestOtp],
  );

  const handleVerify = useCallback(
    async (codeOverride?: string) => {
      const submittedCode = (codeOverride ?? code).trim();
      if (submittedCode.length !== 6) {
        setError("Enter the 6-digit code.");
        return;
      }
      setError(null);
      setIsSubmitting(true);
      try {
        const result = await verifyAndImport({
          email: email.trim(),
          code: submittedCode,
        });
        if (result.ok) {
          setResultStrategy(result.strategy);
          setResultCount(result.importedProjectCount);
          setStage("success");
          toast.success(
            result.strategy === "A"
              ? "Account merged successfully."
              : `Imported ${result.importedProjectCount} project(s).`,
          );
          onSuccess?.();
        } else {
          setError(result.error);
          setCode("");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to verify code.",
        );
        setCode("");
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, email, verifyAndImport, onSuccess],
  );

  // Auto-submit when 6 digits entered
  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      setError(null);
      if (value.length === 6 && !isSubmitting) {
        void handleVerify(value);
      }
    },
    [handleVerify, isSubmitting],
  );

  const handleResend = useCallback(async () => {
    setCode("");
    setError(null);
    await handleSendCode();
  }, [handleSendCode]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        hideCloseButton
        className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden border border-border bg-card p-0 text-foreground shadow-2xl shadow-black/60 sm:rounded-2xl"
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-card to-transparent" />

          <DialogHeader className="relative border-b border-border px-6 pb-5 pt-6 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                  Project Importer
                </p>
                <DialogTitle className="mt-2 font-['PP_Cirka'] text-2xl font-normal leading-tight text-foreground">
                  {stage === "success"
                    ? "Import complete"
                    : "Import from old account"}
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-5 text-muted-foreground">
                  {stage === "email" &&
                    "Enter the email of your old account. We'll send a 6-digit code to verify ownership."}
                  {stage === "code" &&
                    `Enter the code we sent to ${email}.`}
                  {stage === "success" &&
                    (resultStrategy === "A"
                      ? "Your old account has been linked. Refresh to see all your projects."
                      : `${resultCount} project(s) moved to your account.`)}
                </DialogDescription>
              </div>

              <button
                type="button"
                onClick={handleClose}
                aria-label="Close import projects dialog"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="px-6 pb-6 pt-5">
            {stage === "email" && (
              <form onSubmit={handleSendCode} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="import-email"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Old account email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="import-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@oldemail.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError(null);
                      }}
                      disabled={isSubmitting}
                      className="h-11 pl-9"
                      autoFocus
                    />
                  </div>
                </div>

                {error && <ErrorBanner message={error} />}

                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground transition-all hover:shadow-[0_0_20px_rgba(124,255,63,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
                >
                  {isSubmitting ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span className="font-['Geist'] text-sm">
                        Send verification code
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {stage === "code" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-3">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={handleCodeChange}
                    disabled={isSubmitting}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="h-12 w-10 text-base" />
                      <InputOTPSlot index={1} className="h-12 w-10 text-base" />
                      <InputOTPSlot index={2} className="h-12 w-10 text-base" />
                      <InputOTPSlot index={3} className="h-12 w-10 text-base" />
                      <InputOTPSlot index={4} className="h-12 w-10 text-base" />
                      <InputOTPSlot index={5} className="h-12 w-10 text-base" />
                    </InputOTPGroup>
                  </InputOTP>
                  {isSubmitting && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader className="h-3 w-3 animate-spin" />
                      Verifying...
                    </div>
                  )}
                </div>

                {error && <ErrorBanner message={error} />}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("email");
                      setCode("");
                      setError(null);
                    }}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isSubmitting}
                    className="text-xs text-primary transition-colors hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </div>
            )}

            {stage === "success" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-7 w-7" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground transition-all hover:shadow-[0_0_20px_rgba(124,255,63,0.35)]"
                >
                  <span className="font-['Geist'] text-sm">Done</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
