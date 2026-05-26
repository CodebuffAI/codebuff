"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { cn } from "@/vly/lib/utils";
import { Badge } from "@/vly/components/ui/badge";
import {
  BarChart3,
  Mail,
  Shield,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

interface AdminShellProps {
  children: ReactNode;
}

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchExact?: boolean;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/web/admin",
    label: "Overview",
    icon: Shield,
    matchExact: true,
  },
  {
    href: "/web/admin/referrals",
    label: "Referrals",
    icon: TrendingUp,
  },
  {
    href: "/web/admin/email-blasts",
    label: "Email Blasts",
    icon: Mail,
  },
  {
    href: "/web/admin/resource-usage",
    label: "Usage estimates",
    icon: BarChart3,
  },
] as const;

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const user = useSignedInUser();
  const isAdmin = user?.role === "god" || user?.role === "admin";

  if (user === undefined) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to access admin pages.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Access Restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Admin access is required for this section.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Admin
            </p>
            <h1 className="text-lg font-semibold">Control Center</h1>
          </div>
          <Badge variant="outline" className="text-xs">
            {user.role === "god" ? "God Admin" : "Admin"}
          </Badge>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-6 pb-4">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = item.matchExact
              ? pathname === item.href
              : pathname?.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-black bg-black text-white"
                    : "border-border bg-white text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
