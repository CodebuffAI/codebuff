"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/vly/components/ui/card";
import { Badge } from "@/vly/components/ui/badge";
import { Skeleton } from "@/vly/components/ui/skeleton";
import { CountUp } from "@/vly/components/CountUp";
import { Confetti } from "@/vly/components/Confetti";
import { useCountCelebration } from "@/vly/hooks/use-count-celebration";
import { useState, useEffect } from "react";
import { Id } from "@/convex/_generated/dataModel";
import {
  Users,
  FolderOpen,
  TrendingUp,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  Mail,
  UserPlus,
  Ticket,
} from "lucide-react";
import { AdminNavbar } from "@/vly/components/AdminNavbar";
import { AdminProjectOwnershipManager } from "@/vly/components/admin/AdminProjectOwnershipManager";
import { TicketsView } from "@/vly/components/pages/TicketsView";
import { AdminIntegrationsView } from "@/vly/components/pages/AdminIntegrationsView";
import TicketDetailDialog from "@/vly/components/TicketDetailDialog";
import { IntegrationApprovalDialog } from "@/vly/components/IntegrationApprovalDialog";
import TimeRangeSelector from "@/vly/components/project-2/monitoring/shared/TimeRangeSelector";
import { useTimeRange } from "@/vly/hooks/useTimeRange";

