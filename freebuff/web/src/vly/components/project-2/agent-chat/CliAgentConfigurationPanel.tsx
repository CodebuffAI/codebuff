"use client";

import { api } from "@/convex/_generated/api";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { cn } from "@/vly/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Copy, ExternalLink, Loader, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type CliAgentType = "Freebuff" | "Codex" | "Claude Code";
type ByokKind = "openai" | "anthropic" | "bedrock";
type PanelAgent = Exclude<CliAgentType, "Freebuff">;

const CODEX_MODEL_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "gpt-5.5", label: "GPT 5.5" },
  { value: "gpt-5.4", label: "GPT 5.4" },
  { value: "gpt-5.4-mini", label: "GPT 5.4 Mini" },
] as const;

const CLAUDE_ANTHROPIC_MODEL_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const;

const CLAUDE_BEDROCK_MODEL_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "us.anthropic.claude-opus-4-8", label: "US Opus 4.8" },
  { value: "us.anthropic.claude-sonnet-4-6", label: "US Sonnet 4.6" },
  {
    value: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    label: "US Haiku 4.5",
  },
] as const;

const MASKED_SECRET = "••••••••••••••••";
type CliByokSettings = FunctionReturnType<typeof api.users.getCliByokSettings>;

export function isCodexConfigured(
  settings: CliByokSettings | undefined,
) {
  if (!settings) return false;
  return settings.gptAuthMethod === "byok"
    ? settings.hasOpenAiApiKey
    : settings.hasCodexOauth;
}

export function isClaudeCodeConfigured(
  settings: CliByokSettings | undefined,
) {
  if (!settings) return false;
  return settings.claudeProviderPreference === "anthropic"
    ? settings.hasAnthropicApiKey
    : settings.hasBedrockBearerToken;
}

export function isCliAgentConfigured(
  agentType: CliAgentType | undefined,
  settings: CliByokSettings | undefined,
) {
  if (agentType === "Codex") return isCodexConfigured(settings);
  if (agentType === "Claude Code") return isClaudeCodeConfigured(settings);
  return true;
}

export function AgentLogo({
  agentType,
  className,
}: {
  agentType: CliAgentType;
  className?: string;
}) {
  if (agentType === "Freebuff") {
    return (
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-icon.png"
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      </span>
    );
  }

  if (agentType === "Codex") {
    return (
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-[#111111]",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/codex.svg"
          alt=""
          className="h-4 w-4 object-contain"
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-[#d97757]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://cdn.simpleicons.org/claude/white"
        alt=""
        className="h-3.5 w-3.5 object-contain"
        draggable={false}
      />
    </span>
  );
}

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
        <Button
          type="button"
          size="sm"
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
          className="h-8 gap-2 text-xs"
        >
          {isSaving && <Loader className="h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
        {hasSaved && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await clearCliByokCredential({ credential: kind });
                setValue("");
                toast.success(`${removeLabel} removed`);
              } catch {
                toast.error(`Failed to remove ${removeLabel}`);
              }
            }}
            className="h-8 gap-2 border-destructive/50 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

function ChoiceButton({
  active,
  configured,
  children,
  onClick,
}: {
  active: boolean;
  configured: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border/60 bg-background text-foreground hover:bg-muted",
      )}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {children}
      <span className="text-[10px] font-normal text-muted-foreground">
        {configured ? "Configured" : "Needs setup"}
      </span>
    </button>
  );
}

function ConfigCard({
  agent,
  children,
}: {
  agent: PanelAgent;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <AgentLogo agentType={agent} className="h-5 w-5" />
        <p className="text-[13px] font-medium text-foreground">
          {agent === "Codex" ? "Codex authentication" : "Claude Code provider"}
        </p>
      </div>
      {children}
    </div>
  );
}

