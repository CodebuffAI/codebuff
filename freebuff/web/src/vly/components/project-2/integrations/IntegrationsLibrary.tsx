"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Compass,
  KeyRound,
  Loader,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { toast } from "sonner";
import { useDebounce } from "@/vly/lib/hooks/use-debounce";
import { useIsMobile } from "@/vly/hooks/use-mobile";

interface IntegrationsLibraryProps {
  semanticIdentifier: string;
}

/** Loosely-typed Gravity catalog shapes: the upstream API owns the schema,
 *  so every field is optional and rendered defensively. */
interface GravityService {
  name?: string;
  slug?: string;
  category?: string;
  description?: string;
  tagline?: string;
  website_url?: string;
  docs_url?: string;
}

interface GravityServiceDetail extends GravityService {
  install?: {
    summary?: string;
    steps?: string[];
    env_vars?: string[];
  };
  env_vars?: string[];
}

interface GravityCategory {
  name: string;
  count?: number;
}

async function gravityRequest<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/web/gravity-index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (json as { error?: string } | null)?.error ??
        "Failed to load the integration catalog",
    );
  }
  return json as T;
}

function normalizeCategories(raw: unknown): GravityCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): GravityCategory | null => {
      if (typeof entry === "string") return { name: entry };
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const name = record.name ?? record.category ?? record.slug;
        if (typeof name !== "string" || !name) return null;
        return {
          name,
          count: typeof record.count === "number" ? record.count : undefined,
        };
      }
      return null;
    })
    .filter((c): c is GravityCategory => c !== null);
}

