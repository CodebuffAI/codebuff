"use client";

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/vly/components/app-shell/AppShell";
import { AmbientBackdrop } from "@/vly/components/app-shell/AmbientBackdrop";
import { SignInMethodsSection } from "./sign-in-methods-section";
import { Input } from "@/vly/components/ui/input";
import { Textarea } from "@/vly/components/ui/textarea";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/vly/components/ui/input-otp";
import {
  Check,
  ExternalLink,
  Github,
  Loader,
  Mail,
  ShieldCheck,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

type ImportStage = "email" | "code" | "success";

const MASKED_SECRET = "••••••••••••••••";

type ByokKind = "openai" | "anthropic" | "bedrock";

function ByokSecretField({
  kind,
  hasSaved,
  placeholder,
  saveLabel,
  removeLabel,
}: {
  kind: ByokKind;
  hasSaved: boolean;
  placeholder: string;
  saveLabel: string;
  removeLabel: string;
}) {
  const saveByokSecret = useAction(api.users_byok.saveByokSecret);
  const clearCliByokCredential = useMutation(api.users.clearCliByokCredential);
  const [value, setValue] = useState(hasSaved ? MASKED_SECRET : "");
  const [isSaving, setIsSaving] = useState(false);

  // Reset to masked when the saved-state flips (e.g. after Remove).
  useEffect(() => {
    setValue(hasSaved ? MASKED_SECRET : "");
  }, [hasSaved]);

  return (
    <div className="mt-3 grid gap-2 sm:max-w-xl">
      <Input
        type="password"
        autoComplete="new-password"
        value={value}
        onFocus={() => {
          if (value === MASKED_SECRET) setValue("");
        }}
        onChange={(e) => setValue(e.target.value)}
        placeholder={hasSaved ? "Saved (enter a new value to rotate)" : placeholder}
        className="border-border/60 bg-background"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={async () => {
            const trimmed = value.trim();
            if (!trimmed || trimmed === MASKED_SECRET) {
              toast.error("Enter a value first");
              return;
            }
            setIsSaving(true);
            try {
              await saveByokSecret({ kind, secret: trimmed });
              setValue(MASKED_SECRET);
              toast.success(`${saveLabel} saved`);
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : `${saveLabel} failed`,
              );
            } finally {
              setIsSaving(false);
            }
          }}
          className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {isSaving && <Loader className="h-3.5 w-3.5 animate-spin" />}
          {saveLabel}
        </button>
        {hasSaved && (
          <button
            type="button"
            onClick={async () => {
              try {
                await clearCliByokCredential({ credential: kind });
                setValue("");
                toast.success(`${removeLabel} removed`);
              } catch {
                toast.error(`Failed to remove ${removeLabel}`);
              }
            }}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-destructive/50 bg-background px-3 text-xs text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const SETTINGS_TABS = [
  { id: "account", label: "Account" },
  { id: "ai-credentials", label: "AI credentials" },
  { id: "community-profile", label: "Community profile" },
  { id: "transfer-projects", label: "Transfer projects" },
  { id: "linked-github", label: "Linked GitHub" },
  { id: "sign-in-methods", label: "Sign-in methods" },
];

export default function GeneralSettingsPage() {
  const user = useQuery(api.users.viewer);
  const currentUserId = useQuery(api.community.getCurrentUserId);
  const profile = useQuery(
    api.community.getUserProfile,
    currentUserId ? { userId: currentUserId } : "skip",
  );
  const githubConnectionStatus = useQuery(
    api.github.auth.connections.getGitHubConnectionStatus,
  );
  const userProjects = useQuery(api.project.getUserProjects);
  const byokSettings = useQuery(api.users.getCliByokSettings);

  const updateProfile = useMutation(api.community.updateProfile);
  const requestOtp = useAction(api.import_projects.requestImportOtp);
  const verifyAndImport = useMutation(api.import_projects.verifyAndImport);
  const initiateGithubAuth = useAction(api.github.auth.oauth.initiateGitHubAuth);
  const disconnectGitHub = useMutation(
    api.github.auth.connections.disconnectGitHub,
  );
  const setCliPreference = useMutation(api.users.setCliPreference);
  const clearCodexOauthAuth = useMutation(api.users.clearCodexOauthAuth);
  const startCodexDeviceAuth = useAction(
    api.coding_agent.cli_agent.execute.startCodexDeviceAuth,
  );

  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [github, setGithub] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [importStage, setImportStage] = useState<ImportStage>("email");
  const [importEmail, setImportEmail] = useState("");
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importedProjectCount, setImportedProjectCount] = useState(0);

  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  const [isDisconnectingGithub, setIsDisconnectingGithub] = useState(false);
  const [isStartingOauthConnect, setIsStartingOauthConnect] = useState(false);
  const [codexOauthAuthUrl, setCodexOauthAuthUrl] = useState<string | null>(
    null,
  );
  const [codexOauthOneTimeCode, setCodexOauthOneTimeCode] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!profile) return;
    setBio(profile.bio || "");
    setWebsite(profile.website || "");
    setTwitter(profile.twitter || "");
    setGithub(profile.github || "");
  }, [profile]);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await updateProfile({
        bio: bio.trim() || undefined,
        website: website.trim() || undefined,
        twitter: twitter.trim() || undefined,
        github: github.trim() || undefined,
      });
      toast.success("Community profile updated");
    } catch {
      toast.error("Failed to update community profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendImportCode = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!importEmail.trim()) {
        setImportError("Enter the email for the old account.");
        return;
      }

      setIsImporting(true);
      setImportError(null);
      try {
        const result = await requestOtp({ email: importEmail.trim() });
        if (result.ok) {
          setImportStage("code");
          toast.success("Verification code sent");
        } else {
          setImportError(result.error);
        }
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : "Failed to send code.",
        );
      } finally {
        setIsImporting(false);
      }
    },
    [importEmail, requestOtp],
  );

  const handleVerifyImportCode = useCallback(
    async (codeOverride?: string) => {
      const submittedCode = (codeOverride ?? importCode).trim();
      if (submittedCode.length !== 6) {
        setImportError("Enter the 6-digit code.");
        return;
      }

      setIsImporting(true);
      setImportError(null);
      try {
        const result = await verifyAndImport({
          email: importEmail.trim(),
          code: submittedCode,
        });
        if (result.ok) {
          setImportedProjectCount(result.importedProjectCount);
          setImportStage("success");
          toast.success("Projects transferred");
        } else {
          setImportError(result.error);
          setImportCode("");
        }
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : "Failed to verify code.",
        );
        setImportCode("");
      } finally {
        setIsImporting(false);
      }
    },
    [importCode, importEmail, verifyAndImport],
  );

  const handleCodeChange = useCallback(
    (value: string) => {
      setImportCode(value);
      setImportError(null);
      if (value.length === 6 && !isImporting) {
        void handleVerifyImportCode(value);
      }
    },
    [handleVerifyImportCode, isImporting],
  );

  const handleConnectGithub = async () => {
    setIsConnectingGithub(true);
    try {
      const authUrl = await initiateGithubAuth({
        returnUrl: `${window.location.origin}/web/settings`,
      });
      window.location.href = authUrl;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to start GitHub connection",
      );
    } finally {
      setIsConnectingGithub(false);
    }
  };

  const handleDisconnectGithub = async () => {
    setIsDisconnectingGithub(true);
    try {
      const result = await disconnectGitHub({});
      if (result.success) {
        toast.success("GitHub disconnected");
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to disconnect GitHub");
    } finally {
      setIsDisconnectingGithub(false);
    }
  };

  const handleConnectCodexOauth = async (forceReauth = false) => {
    const candidateProject = userProjects?.[0];
    const semanticIdentifier = candidateProject?.semantic_identifier;
    if (!semanticIdentifier) {
      toast.error("Open a project first, then connect Codex OAuth.");
      return;
    }

    setIsStartingOauthConnect(true);
    try {
      const result = await startCodexDeviceAuth({
        projectSemanticIdentifier: semanticIdentifier,
        forceReauth,
      });
      if (!result.success) {
        toast.error(result.message || "Failed to start Codex OAuth");
        return;
      }

      setCodexOauthAuthUrl(result.authUrl ?? null);
      setCodexOauthOneTimeCode(result.oneTimeCode ?? null);

      if (result.alreadyAuthenticated && result.isAuthenticated) {
        toast.success("Codex OAuth already connected");
        return;
      }

      if (result.authUrl || result.oneTimeCode) {
        toast.success("Codex OAuth started. Use the code to connect.");
      } else {
        toast.success(result.message || "Codex OAuth started");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start Codex OAuth",
      );
    } finally {
      setIsStartingOauthConnect(false);
    }
  };

  return (
    <AppShell
      title="Settings"
      subtitle="General account and community settings"
      ambient={<AmbientBackdrop />}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="sticky top-0 z-10 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-white/10 bg-black/40 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          {SETTINGS_TABS.map((tab) => (
            <a
              key={tab.id}
              href={`#${tab.id}`}
              className="flex h-8 flex-shrink-0 items-center rounded-md px-2 text-sm text-white/55 transition-colors hover:text-white sm:px-3"
            >
              {tab.label}
            </a>
          ))}
        </div>
        <div className="grid gap-5">
          <SettingsSection
            id="account"
            title="Account"
            description="Basic account details for your signed-in Freebuff account."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadOnlyField label="Name" value={user?.name || "Not set"} />
              <ReadOnlyField label="Email" value={user?.email || "Not set"} />
              <ReadOnlyField
                label="Plan"
                value={(user?.tier || "free").toUpperCase()}
              />
              <ReadOnlyField
                label="Role"
                value={(user?.role || "member").toUpperCase()}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            id="ai-credentials"
            title="AI credentials"
            description="Manage user-level BYOK credentials for Codex/GPT and Claude across all your projects."
          >
            <div className="grid gap-4">
              <div className="rounded-md border border-border/60 bg-background/30 p-4">
                <p className="text-sm font-medium text-foreground">Codex / GPT authentication</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose OAuth via ChatGPT or your own OpenAI API key.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await setCliPreference({ key: "gpt_auth_method", value: "oauth" });
                        if (byokSettings?.hasCodexOauth) {
                          toast.success("Codex auth mode set to OAuth");
                        } else {
                          toast.info(
                            "OAuth mode selected. Connect ChatGPT from a Codex chat before sending.",
                          );
                        }
                      } catch {
                        toast.error("Failed to update Codex auth method");
                      }
                    }}
                    className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors ${
                      (byokSettings?.gptAuthMethod ?? "oauth") === "oauth"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    OAuth (ChatGPT)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await setCliPreference({ key: "gpt_auth_method", value: "byok" });
                        if (byokSettings?.hasOpenAiApiKey) {
                          toast.success("Codex auth mode set to BYOK");
                        } else {
                          toast.info(
                            "BYOK mode selected. Save an OpenAI API key to use Codex.",
                          );
                        }
                      } catch {
                        toast.error("Failed to update Codex auth method");
                      }
                    }}
                    className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors ${
                      byokSettings?.gptAuthMethod === "byok"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    BYOK (OpenAI API key)
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  OAuth status: {byokSettings?.hasCodexOauth ? "Connected" : "Not connected"} · BYOK key: {byokSettings?.hasOpenAiApiKey ? "Saved" : "Not saved"}
                </p>
                {(byokSettings?.gptAuthMethod ?? "oauth") === "oauth" ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConnectCodexOauth(byokSettings?.hasCodexOauth === true)}
                        disabled={isStartingOauthConnect}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-xs text-foreground transition-colors hover:bg-muted disabled:text-muted-foreground"
                      >
                        {isStartingOauthConnect && (
                          <Loader className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {byokSettings?.hasCodexOauth ? "Reconnect OAuth" : "Connect OAuth"}
                      </button>
                      {codexOauthAuthUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(codexOauthAuthUrl, "_blank", "noopener,noreferrer")}
                          className="inline-flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          Open auth page
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {byokSettings?.hasCodexOauth && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await clearCodexOauthAuth({});
                              setCodexOauthAuthUrl(null);
                              setCodexOauthOneTimeCode(null);
                              toast.success("Codex OAuth disconnected");
                            } catch {
                              toast.error("Failed to disconnect Codex OAuth");
                            }
                          }}
                          className="inline-flex h-8 items-center gap-2 rounded-md border border-destructive/50 bg-background px-3 text-xs text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Disconnect OAuth
                        </button>
                      )}
                    </div>
                    {codexOauthOneTimeCode && (
                      <p className="text-xs text-muted-foreground">
                        One-time code: <span className="font-semibold text-foreground">{codexOauthOneTimeCode}</span>
                      </p>
                    )}
                    {!byokSettings?.hasCodexOauth && !codexOauthOneTimeCode && (
                      <p className="text-xs text-muted-foreground">
                        Click Connect OAuth to start ChatGPT device auth.
                      </p>
                    )}
                  </div>
                ) : (
                  <ByokSecretField
                    kind="openai"
                    hasSaved={!!byokSettings?.hasOpenAiApiKey}
                    placeholder="sk-..."
                    saveLabel="OpenAI API key"
                    removeLabel="OpenAI API key"
                  />
                )}
              </div>

              <div className="rounded-md border border-border/60 bg-background/30 p-4">
                <p className="text-sm font-medium text-foreground">Claude provider</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select Anthropic API key or AWS Bedrock bearer token.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await setCliPreference({ key: "claude_provider_preference", value: "anthropic" });
                        toast.success("Claude provider set to Anthropic");
                      } catch {
                        toast.error("Failed to set Claude provider");
                      }
                    }}
                    className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors ${
                      byokSettings?.claudeProviderPreference === "anthropic"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    Anthropic
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await setCliPreference({ key: "claude_provider_preference", value: "bedrock" });
                        toast.success("Claude provider set to Bedrock");
                      } catch {
                        toast.error("Failed to set Claude provider");
                      }
                    }}
                    className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors ${
                      (byokSettings?.claudeProviderPreference ?? "bedrock") ===
                      "bedrock"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    Bedrock
                  </button>
                </div>

                {byokSettings?.claudeProviderPreference === "anthropic" ? (
                  <ByokSecretField
                    kind="anthropic"
                    hasSaved={!!byokSettings?.hasAnthropicApiKey}
                    placeholder="sk-ant-..."
                    saveLabel="Anthropic API key"
                    removeLabel="Anthropic API key"
                  />
                ) : (
                  <ByokSecretField
                    kind="bedrock"
                    hasSaved={!!byokSettings?.hasBedrockBearerToken}
                    placeholder="Paste AWS_BEARER_TOKEN_BEDROCK"
                    saveLabel="Bedrock bearer token"
                    removeLabel="Bedrock bearer token"
                  />
                )}
              </div>

              <div className="flex items-start gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200/90">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  Credentials are encrypted before storage and applied at run time for all projects under your account.
                </p>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="community-profile"
            title="Community profile"
            description="These details are shown on your public community profile."
            action={
              currentUserId ? (
                <Link
                  href={`/web/community/profile/${currentUserId}`}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  View profile
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null
            }
          >
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Bio
                </label>
                <Textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Write a short bio..."
                  className="min-h-24 border-border/60 bg-background text-foreground placeholder:text-muted-foreground"
                  maxLength={200}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {bio.length}/200 characters
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ProfileInput
                  label="Website"
                  value={website}
                  onChange={setWebsite}
                  placeholder="https://..."
                />
                <ProfileInput
                  label="Twitter"
                  value={twitter}
                  onChange={setTwitter}
                  placeholder="@username"
                />
                <ProfileInput
                  label="GitHub"
                  value={github}
                  onChange={setGithub}
                  placeholder="username"
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile || profile === undefined}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:border disabled:border-border/60 disabled:bg-muted/30 disabled:text-muted-foreground"
                >
                  {isSavingProfile ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save profile
                </button>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="transfer-projects"
            title="Transfer projects"
            description="Import projects from an older Freebuff account by verifying the old account email."
          >
            {importStage === "email" && (
              <form onSubmit={handleSendImportCode} className="grid gap-3">
                <label className="text-xs font-medium text-muted-foreground">
                  Old account email
                </label>
                <div className="relative max-w-md">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    value={importEmail}
                    onChange={(event) => {
                      setImportEmail(event.target.value);
                      setImportError(null);
                    }}
                    placeholder="you@oldemail.com"
                    className="h-10 border-border/60 bg-background pl-9"
                    disabled={isImporting}
                  />
                </div>
                {importError && <ErrorText message={importError} />}
                <button
                  type="submit"
                  disabled={isImporting || !importEmail.trim()}
                  className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:border disabled:border-border/60 disabled:bg-muted/30 disabled:text-muted-foreground"
                >
                  {isImporting ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                  Send verification code
                </button>
              </form>
            )}

            {importStage === "code" && (
              <div className="grid gap-4">
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Enter the code sent to {importEmail}.
                  </p>
                  <InputOTP
                    maxLength={6}
                    value={importCode}
                    onChange={handleCodeChange}
                    disabled={isImporting}
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="h-11 w-10 text-base"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {importError && <ErrorText message={importError} />}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setImportStage("email");
                      setImportCode("");
                      setImportError(null);
                    }}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendImportCode()}
                    disabled={isImporting}
                    className="text-sm text-primary transition-colors hover:text-primary/80 disabled:text-muted-foreground"
                  >
                    Resend code
                  </button>
                </div>
              </div>
            )}

            {importStage === "success" && (
              <div className="flex items-start gap-3 rounded-md border border-emerald-400/35 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Transfer complete</p>
                  <p className="mt-1 text-emerald-200/80">
                    {importedProjectCount} project
                    {importedProjectCount === 1 ? "" : "s"} moved or linked to
                    this account.
                  </p>
                </div>
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            id="linked-github"
            title="Linked GitHub"
            description="Connect GitHub for repository sync and project publishing workflows."
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {githubConnectionStatus === undefined ? (
                  <p className="text-sm text-muted-foreground">
                    Checking GitHub connection...
                  </p>
                ) : githubConnectionStatus?.status === "not_connected" ||
                  githubConnectionStatus === null ? (
                  <p className="text-sm text-muted-foreground">
                    No GitHub account connected.
                  </p>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      @{githubConnectionStatus.github_username}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {githubConnectionStatus.status === "app_installed"
                        ? "GitHub App installed"
                        : "GitHub account identified. Install the app to enable repository sync."}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConnectGithub}
                  disabled={isConnectingGithub}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:border disabled:border-border/60 disabled:bg-muted/30 disabled:text-muted-foreground"
                >
                  {isConnectingGithub ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="h-4 w-4" />
                  )}
                  {githubConnectionStatus?.status === "user_identified"
                    ? "Install app"
                    : "Connect GitHub"}
                </button>
                {githubConnectionStatus &&
                  githubConnectionStatus.status !== "not_connected" && (
                    <button
                      type="button"
                      onClick={handleDisconnectGithub}
                      disabled={isDisconnectingGithub}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted disabled:bg-muted/20 disabled:text-muted-foreground"
                    >
                      {isDisconnectingGithub && (
                        <Loader className="h-4 w-4 animate-spin" />
                      )}
                      Disconnect
                    </button>
                  )}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="sign-in-methods"
            title="Sign-in methods"
            description="Link GitHub and Google so you can sign in with either and always land on this same account. Linking GitHub also lets you qualify for referral bonuses."
          >
            <SignInMethodsSection />
          </SettingsSection>
        </div>
      </div>
    </AppShell>
  );
}

function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-white/55">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-xs font-medium text-white/55">{label}</div>
      <div className="mt-1 truncate text-sm text-white">{value}</div>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="border-border/60 bg-background text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
