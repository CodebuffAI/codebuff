"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SettingsNavItem {
  id: string;
  label: string;
}

/**
 * Cursor-style settings scaffold: a quiet left sidebar for navigation and a
 * roomy content column on the right. Deliberately flat — no cards, no nested
 * panels, no decorative icons — so it reads like a native settings surface
 * rather than an AI-generated dashboard.
 *
 * On mobile the sidebar collapses into a single horizontal switcher above the
 * content.
 */
export function SettingsScaffold({
  items,
  active,
  onSelect,
  leading,
  children,
}: {
  items: SettingsNavItem[];
  active: string;
  onSelect: (id: string) => void;
  /** Optional element rendered above the sidebar list (e.g. a back link). */
  leading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-8 md:flex-row md:gap-14 md:px-8 md:py-12">
      {/* Mobile switcher */}
      <div className="md:hidden">
        {leading}
        <nav className="-mx-5 mt-3 flex gap-1 overflow-x-auto px-5 pb-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex-shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                active === item.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-10">
          {leading}
          <nav className={cn("flex flex-col gap-0.5", leading && "mt-4")}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
                  active === item.id
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A titled group of settings. Renders a plain heading + optional description
 * with generous spacing — no bordered container.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-11 last:mb-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * A single labelled setting row: label (and optional description) on the left,
 * a control on the right. Rows are separated by hairlines rather than boxed in
 * cards.
 */
export function SettingsRow({
  label,
  description,
  control,
  children,
  stacked = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  /** Force the control below the label even on wide screens. */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-border/60 py-4 first:border-t-0 first:pt-0",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-8",
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {description && (
          <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {(control || children) && (
        <div className={cn("min-w-0", !stacked && "sm:shrink-0")}>
          {control ?? children}
        </div>
      )}
    </div>
  );
}

/** Right-aligned read-only value used in account-style rows. */
export function SettingsValue({ children }: { children: ReactNode }) {
  return (
    <span className="text-[13px] text-muted-foreground sm:text-right">
      {children}
    </span>
  );
}
