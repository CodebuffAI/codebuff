"use client";

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import Link from "next/link";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/vly/components/app-shell/AppShell";
import { SignInMethodsSection } from "./sign-in-methods-section";
import { CliAgentConfigurationPanel } from "@/vly/components/project-2/agent-chat/CliAgentConfigurationPanel";
import {
  SettingsScaffold,
  SettingsSection,
  SettingsRow,
  SettingsValue,
  type SettingsNavItem,
} from "@/vly/components/settings/SettingsScaffold";
import { Input } from "@/vly/components/ui/input";
import { Textarea } from "@/vly/components/ui/textarea";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/vly/components/ui/input-otp";
import { Loader } from "lucide-react";
import { toast } from "sonner";

type ImportStage = "email" | "code" | "success";
type SettingsSectionId =
  | "account"
  | "ai-credentials"
  | "community-profile"
  | "transfer-projects"
  | "linked-github"
  | "sign-in-methods";

const SETTINGS_TABS: SettingsNavItem[] = [
  { id: "account", label: "Account" },
  { id: "ai-credentials", label: "AI credentials" },
  { id: "community-profile", label: "Community profile" },
  { id: "transfer-projects", label: "Transfer projects" },
  { id: "linked-github", label: "Linked GitHub" },
  { id: "sign-in-methods", label: "Sign-in methods" },
];

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export default function GeneralSettingsPage() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.viewer);
  const currentUserId = useQuery(api.community.getCurrentUserId);
  const profile = useQuery(
    api.community.getUserProfile,
    currentUserId ? { userId: currentUserId } : "skip",
  );
  const githubConnectionStatus = useQuery(
    api.github.auth.connections.getGitHubConnectionStatus,
  );

  const updateProfile = useMutation(api.community.updateProfile);
  const requestOtp = useAction(api.import_projects.requestImportOtp);
  const verifyAndImport = useMutation(api.import_projects.verifyAndImport);
  const initiateGithubAuth = useAction(api.github.auth.oauth.initiateGitHubAuth);
  const disconnectGitHub = useMutation(
    api.github.auth.connections.disconnectGitHub,
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

  const [section, setSection] = useState<SettingsSectionId>("account");

  // Honor deep links (#account, ?tab=sign-in-methods) so existing links land
  // on the right section.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    const tab = new URLSearchParams(window.location.search).get("tab") ?? "";
    const target = isSettingsSectionId(hash)
      ? hash
      : isSettingsSectionId(tab)
        ? tab
        : null;
    if (target) setSection(target);
  }, []);

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
    if (!isAuthenticated) {
      toast.error("Please sign in before connecting GitHub.");
      return;
    }
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

  return (
    <AppShell title="Settings">
      <SettingsScaffold
        items={SETTINGS_TABS}
        active={section}
        onSelect={(id) => setSection(id as SettingsSectionId)}
      >
        {section === "account" && (
          <SettingsSection
            title="Account"
            description="Basic account details for your signed-in Freebuff account."
          >
            <SettingsRow
              label="Name"
              control={<SettingsValue>{user?.name || "Not set"}</SettingsValue>}
            />
            <SettingsRow
              label="Email"
              control={<SettingsValue>{user?.email || "Not set"}</SettingsValue>}
            />
            <SettingsRow
              label="Plan"
              control={
                <SettingsValue>
                  {(user?.tier || "free").toUpperCase()}
                </SettingsValue>
              }
            />
            <SettingsRow
              label="Role"
              control={
                <SettingsValue>
                  {(user?.role || "member").toUpperCase()}
                </SettingsValue>
              }
            />
          </SettingsSection>
        )}

        {section === "ai-credentials" && (
          <SettingsSection
            title="AI credentials"
            description="Choose and configure the user-owned credentials for Codex and Claude Code."
          >
            <CliAgentConfigurationPanel />
          </SettingsSection>
        )}

        {section === "community-profile" && (
          <SettingsSection
            title="Community profile"
            description="These details are shown on your public community profile."
            action={
              currentUserId ? (
                <Link
                  href={`/web/community/profile/${currentUserId}`}
                  className="inline-flex h-8 flex-shrink-0 items-center rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  View profile
                </Link>
              ) : null
            }
          >
            <SettingsRow
              label="Bio"
              description="A short intro shown on your profile."
              stacked
              control={
                <div>
                  <Textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder="Write a short bio..."
                    className="min-h-24 w-full border-border/60 bg-input text-foreground placeholder:text-muted-foreground"
                    maxLength={200}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {bio.length}/200 characters
                  </p>
                </div>
              }
            />
            <SettingsRow
              label="Website"
              control={
                <ProfileInput
                  value={website}
                  onChange={setWebsite}
                  placeholder="https://..."
                />
              }
            />
            <SettingsRow
              label="Twitter"
              control={
                <ProfileInput
                  value={twitter}
                  onChange={setTwitter}
                  placeholder="@username"
                />
              }
            />
            <SettingsRow
              label="GitHub"
              control={
                <ProfileInput
                  value={github}
                  onChange={setGithub}
                  placeholder="username"
                />
              }
            />
            <div className="mt-5">
              <PrimaryButton
                onClick={handleSaveProfile}
                disabled={isSavingProfile || profile === undefined}
                loading={isSavingProfile}
              >
                Save profile
              </PrimaryButton>
            </div>
          </SettingsSection>
        )}

        {section === "transfer-projects" && (
          <SettingsSection
            title="Transfer projects"
            description="Import projects from an older Freebuff account by verifying the old account email."
          >
            {importStage === "email" && (
              <form onSubmit={handleSendImportCode} className="max-w-md">
                <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                  Old account email
                </label>
                <Input
                  type="email"
                  value={importEmail}
                  onChange={(event) => {
                    setImportEmail(event.target.value);
                    setImportError(null);
                  }}
                  placeholder="you@oldemail.com"
                  className="h-10 border-border/60 bg-input"
                  disabled={isImporting}
                />
                {importError && <ErrorText message={importError} />}
                <div className="mt-4">
                  <PrimaryButton
                    type="submit"
                    disabled={isImporting || !importEmail.trim()}
                    loading={isImporting}
                  >
                    Send verification code
                  </PrimaryButton>
                </div>
              </form>
            )}

            {importStage === "code" && (
              <div className="max-w-md">
                <p className="mb-3 text-[13px] text-muted-foreground">
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
                {importError && <ErrorText message={importError} />}
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setImportStage("email");
                      setImportCode("");
                      setImportError(null);
                    }}
                    className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendImportCode()}
                    disabled={isImporting}
                    className="text-[13px] text-primary transition-colors hover:text-primary/80 disabled:text-muted-foreground"
                  >
                    Resend code
                  </button>
                </div>
              </div>
            )}

            {importStage === "success" && (
              <p className="text-[13px] text-foreground">
                Transfer complete — {importedProjectCount} project
                {importedProjectCount === 1 ? "" : "s"} moved or linked to this
                account.
              </p>
            )}
          </SettingsSection>
        )}

        {section === "linked-github" && (
          <SettingsSection
            title="Linked GitHub"
            description="Connect GitHub for repository sync and project publishing workflows."
          >
            <SettingsRow
              label={
                githubConnectionStatus === undefined
                  ? "Checking GitHub connection…"
                  : githubConnectionStatus?.status === "not_connected" ||
                      githubConnectionStatus === null
                    ? "No GitHub account connected"
                    : `@${githubConnectionStatus.github_username}`
              }
              description={
                githubConnectionStatus &&
                githubConnectionStatus.status !== "not_connected"
                  ? githubConnectionStatus.status === "app_installed"
                    ? "GitHub App installed."
                    : "GitHub account identified. Install the app to enable repository sync."
                  : undefined
              }
              control={
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton
                    onClick={handleConnectGithub}
                    disabled={isConnectingGithub}
                    loading={isConnectingGithub}
                  >
                    {githubConnectionStatus?.status === "user_identified"
                      ? "Install app"
                      : "Connect GitHub"}
                  </PrimaryButton>
                  {githubConnectionStatus &&
                    githubConnectionStatus.status !== "not_connected" && (
                      <SecondaryButton
                        onClick={handleDisconnectGithub}
                        disabled={isDisconnectingGithub}
                        loading={isDisconnectingGithub}
                      >
                        Disconnect
                      </SecondaryButton>
                    )}
                </div>
              }
            />
          </SettingsSection>
        )}

        {section === "sign-in-methods" && (
          <SettingsSection
            title="Sign-in methods"
            description="Link GitHub and Google so you can sign in with either and always land on this same account. Linking GitHub also lets a referral you were invited through count once you use Freebuff."
          >
            <SignInMethodsSection />
          </SettingsSection>
        )}
      </SettingsScaffold>
    </AppShell>
  );
}

function ProfileInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full border-border/60 bg-input text-foreground placeholder:text-muted-foreground sm:w-64"
    />
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
    >
      {loading && <Loader className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border/60 px-3 text-[13px] text-foreground transition-colors hover:bg-foreground/[0.06] disabled:cursor-not-allowed disabled:text-muted-foreground"
    >
      {loading && <Loader className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

function ErrorText({ message }: { message: string }) {
  return <p className="mt-2 text-[13px] text-destructive">{message}</p>;
}
