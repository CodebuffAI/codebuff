"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/vly/components/ui/badge";
import { Shield, Ticket, Puzzle, LucideIcon } from "lucide-react";
import { cn } from "@/vly/lib/utils";

interface NavButtonProps {
  label: string;
  subtitle: string;
  icon: LucideIcon;
  isActive: boolean;
  showBadge?: boolean;
  badgeCount?: number;
  colorScheme: "purple" | "blue" | "green";
  onClick: () => void;
}

const colorSchemes = {
  purple: {
    activeBorder: "border-purple-500",
    activeBg: "bg-purple-50",
    hoverBorder: "hover:border-purple-300",
    iconBg: "bg-purple-600",
    iconHoverBg: "group-hover:bg-purple-100",
    iconHoverText: "group-hover:text-purple-600",
    activeText: "text-purple-900",
  },
  blue: {
    activeBorder: "border-blue-500",
    activeBg: "bg-blue-50",
    hoverBorder: "hover:border-blue-300",
    iconBg: "bg-blue-600",
    iconHoverBg: "group-hover:bg-blue-100",
    iconHoverText: "group-hover:text-blue-600",
    activeText: "text-blue-900",
  },
  green: {
    activeBorder: "border-green-500",
    activeBg: "bg-green-50",
    hoverBorder: "hover:border-green-300",
    iconBg: "bg-green-600",
    iconHoverBg: "group-hover:bg-green-100",
    iconHoverText: "group-hover:text-green-600",
    activeText: "text-green-900",
  },
};

function NavButton({
  label,
  subtitle,
  icon: Icon,
  isActive,
  showBadge,
  badgeCount,
  colorScheme,
  onClick,
}: NavButtonProps) {
  const colors = colorSchemes[colorScheme];

  return (
    <button onClick={onClick} className="max-w-xs flex-1">
      <div
        className={cn(
          "group relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 bg-white px-6 py-4 shadow-sm transition-all duration-200 hover:shadow-md",
          isActive
            ? `${colors.activeBorder} ${colors.activeBg} shadow-md`
            : `border-gray-200 ${colors.hoverBorder}`,
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              isActive ? colors.iconBg : `bg-gray-100 ${colors.iconHoverBg}`,
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5",
                isActive
                  ? "text-white"
                  : `text-gray-600 ${colors.iconHoverText}`,
              )}
            />
          </div>
          <div className="text-left">
            <p
              className={cn(
                "text-sm font-semibold",
                isActive ? colors.activeText : "text-gray-700",
              )}
            >
              {label}
            </p>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        {badgeCount !== undefined && badgeCount > 0 && (
          <Badge
            variant="destructive"
            className="h-7 min-w-[28px] text-sm font-bold"
          >
            {badgeCount}
          </Badge>
        )}
        {showBadge && !badgeCount && (
          <span className="h-3 w-3 rounded-full bg-red-500" />
        )}
      </div>
    </button>
  );
}

interface AdminNavbarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  hideAdminManager?: boolean;
}

export function AdminNavbar({
  activeTab,
  onTabChange,
  hideAdminManager,
}: AdminNavbarProps) {
  // Get pending/open tickets count
  const openTickets = useQuery(api.tickets.listAll, { status: "open" });
  const inProgressTickets = useQuery(api.tickets.listAll, {
    status: "in_progress",
  });

  const { results: pendingIntegrations } = usePaginatedQuery(
    api.integrations.listAllUserGeneratedIntegrations,
    { approval_status: "pending" },
    { initialNumItems: 1 },
  );

  const activeTicketsCount =
    (openTickets?.length || 0) + (inProgressTickets?.length || 0);
  const hasPendingIntegrations =
    pendingIntegrations && pendingIntegrations.length > 0;

  return (
    <nav className="border-b bg-gradient-to-r from-slate-50 to-gray-50 shadow-sm">
      <div className="mx-auto max-w-7xl px-8 py-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-1 items-center justify-center gap-4">
            {!hideAdminManager && (
              <NavButton
                label="Admin Manager"
                subtitle="Dashboard & Stats"
                icon={Shield}
                isActive={!activeTab || activeTab === "admin"}
                colorScheme="purple"
                onClick={() => onTabChange?.("admin")}
              />
            )}

            <NavButton
              label="Tickets"
              subtitle="Support Requests"
              icon={Ticket}
              isActive={activeTab === "tickets"}
              badgeCount={activeTicketsCount}
              colorScheme="blue"
              onClick={() => onTabChange?.("tickets")}
            />

            <NavButton
              label="Integrations"
              subtitle="User Submissions"
              icon={Puzzle}
              isActive={activeTab === "integrations"}
              showBadge={hasPendingIntegrations}
              colorScheme="green"
              onClick={() => onTabChange?.("integrations")}
            />
          </div>

          <div className="w-12"></div>
        </div>
      </div>
    </nav>
  );
}
