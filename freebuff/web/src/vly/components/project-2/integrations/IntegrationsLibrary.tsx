"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  KeyRound,
  LayoutGrid,
  List as ListIcon,
  Loader,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import {
  Dialog,
  DialogContent,
} from "@/vly/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/vly/lib/utils";
import { useDebounce } from "@/vly/lib/hooks/use-debounce";

interface IntegrationsLibraryProps {
  semanticIdentifier: string;
}

/**
 * Loosely-typed shapes for the live Gravity catalog. The upstream API
 * (index.trygravity.ai) owns the schema, so every field is optional and
 * rendered defensively. Field names mirror the real API payloads:
 * `install_summary`, `install_steps`, `env_vars_needed`, `logo_url`, etc.
 */
interface GravityInstallStep {
  step?: number;
  action?: string;
  command?: string;
  file?: string;
  content?: string;
  user_action?: string;
}

interface GravityService {
  service_id?: string;
  name?: string;
  slug?: string;
  category?: string;
  description?: string;
  logo_url?: string | null;
  website_url?: string;
  docs_url?: string;
  install_summary?: string;
  install_steps?: GravityInstallStep[];
  env_vars_needed?: string[];
  tags?: string[];
  quality_score?: number;
}

interface GravityCategory {
  name: string;
  count?: number;
}

/** A single ranked option returned by the Gravity `search` action. Each one
 *  carries a tracked `click_url` (a /go/{code} redirect) used for click
 *  attribution + CPA accounting. */
interface GravitySearchOption {
  slug?: string;
  name?: string;
  click_url?: string;
}

interface GravitySearchResponse {
  search_id?: string;
  recommendation?: GravitySearchOption;
  options?: GravitySearchOption[];
}

/** Tracked attribution handle for the service shown in the detail dialog. */
interface TrackedService {
  searchId: string;
  clickUrl?: string;
}

type SortKey = "recommended" | "name" | "category";
type ViewMode = "grid" | "list";