export default function AdminDashboard() {
  const user = useSignedInUser();
  const isAdmin = user?.role === "god" || user?.role === "admin";
  const [activeView, setActiveView] = useState<
    "admin" | "tickets" | "integrations"
  >("admin");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [integrationStatusFilter, setIntegrationStatusFilter] =
    useState<string>("pending");
  const [selectedTicketId, setSelectedTicketId] =
    useState<Id<"tickets"> | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<any | null>(
    null,
  );

  const timeRangeHook = useTimeRange("24h");

  const dashboardStats = useQuery(
    api.admin_stats.getDashboardStats,
    isAdmin && timeRangeHook.timeRangeValues
      ? {
          startTime: timeRangeHook.timeRangeValues.startTime,
          endTime: timeRangeHook.timeRangeValues.endTime,
        }
      : "skip",
  );
  const liveActivity = useQuery(
    api.admin_stats.getLiveActivityStream,
    isAdmin && timeRangeHook.timeRangeValues
      ? {
          startTime: timeRangeHook.timeRangeValues.startTime,
          endTime: timeRangeHook.timeRangeValues.endTime,
        }
      : "skip",
  );

  // Celebration effects for project count changes
  const { showConfetti, resetConfetti } = useCountCelebration({
    projectCount: dashboardStats?.totals.projects,
    enabled: true,
  });

  // Debug logging
  useEffect(() => {
    console.log("Admin Dashboard - showConfetti:", showConfetti);
    console.log(
      "Admin Dashboard - projectCount:",
      dashboardStats?.totals.projects,
    );
  }, [dashboardStats?.totals.users, dashboardStats?.totals.projects]);

  // Handle tab change from navbar
  const handleTabChange = (tab: string) => {
    if (tab === "tickets") {
      setActiveView("tickets");
    } else if (tab === "integrations") {
      setActiveView("integrations");
    } else {
      setActiveView("admin");
    }
  };

  // Wait for user to load so role changes trigger a re-render
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 text-center text-black">
            <Skeleton className="mx-auto mb-4 h-8 w-80" />
            <Skeleton className="mx-auto h-4 w-48" />
          </div>
        </div>
      </div>
    );
  }

  // Check if user has admin access
  if (user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center text-black">
          <h1 className="mb-4 text-4xl font-bold">Access Denied</h1>
          <p className="text-xl">Please sign in to continue</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center text-black">
          <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="mb-4 text-4xl font-bold">Access Restricted</h1>
          <p className="text-xl">Admin Access Required</p>
        </div>
      </div>
    );
  }

  if (!dashboardStats) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 text-center text-black">
            <Skeleton className="mx-auto mb-4 h-8 w-80" />
            <Skeleton className="mx-auto h-4 w-48" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card
                key={i}
                className="border border-gray-200 bg-white shadow-sm"
              >
                <CardContent className="p-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "user_signup":
        return <UserPlus className="h-4 w-4" />;
      case "ticket_created":
        return <Ticket className="h-4 w-4" />;
      case "email_blast_sent":
        return <Mail className="h-4 w-4" />;
      case "message":
        return <Zap className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "message":
        return "bg-gray-50 text-black border-gray-200";
      case "user_signup":
        return "bg-blue-50 text-black border-blue-200";
      case "ticket_created":
        return "bg-amber-50 text-black border-amber-200";
      case "email_blast_sent":
        return "bg-gray-50 text-black border-gray-200";
      default:
        return "bg-gray-50 text-black border-gray-200";
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case "user_signup":
        return "User Signup";
      case "ticket_created":
        return "Ticket Created";
      case "email_blast_sent":
        return "Email Blast Sent";
      default:
        return type.replaceAll("_", " ");
    }
  };

  const getActivityDescription = (activity: any) => {
    if (activity.type === "user_signup") {
      const name = activity.data?.name || "New user";
      const email = activity.data?.email || "unknown";
      return `${name} (${email})`;
    }

    if (activity.type === "ticket_created") {
      return `Project: ${activity.data?.projectId} • Status: ${activity.data?.status}`;
    }

    if (activity.type === "email_blast_sent") {
      return `${activity.data?.sentCount ?? 0}/${activity.data?.recipientCount ?? 0} delivered`;
    }

    if (activity.type === "message") {
      return `Project: ${activity.data?.project_id}`;
    }

    return "";
  };

  // Render different views based on activeView
  const renderContent = () => {
    if (activeView === "tickets") {
      return (
        <div className="mx-auto max-w-7xl px-8 py-12">
          <TicketsView
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            setSelectedTicketId={setSelectedTicketId}
          />
        </div>
      );
    }

    if (activeView === "integrations") {
      return (
        <div className="mx-auto max-w-7xl px-8 py-12">
          <AdminIntegrationsView
            integrationStatusFilter={integrationStatusFilter}
            setIntegrationStatusFilter={setIntegrationStatusFilter}
            setSelectedIntegration={setSelectedIntegration}
          />
        </div>
      );
    }

    // Default Admin Stats View
    return (
      <div className="mx-auto max-w-6xl p-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-black">
            ADMIN DASHBOARD
          </h1>
          <p className="text-sm text-gray-600">System Analytics</p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Active</span>
          </div>
          <div className="mt-4 flex items-center justify-center gap-4">
            <a
              href="/web/admin/referrals"
              className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
            >
              <TrendingUp className="h-4 w-4" />
              Manage Referrals
            </a>
          </div>
          <div className="mt-4 flex justify-center">
            <TimeRangeSelector
              timeRange={timeRangeHook.timeRange}
              setTimeRange={timeRangeHook.setTimeRange}
              customStartDate={timeRangeHook.customStartDate}
              setCustomStartDate={timeRangeHook.setCustomStartDate}
              customEndDate={timeRangeHook.customEndDate}
              setCustomEndDate={timeRangeHook.setCustomEndDate}
            />
          </div>
        </div>

        <div className="mb-8">
          <AdminProjectOwnershipManager />
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Users */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total Users
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.totals.users}
                      className="text-2xl font-bold text-black"
                    />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <Users className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Projects */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total Projects
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.totals.projects}
                      className="text-2xl font-bold text-black"
                    />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <FolderOpen className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Signups */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Today's Signups
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.today.users}
                      className="text-2xl font-bold text-black"
                    />
                    <TrendingUp className="ml-1 h-4 w-4 text-green-600" />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <Users className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Projects */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Today's Projects
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.today.projects}
                      className="text-2xl font-bold text-black"
                    />
                    <TrendingUp className="ml-1 h-4 w-4 text-green-600" />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <FolderOpen className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Activity Stream */}
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-black">
              <Activity className="h-5 w-5 text-gray-600" />
              Activity Stream
              <Badge className="ml-2 border-green-200 bg-green-100 text-green-700">
                LIVE
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {liveActivity?.map((activity, index) => (
                <div
                  key={`${activity.type}-${activity.timestamp}-${index}`}
                  className={`flex items-center gap-3 rounded border p-3 transition-shadow hover:shadow-sm ${getActivityColor(activity.type)}`}
                >
                  <div className="flex-shrink-0">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">
                        {getActivityLabel(activity.type)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTime(activity.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {getActivityDescription(activity)}
                    </div>
                  </div>
                </div>
              )) || (
                <div className="py-8 text-center text-gray-500">
                  <Activity className="mx-auto mb-4 h-8 w-8 opacity-50" />
                  <p className="text-sm">Waiting for activity...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        {/* Confetti overlay */}
        <Confetti active={showConfetti} onComplete={resetConfetti} />
      </div>
    );
  };

  return (
    <div key={user?.role ?? "unknown"} className="min-h-screen bg-white">
      <AdminNavbar
        activeTab={activeView === "admin" ? undefined : activeView}
        onTabChange={handleTabChange}
      />
      {renderContent()}
      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={selectedTicketId !== null}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
      />
      <IntegrationApprovalDialog
        integration={selectedIntegration}
        open={selectedIntegration !== null}
        onOpenChange={(open) => !open && setSelectedIntegration(null)}
        onUpdate={() => {
          setSelectedIntegration(null);
        }}
      />
    </div>
  );
}