export function CliAgentConfigurationPanel({
  agent,
  projectSemanticIdentifier,
  variant = "settings",
  className,
}: {
  agent?: PanelAgent;
  projectSemanticIdentifier?: string;
  variant?: "settings" | "chat";
  className?: string;
}) {
  const settings = useQuery(api.users.getCliByokSettings);
  const userProjects = useQuery(api.project.getUserProjects, {});
  const setCliPreference = useMutation(api.users.setCliPreference);
  const clearCodexOauthAuth = useMutation(api.users.clearCodexOauthAuth);
  const startCodexDeviceAuth = useAction(
    api.coding_agent.cli_agent.execute.startCodexDeviceAuth,
  );
  const getCodexDeviceAuthStatus = useAction(
    api.coding_agent.cli_agent.execute.getCodexDeviceAuthStatus,
  );

  const [isStartingOauthConnect, setIsStartingOauthConnect] = useState(false);
  const [isVerifyingOauth, setIsVerifyingOauth] = useState(false);
  const [hasStartedOauthConnect, setHasStartedOauthConnect] = useState(false);
  const [copiedOneTimeCode, setCopiedOneTimeCode] = useState(false);
  const [codexOauthAuthUrl, setCodexOauthAuthUrl] = useState<string | null>(
    null,
  );
  const [codexOauthOneTimeCode, setCodexOauthOneTimeCode] = useState<
    string | null
  >(null);

  const effectiveProjectSemanticIdentifier = useMemo(
    () => projectSemanticIdentifier ?? userProjects?.[0]?.semantic_identifier,
    [projectSemanticIdentifier, userProjects],
  );

  const handleConnectCodexOauth = async (forceReauth = false) => {
    if (!effectiveProjectSemanticIdentifier) {
      toast.error("Open a project first, then connect Codex OAuth.");
      return;
    }

    setIsStartingOauthConnect(true);
    try {
      const result = await startCodexDeviceAuth({
        projectSemanticIdentifier: effectiveProjectSemanticIdentifier,
        forceReauth,
      });
      if (!result.success) {
        toast.error(result.message || "Failed to start Codex OAuth");
        return;
      }

      setCodexOauthAuthUrl(result.authUrl ?? null);
      setCodexOauthOneTimeCode(result.oneTimeCode ?? null);

      if (result.alreadyAuthenticated && result.isAuthenticated) {
        setHasStartedOauthConnect(false);
        toast.success("Codex OAuth already connected");
        return;
      }

      if (result.authUrl || result.oneTimeCode) {
        setHasStartedOauthConnect(true);
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

  const handleVerifyCodexOauth = async () => {
    if (!effectiveProjectSemanticIdentifier) {
      toast.error("Open a project first, then verify Codex OAuth.");
      return;
    }

    setIsVerifyingOauth(true);
    try {
      const status = await getCodexDeviceAuthStatus({
        projectSemanticIdentifier: effectiveProjectSemanticIdentifier,
      });
      if (status.success && status.isAuthenticated) {
        setHasStartedOauthConnect(false);
        setCodexOauthAuthUrl(null);
        setCodexOauthOneTimeCode(null);
        toast.success("ChatGPT connected");
      } else {
        toast.error(
          status.message ||
            "Not connected yet. Finish the steps above, then verify again.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to verify Codex OAuth",
      );
    } finally {
      setIsVerifyingOauth(false);
    }
  };

  const handleCopyOneTimeCode = async () => {
    if (!codexOauthOneTimeCode) return;
    try {
      await navigator.clipboard.writeText(codexOauthOneTimeCode);
      setCopiedOneTimeCode(true);
      setTimeout(() => setCopiedOneTimeCode(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const showCodex = !agent || agent === "Codex";
  const showClaude = !agent || agent === "Claude Code";
  const gptAuthMethod = settings?.gptAuthMethod ?? "oauth";
  const gptModelPreference = settings?.gptModelPreference ?? "default";
  const claudeProvider = settings?.claudeProviderPreference ?? "bedrock";
  const claudeModelPreference = settings?.claudeModelPreference ?? "default";

  return (
    <div className={cn("grid gap-4", className)}>
      {variant === "chat" && agent && (
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Configure {agent}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {agent} is disabled until the selected user-owned credential is
            configured.
          </p>
        </div>
      )}

      {showCodex && (
        <ConfigCard agent="Codex">
          <p className="mt-2 text-xs text-muted-foreground">
            Use either ChatGPT OAuth or your own OpenAI API key. Freebuff never
            falls back to a platform OpenAI key for Codex runs.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ChoiceButton
              active={gptAuthMethod === "oauth"}
              configured={!!settings?.hasCodexOauth}
              onClick={async () => {
                try {
                  await setCliPreference({
                    key: "gpt_auth_method",
                    value: "oauth",
                  });
                  toast.success("Codex auth mode set to OAuth");
                } catch {
                  toast.error("Failed to update Codex auth method");
                }
              }}
            >
              ChatGPT OAuth
            </ChoiceButton>
            <ChoiceButton
              active={gptAuthMethod === "byok"}
              configured={!!settings?.hasOpenAiApiKey}
              onClick={async () => {
                try {
                  await setCliPreference({
                    key: "gpt_auth_method",
                    value: "byok",
                  });
                  toast.success("Codex auth mode set to BYOK");
                } catch {
                  toast.error("Failed to update Codex auth method");
                }
              }}
            >
              OpenAI BYOK
            </ChoiceButton>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            OAuth: {settings?.hasCodexOauth ? "Connected" : "Not connected"} ·
            OpenAI key: {settings?.hasOpenAiApiKey ? "Saved" : "Not saved"}
          </p>
          <div className="mt-3">
            <p className="text-xs text-muted-foreground">Codex model</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CODEX_MODEL_OPTIONS.map((model) => (
                <ChoiceButton
                  key={model.value}
                  active={gptModelPreference === model.value}
                  configured={true}
                  onClick={() =>
                    void setCliPreference({
                      key: "gpt_model_preference",
                      value: model.value,
                    })
                  }
                >
                  {model.label}
                </ChoiceButton>
              ))}
            </div>
          </div>
          {gptAuthMethod === "oauth" ? (
            <div className="mt-3 space-y-3">
              {hasStartedOauthConnect &&
                (codexOauthOneTimeCode || codexOauthAuthUrl) && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                    <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
                      <li>Open the ChatGPT authorization page.</li>
                      <li>Paste this code when prompted.</li>
                      <li>
                        In ChatGPT, enable{" "}
                        <span className="font-medium text-foreground">
                          Codex device auth
                        </span>{" "}
                        under{" "}
                        <span className="font-medium text-foreground">
                          Settings → Security
                        </span>
                        .
                      </li>
                      <li>
                        Come back here and press{" "}
                        <span className="font-medium text-foreground">
                          Verify
                        </span>
                        .
                      </li>
                    </ol>
                    {codexOauthOneTimeCode && (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold tracking-widest text-foreground">
                          {codexOauthOneTimeCode}
                        </code>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCopyOneTimeCode()}
                          className="h-8 gap-1.5 text-xs"
                        >
                          {copiedOneTimeCode ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copiedOneTimeCode ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    )}
                    {codexOauthAuthUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          window.open(
                            codexOauthAuthUrl,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        className="h-8 gap-2 text-xs"
                      >
                        Open auth page
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {hasStartedOauthConnect ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => void handleVerifyCodexOauth()}
                      disabled={isVerifyingOauth}
                      className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                    >
                      {isVerifyingOauth ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Verify
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void handleConnectCodexOauth(
                          settings?.hasCodexOauth === true,
                        )
                      }
                      disabled={isStartingOauthConnect}
                      className="h-8 gap-1.5 text-xs text-muted-foreground"
                    >
                      {isStartingOauthConnect && (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Get new code
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={() =>
                      void handleConnectCodexOauth(
                        settings?.hasCodexOauth === true,
                      )
                    }
                    disabled={isStartingOauthConnect}
                    className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                  >
                    {isStartingOauthConnect && (
                      <Loader className="h-4 w-4 animate-spin" />
                    )}
                    {settings?.hasCodexOauth
                      ? "Reconnect ChatGPT"
                      : "Connect ChatGPT"}
                  </Button>
                )}
                {settings?.hasCodexOauth && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await clearCodexOauthAuth({});
                        setHasStartedOauthConnect(false);
                        setCodexOauthAuthUrl(null);
                        setCodexOauthOneTimeCode(null);
                        toast.success("Codex OAuth disconnected");
                      } catch {
                        toast.error("Failed to disconnect Codex OAuth");
                      }
                    }}
                    className="h-8 gap-2 border-destructive/50 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ByokSecretField
              kind="openai"
              hasSaved={!!settings?.hasOpenAiApiKey}
              placeholder="sk-..."
              saveLabel="OpenAI API key"
              removeLabel="OpenAI API key"
            />
          )}
        </ConfigCard>
      )}

      {showClaude && (
        <ConfigCard agent="Claude Code">
          <p className="mt-2 text-xs text-muted-foreground">
            Use either an Anthropic API key or an AWS Bedrock bearer token.
            Freebuff never falls back to platform Anthropic or AWS credentials
            for Claude Code runs.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ChoiceButton
              active={claudeProvider === "anthropic"}
              configured={!!settings?.hasAnthropicApiKey}
              onClick={async () => {
                try {
                  await setCliPreference({
                    key: "claude_provider_preference",
                    value: "anthropic",
                  });
                  await setCliPreference({
                    key: "claude_model_preference",
                    value: "claude-sonnet-4-6",
                  });
                  toast.success("Claude provider set to Anthropic");
                } catch {
                  toast.error("Failed to set Claude provider");
                }
              }}
            >
              Anthropic BYOK
            </ChoiceButton>
            <ChoiceButton
              active={claudeProvider === "bedrock"}
              configured={!!settings?.hasBedrockBearerToken}
              onClick={async () => {
                try {
                  await setCliPreference({
                    key: "claude_provider_preference",
                    value: "bedrock",
                  });
                  await setCliPreference({
                    key: "claude_model_preference",
                    value: "us.anthropic.claude-sonnet-4-6",
                  });
                  toast.success("Claude provider set to Bedrock");
                } catch {
                  toast.error("Failed to set Claude provider");
                }
              }}
            >
              AWS Bedrock BYOK
            </ChoiceButton>
          </div>
          <div className="mt-3">
            <p className="text-xs text-muted-foreground">Claude model</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(claudeProvider === "bedrock"
                ? CLAUDE_BEDROCK_MODEL_OPTIONS
                : CLAUDE_ANTHROPIC_MODEL_OPTIONS
              ).map((model) => (
                <ChoiceButton
                  key={model.value}
                  active={claudeModelPreference === model.value}
                  configured={true}
                  onClick={() =>
                    void setCliPreference({
                      key: "claude_model_preference",
                      value: model.value,
                    })
                  }
                >
                  {model.label}
                </ChoiceButton>
              ))}
            </div>
          </div>
          {claudeProvider === "anthropic" ? (
            <ByokSecretField
              kind="anthropic"
              hasSaved={!!settings?.hasAnthropicApiKey}
              placeholder="sk-ant-..."
              saveLabel="Anthropic API key"
              removeLabel="Anthropic API key"
            />
          ) : (
            <ByokSecretField
              kind="bedrock"
              hasSaved={!!settings?.hasBedrockBearerToken}
              placeholder="Paste AWS_BEARER_TOKEN_BEDROCK"
              saveLabel="Bedrock bearer token"
              removeLabel="Bedrock bearer token"
            />
          )}
        </ConfigCard>
      )}

      {variant === "settings" && (
        <p className="border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
          Credentials are encrypted before storage and applied at run time for
          all projects under your account.
        </p>
      )}
    </div>
  );
}