const PAGE_SIZE = 60;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "name", label: "Name (A–Z)" },
  { value: "category", label: "Category" },
];

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
        // Upstream uses `service_count`; tolerate `count` too.
        const rawCount = record.service_count ?? record.count;
        return {
          name,
          count: typeof rawCount === "number" ? rawCount : undefined,
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

function sortServices(
  services: GravityService[],
  sortKey: SortKey,
): GravityService[] {
  const byName = (a: GravityService, b: GravityService) =>
    (a.name ?? a.slug ?? "").localeCompare(b.name ?? b.slug ?? "");
  const sorted = [...services];
  switch (sortKey) {
    case "name":
      return sorted.sort(byName);
    case "category":
      return sorted.sort(
        (a, b) =>
          (a.category ?? "").localeCompare(b.category ?? "") || byName(a, b),
      );
    case "recommended":
    default:
      return sorted.sort(
        (a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0) || byName(a, b),
      );
  }
}

/** Deterministic-ish accent for the letter avatar fallback. */
function avatarAccent(seed: string): string {
  const palette = [
    "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

function ServiceLogo({
  service,
  size = "md",
}: {
  service: GravityService;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "lg" ? "h-10 w-10" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const label = (service.name ?? service.slug ?? "?").trim();
  const initial = label.charAt(0).toUpperCase() || "?";
  if (service.logo_url) {
    return (
      <img
        src={service.logo_url}
        alt=""
        className={cn(dim, "shrink-0 rounded-md object-contain")}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-md text-sm font-semibold",
        avatarAccent(label),
      )}
      aria-hidden
    >
      {initial}
    </div>
  );
}

/**
 * Gravity-powered integration catalog. Services come live from the Gravity
 * Index (via the read-only /api/web/gravity-index proxy). Browsing is
 * filter/search/sort-able; integrating is delegated to the Freebuff agent
 * through a prefilled chat message.
 */
export function IntegrationsLibrary({
  semanticIdentifier,
}: IntegrationsLibraryProps) {
  const [categories, setCategories] = useState<GravityCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 250);

  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [services, setServices] = useState<GravityService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<GravityService | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Attribution handle for the open service: a `search` is fired alongside
  // `get_service` so catalog conversions (clicking "Get API key" or the
  // Integrate hand-off) are tracked + CPA-reported against a real search_id.
  const [tracked, setTracked] = useState<TrackedService | null>(null);
  const [integrating, setIntegrating] = useState(false);

  // Mint a tracked Gravity search for a service: returns its search_id (always
  // present on success) plus the matching tracked click_url. The proxy stamps
  // surface/session attribution onto search requests, so the search_id is what
  // ties a later report_integration back to us for CPA credit.
  const mintTrackedSearch = useCallback(
    async (slug: string): Promise<TrackedService | null> => {
      try {
        const data = await gravityRequest<GravitySearchResponse>({
          action: "search",
          query: `Integrate ${slug.replace(/[-_]/g, " ")} into a React + Vite + Convex app`,
        });
        if (!data.search_id) return null;
        const candidates = [
          data.recommendation,
          ...(data.options ?? []),
        ].filter((o): o is GravitySearchOption => !!o);
        const match = candidates.find((o) => o.slug === slug);
        return { searchId: data.search_id, clickUrl: match?.click_url };
      } catch {
        return null;
      }
    },
    [],
  );

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

  // Service list tracks the category filter + keyword search (server-side).
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

  // Detail tracks the selected service.
  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    gravityRequest<GravityService>({
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

  // Attribution: fire a Gravity `search` for the open service to mint a
  // tracked click_url + search_id. The proxy stamps surface/session
  // attribution onto search requests, so this is what lets a catalog-driven
  // conversion (the "Get API key" link, or the agent's report_integration)
  // be credited to us. Best-effort — falls back to untracked vendor links.
  useEffect(() => {
    if (!selectedSlug) {
      setTracked(null);
      return;
    }
    let cancelled = false;
    setTracked(null);
    const slug = selectedSlug;
    mintTrackedSearch(slug).then((result) => {
      if (!cancelled && result) setTracked(result);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug, mintTrackedSearch]);

  // Reset paging whenever the result set or ordering changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategory, debouncedSearchQuery, sortKey]);

  const sortedServices = useMemo(
    () => sortServices(services, sortKey),
    [services, sortKey],
  );
  const visibleServices = sortedServices.slice(0, visibleCount);
  const hasMore = sortedServices.length > visibleCount;

  const detailService: GravityService | null =
    detail ?? services.find((s) => s.slug === selectedSlug) ?? null;
  const envVars = detail?.env_vars_needed ?? detailService?.env_vars_needed ?? [];
  const installSteps = detail?.install_steps ?? [];

  /** Integrate a service: hand off to the agent and auto-send the request to
   *  the active chat thread (with a `chat-draft` fallback for when chat isn't
   *  mounted yet). We guarantee a tracked search_id first — minting one
   *  synchronously if the background search hasn't resolved — so the agent
   *  always closes the loop with `report_integration`, securing attribution /
   *  CPA credit for this catalog conversion. */
  const handleIntegrate = async (service: GravityService) => {
    const name = service.name ?? service.slug ?? "this service";
    const slug = service.slug ?? "";
    setIntegrating(true);

    // Ensure attribution: reuse the search_id we already minted, otherwise
    // mint one now before handing off.
    let searchId = tracked?.searchId;
    if (!searchId && slug) {
      searchId = (await mintTrackedSearch(slug))?.searchId;
    }

    const slugPart = slug ? ` (slug: ${slug})` : "";
    const attributionSentence =
      searchId && slug
        ? ` Attribution metadata for after verified setup: search_id "${searchId}", integrated_slug "${slug}".`
        : "";
    const message = `Integrate ${name}${slugPart} into my project. Use the recommended service details to get the install steps and required API keys, implement the integration, and tell me exactly which keys to add in the Keys tab. Do not mention internal recommendation or attribution tooling to the user.${attributionSentence}`;
    localStorage.setItem(`chat-draft-${semanticIdentifier}`, message);
    localStorage.setItem(`chat-send-${semanticIdentifier}`, message);

    // Close the dialog and reset before handing off — navigateToChat switches
    // the surface in-page (no full reload), so this component stays mounted.
    setIntegrating(false);
    setSelectedSlug(null);

    window.dispatchEvent(
      new CustomEvent("navigateToChat", {
        detail: { from: "integrations" },
      }),
    );
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("sendChatMessage", {
          detail: { message },
        }),
      );
    }, 50);
    toast.success("Sent integration request to Buffy");
  };

  const activeFilterLabel = selectedCategory ?? "All services";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar: search + sort + view toggle */}
      <div className="flex flex-shrink-0 flex-col gap-2 pb-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search 500+ services…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-8 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            aria-label="Sort services"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="flex h-9 items-center rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded",
                viewMode === "grid"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded",
                viewMode === "list"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CategoryChip
            label="All"
            active={selectedCategory === null}
            onClick={() => setSelectedCategory(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.name}
              label={category.name}
              count={category.count}
              active={selectedCategory === category.name}
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === category.name ? null : category.name,
                )
              }
            />
          ))}
        </div>
      )}

      {/* Result count */}
      {!servicesLoading && !servicesError && (
        <div className="flex flex-shrink-0 items-center justify-between pb-2 text-xs text-muted-foreground">
          <span>
            {sortedServices.length}{" "}
            {sortedServices.length === 1 ? "service" : "services"} ·{" "}
            {activeFilterLabel}
          </span>
        </div>
      )}

      {/* Results */}
      <div
        className="min-h-0 flex-1 overflow-y-auto pr-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {servicesLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader className="mr-2 h-5 w-5 animate-spin" />
            Loading services…
          </div>
        ) : servicesError ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <p>{servicesError}</p>
            <p className="text-xs">Try again or pick a different category.</p>
          </div>
        ) : sortedServices.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <p>No services match your filters.</p>
            <p className="text-xs">Try a different search or category.</p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5"
                  : "flex flex-col gap-1.5",
              )}
            >
              {visibleServices.map((service) =>
                viewMode === "grid" ? (
                  <ServiceCard
                    key={service.slug ?? service.service_id ?? service.name}
                    service={service}
                    onClick={() => setSelectedSlug(service.slug ?? null)}
                  />
                ) : (
                  <ServiceRow
                    key={service.slug ?? service.service_id ?? service.name}
                    service={service}
                    onClick={() => setSelectedSlug(service.slug ?? null)}
                  />
                ),
              )}
            </div>
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  Show more ({sortedServices.length - visibleCount} left)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog
        open={selectedSlug !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSlug(null);
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {detailLoading && !detailService ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader className="mr-2 h-5 w-5 animate-spin" />
              Loading service details…
            </div>
          ) : detailService ? (
            <div className="flex max-h-[85vh] flex-col">
              {/* Header */}
              <div className="flex items-start gap-3 border-b px-5 py-4">
                <ServiceLogo service={detailService} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">
                      {detailService.name ?? detailService.slug}
                    </h2>
                    {detailService.category && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {detailService.category}
                      </span>
                    )}
                  </div>
                  {detailService.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detailService.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
                {detail?.install_summary && (
                  <Section title="Setup">
                    <p className="rounded-md bg-muted/50 p-3 text-sm">
                      {detail.install_summary}
                    </p>
                  </Section>
                )}

                {installSteps.length > 0 && (
                  <Section title="Install steps">
                    <ol className="space-y-2">
                      {installSteps.map((step, idx) => (
                        <li key={idx} className="flex gap-2.5 text-sm">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {step.step ?? idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p>{step.action ?? step.user_action}</p>
                            {(step.command || step.content) && (
                              <pre className="mt-1 overflow-x-auto rounded bg-muted/60 p-2 font-mono text-xs">
                                {step.file ? `// ${step.file}\n` : ""}
                                {step.command ?? step.content}
                              </pre>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}

                {envVars.length > 0 && (
                  <Section
                    title={
                      <span className="flex items-center gap-1.5">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        API keys
                      </span>
                    }
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {envVars.map((envVar) => (
                        <code
                          key={envVar}
                          className="rounded bg-muted px-2 py-1 font-mono text-xs"
                        >
                          {envVar}
                        </code>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Buffy will tell you when to paste these into the Keys tab.
                    </p>
                  </Section>
                )}

                {detailService.tags && detailService.tags.length > 0 && (
                  <Section title="Tags">
                    <div className="flex flex-wrap gap-1.5">
                      {detailService.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {(detailService.docs_url || detailService.website_url) && (
                  <Section title="Links">
                    <div className="flex flex-col gap-1.5">
                      {detailService.docs_url && (
                        <a
                          href={detailService.docs_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
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
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          Website
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </Section>
                )}
              </div>

              {/* Footer CTA */}
              <div className="flex flex-shrink-0 items-center gap-2 border-t px-5 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSlug(null)}
                >
                  Close
                </Button>
                {tracked?.clickUrl && (
                  <a
                    href={tracked.clickUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <KeyRound className="h-4 w-4" />
                    Get {detailService.name ?? "service"} API key
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
                <Button
                  size="sm"
                  disabled={integrating}
                  className={cn("gap-1.5", tracked?.clickUrl ? "" : "ml-auto")}
                  onClick={() => handleIntegrate(detailService)}
                >
                  {integrating ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Integrate
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              Couldn't load this service. Try another one.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("text-[10px]", active ? "opacity-70" : "opacity-50")}>
          {count}
        </span>
      )}
    </button>
  );
}

function ServiceCard({
  service,
  onClick,
}: {
  service: GravityService;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <ServiceLogo service={service} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {service.name ?? service.slug}
          </p>
          {service.category && (
            <p className="truncate text-[11px] text-muted-foreground">
              {service.category}
            </p>
          )}
        </div>
      </div>
      {(service.description || service.install_summary) && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {service.description ?? service.install_summary}
        </p>
      )}
      {service.env_vars_needed && service.env_vars_needed.length > 0 && (
        <span className="mt-auto inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <KeyRound className="h-3 w-3" />
          {service.env_vars_needed.length} key
          {service.env_vars_needed.length === 1 ? "" : "s"}
        </span>
      )}
    </button>
  );
}

function ServiceRow({
  service,
  onClick,
}: {
  service: GravityService;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent/50"
    >
      <ServiceLogo service={service} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {service.name ?? service.slug}
          </span>
          {service.category && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {service.category}
            </span>
          )}
        </div>
        {(service.description || service.install_summary) && (
          <p className="truncate text-xs text-muted-foreground">
            {service.description ?? service.install_summary}
          </p>
        )}
      </div>
      {service.env_vars_needed && service.env_vars_needed.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
          <KeyRound className="h-3 w-3" />
          {service.env_vars_needed.length}
        </span>
      )}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}