function normalizeServices(raw: unknown): GravityService[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is GravityService =>
      !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

/**
 * Gravity-powered integration catalog. Replaces the old hand-maintained
 * Convex integration library: services come live from the Gravity Index
 * (via the read-only /api/web/gravity-index proxy), and integrating is
 * delegated to the Freebuff agent through a prefilled chat message.
 */
export function IntegrationsLibrary({
  semanticIdentifier,
}: IntegrationsLibraryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const isMobile = useIsMobile();

  const [categories, setCategories] = useState<GravityCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const [services, setServices] = useState<GravityService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<GravityServiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fill the panel below the top bar (same trick as the old library view).
  useEffect(() => {
    const compute = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      setAvailableHeight(Math.max(0, window.innerHeight - rect.top));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Categories load once.
  useEffect(() => {
    let cancelled = false;
    gravityRequest<{ categories?: unknown }>({ action: "list_categories" })
      .then((data) => {
        if (!cancelled) setCategories(normalizeCategories(data.categories));
      })
      .catch(() => {
        // Non-fatal: the catalog still works without category chips.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Service list tracks the category filter + keyword search.
  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    setServicesError(null);
    gravityRequest<{ services?: unknown }>({
      action: "browse",
      ...(selectedCategory ? { category: selectedCategory } : {}),
      ...(debouncedSearchQuery.trim()
        ? { q: debouncedSearchQuery.trim() }
        : {}),
    })
      .then((data) => {
        if (cancelled) return;
        setServices(normalizeServices(data.services));
        setServicesLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setServicesError(
          error instanceof Error
            ? error.message
            : "Failed to load the integration catalog",
        );
        setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategory, debouncedSearchQuery]);

  // Detail panel tracks the selected service.
  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    gravityRequest<GravityServiceDetail>({
      action: "get_service",
      slug: selectedSlug,
    })
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setDetailLoading(false);
        toast.error("Couldn't load service details");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  const handleServiceSelect = (slug: string | undefined) => {
    if (!slug) return;
    setSelectedSlug(slug);
    if (isMobile && detailsRef.current) {
      setTimeout(() => {
        detailsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  };

  /** Hand off to the agent: prefill the chat input (same localStorage draft
   *  mechanism as the "Add to Chat" flow) and navigate to the editor. */
  const handleAskBuffy = (service: GravityService) => {
    const name = service.name ?? service.slug ?? "this service";
    const slugPart = service.slug ? ` (slug: ${service.slug})` : "";
    const message = `Integrate ${name}${slugPart} into my project. Use the gravity_index tool to get the install steps and required API keys, implement the integration, and tell me exactly which keys to add in the Keys tab.`;
    localStorage.setItem(`chat-draft-${semanticIdentifier}`, message);
    toast.success("Opening chat with the integration request");
    window.location.href = `/web/project/${semanticIdentifier}`;
  };

  const envVars = detail?.install?.env_vars ?? detail?.env_vars ?? [];
  const detailService =
    detail ?? services.find((s) => s.slug === selectedSlug) ?? null;

  return (
    <div
      ref={rootRef}
      className="-mt-2 flex min-h-0 max-w-full flex-col overflow-hidden lg:flex-row"
      style={{ height: availableHeight ?? undefined }}
    >
      {/* Sidebar: search + category chips + service list */}
      <div
        className={`${isMobile ? "w-full border-b border-r-0" : "h-full w-80"} flex min-h-0 flex-shrink-0 flex-col border-r`}
      >
        <div className="flex-shrink-0 border-b p-2 pl-4">
          <div className="mb-2 flex items-center gap-2">
            <Compass className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Integration Catalog</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          {categories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  selectedCategory === null
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(
                      selectedCategory === category.name
                        ? null
                        : category.name,
                    )
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    selectedCategory === category.name
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {category.name}
                  {category.count !== undefined ? ` (${category.count})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="space-y-1 p-2">
            {servicesLoading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                <Loader className="mr-2 h-5 w-5 animate-spin text-gray-400" />
                Loading services...
              </div>
            ) : servicesError ? (
              <div className="p-3 text-sm text-muted-foreground">
                {servicesError}
              </div>
            ) : services.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                No services found. Try a different search or category.
              </div>
            ) : (
              services.map((service) => (
                <div
                  key={service.slug ?? service.name}
                  role="button"
                  tabIndex={0}
                  className={`flex w-full flex-col gap-0.5 rounded-lg p-3 text-left transition-colors ${
                    selectedSlug === service.slug
                      ? "bg-gray-100 dark:bg-gray-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                  onClick={() => handleServiceSelect(service.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleServiceSelect(service.slug);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {service.name ?? service.slug}
                    </span>
                    {service.category && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {service.category}
                      </span>
                    )}
                  </div>
                  {(service.tagline || service.description) && (
                    <p className="max-w-full truncate text-sm text-gray-500 dark:text-gray-400">
                      {service.tagline ?? service.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <div className="min-h-0 min-w-0 flex-1 lg:h-full" ref={detailsRef}>
        <div className="h-full overflow-y-auto">
          <div className="max-w-full p-4 sm:p-6">
            {!selectedSlug ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-gray-500">
                <Compass className="h-8 w-8 opacity-40" />
                <p>Select a service to view details</p>
                <p className="max-w-sm text-sm">
                  Pick a service and Buffy will research it, wire it up, and
                  tell you which API keys to add.
                </p>
              </div>
            ) : detailLoading && !detailService ? (
              <div className="flex h-48 items-center justify-center text-gray-500">
                <Loader className="mr-2 h-5 w-5 animate-spin text-gray-400" />
                Loading service details...
              </div>
            ) : detailService ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold sm:text-2xl">
                      {detailService.name ?? detailService.slug}
                    </h2>
                    {detailService.category && (
                      <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {detailService.category}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => handleAskBuffy(detailService)}
                    className="flex items-center gap-2 sm:ml-auto"
                    size={isMobile ? "sm" : "default"}
                  >
                    <Sparkles className="h-4 w-4" />
                    Ask Buffy to integrate
                  </Button>
                </div>

                {(detailService.description || detailService.tagline) && (
                  <div>
                    <h3 className="mb-2 font-medium">Description</h3>
                    <p className="break-words">
                      {detailService.description ?? detailService.tagline}
                    </p>
                  </div>
                )}

                {detail?.install?.summary && (
                  <div>
                    <h3 className="mb-2 font-medium">Setup</h3>
                    <p className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm dark:bg-gray-900">
                      {detail.install.summary}
                    </p>
                  </div>
                )}

                {envVars.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 font-medium">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      API Keys
                    </h3>
                    <div className="space-y-1">
                      {envVars.map((envVar) => (
                        <div key={envVar} className="font-mono text-sm">
                          {envVar}
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Buffy will tell you when to add these in the Keys tab.
                    </p>
                  </div>
                )}

                {(detailService.docs_url || detailService.website_url) && (
                  <div>
                    <h3 className="mb-2 font-medium">Links</h3>
                    <div className="flex flex-col gap-1">
                      {detailService.docs_url && (
                        <a
                          href={detailService.docs_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          Documentation
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                      {detailService.website_url && (
                        <a
                          href={detailService.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                        >
                          Website
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-gray-500">
                Couldn't load this service. Try another one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
