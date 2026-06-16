"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LINK_NO_MATCH_ERROR } from "@codebuff/auth/constants";

import type { LinkedProvidersData } from "@/app/api/account/providers/route";

import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import { clearLinkIntent, startProviderLink } from "@/lib/link-provider";

const PROVIDERS: { id: string; label: string; domain: string }[] = [
  { id: "github", label: "GitHub", domain: "github.com" },
  { id: "google", label: "Google", domain: "google.com" },
];

const LINK_ERROR_MESSAGES: Record<string, string> = {
  [LINK_NO_MATCH_ERROR]:
    "That account isn’t linked to any Freebuff user yet. To link it, sign in with it once using the same email as this account.",
  OAuthAccountNotLinked:
    "That account is already associated with a different Freebuff user. Sign in with your original provider instead.",
};

const RETURN_PATH = "/web/settings?tab=sign-in-methods";

export function SignInMethodsSection() {
  const [providers, setProviders] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/account/providers")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: LinkedProvidersData) => {
        if (active) setProviders(data.providers);
      })
      .catch(() => {
        if (active) setProviders([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // We've returned from any link attempt; clear the intent cookie so a later
  // unrelated sign-in isn't treated as a link. Surface any link error.
  useEffect(() => {
    clearLinkIntent();
    const error = new URLSearchParams(window.location.search).get("error");
    if (error && LINK_ERROR_MESSAGES[error]) {
      toast.error(LINK_ERROR_MESSAGES[error]);
    }
  }, []);

  const linked = new Set(providers ?? []);

  return (
    <div className="space-y-3">
      {PROVIDERS.map((provider) => {
        const isLinked = linked.has(provider.id);
        return (
          <div
            key={provider.id}
            className="flex items-center gap-4 rounded-md border border-border/50 bg-background p-3"
          >
            <img
              src={`https://s2.googleusercontent.com/s2/favicons?domain=${provider.domain}&sz=64`}
              width={20}
              height={20}
              className="size-5 rounded-full"
              alt={`${provider.label} logo`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {provider.label}
              </p>
            </div>
            {providers === null ? null : isLinked ? (
              <Badge variant="secondary">Connected</Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startProviderLink(provider.id, RETURN_PATH)}
              >
                Link {provider.label}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
