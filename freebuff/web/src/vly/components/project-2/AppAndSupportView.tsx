"use client";
import { FunctionReturnType } from "convex/server";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/vly/components/ui/button";
import { Card } from "@/vly/components/ui/card";
import {
  Plus,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
} from "lucide-react";
import { useState, useMemo } from "react";
import CreateTicketDialog from "@/vly/components/CreateTicketDialog";
import { motion } from "framer-motion";
import { useSignedInUser } from "@/vly/hooks/use-user";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/vly/components/ui/tooltip";
import { Switch } from "@/vly/components/ui/switch";
import { Label } from "@/vly/components/ui/label";
import { Id } from "@/convex/_generated/dataModel";
import TicketDetailDialog from "@/vly/components/TicketDetailDialog";
import { FeatureGate, UpgradePrompt } from "@/vly/components/billing/FeatureGate";

// Component for the New Ticket Button with conditional tooltip
function NewTicketButton({
  projectHasActiveTicket,
  onCreateTicket,
}: {
  projectHasActiveTicket: boolean;
  onCreateTicket: () => void;
}) {
  const button = (
    <Button
      onClick={() => !projectHasActiveTicket && onCreateTicket()}
      className={
        projectHasActiveTicket
          ? "cursor-not-allowed bg-[#f2e8fe] text-[#919193] hover:bg-[#f2e8fe] hover:text-[#919193]"
          : ""
      }
    >
      <Plus className="mr-2 h-4 w-4" />
      New Ticket
    </Button>
  );

  if (projectHasActiveTicket) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>
              This project already has an active ticket. Please wait for it to
              be resolved or closed before creating a new one.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

export default function AppAndSupportView({
  project,
}: {
  project: FunctionReturnType<typeof api.project.getProjectData>;
}) {
  const user = useSignedInUser();

  const tickets = useQuery(api.tickets.listMine);
  const hasActiveTicket = useQuery(
    api.tickets.getByProject,
    project?._id ? { projectId: project._id } : "skip",
  );
  const [selectedTicketId, setSelectedTicketId] =
    useState<Id<"tickets"> | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const showAllPastTickets = useQuery(api.settings.get, {
    key: "show_all_past_tickets",
  });
  const updateSetting = useMutation(api.settings.update);

  // Get unread counts for all tickets
  const ticketIds = useMemo(() => {
    return tickets?.map((t) => t._id) || [];
  }, [tickets]);

  const unreadCounts = useQuery(
    api.ticket_read_state.getUnreadCountByTicket,
    ticketIds.length > 0 ? { ticketIds } : "skip",
  );

  // Filter tickets based on the setting
  const filteredTickets = useMemo(() => {
    if (!tickets) return [];

    let filtered = tickets;
    if (showAllPastTickets === false) {
      filtered = tickets.filter(
        (t) => t.status === "open" || t.status === "in_progress",
      );
    }

    // Sort by status priority first, then by unread messages
    const statusPriority = {
      ["open"]: 0,
      ["in_progress"]: 1,
      ["resolved"]: 2,
      ["closed"]: 3,
    };

    return filtered.sort((a, b) => {
      const aStatusPriority =
        statusPriority[a.status as unknown as keyof typeof statusPriority] ??
        999;
      const bStatusPriority =
        statusPriority[b.status as unknown as keyof typeof statusPriority] ??
        999;

      // If statuses are different, sort by status priority
      if (aStatusPriority !== bStatusPriority) {
        return aStatusPriority - bStatusPriority;
      }

      // If statuses are the same, sort by unread count (descending)
      const aUnread = unreadCounts?.[a._id] || 0;
      const bUnread = unreadCounts?.[b._id] || 0;
      return bUnread - aUnread;
    });
  }, [tickets, showAllPastTickets, unreadCounts]);

  // Check if current project has an active ticket
  const projectHasActiveTicket = hasActiveTicket ?? true;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <Clock className="h-4 w-4" />;
      case "in_progress":
        return <MessageSquare className="h-4 w-4" />;
      case "resolved":
        return <CheckCircle className="h-4 w-4" />;
      case "closed":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "text-blue-600";
      case "in_progress":
        return "text-yellow-600";
      case "resolved":
        return "text-green-600";
      case "closed":
        return "text-gray-600";
      default:
        return "";
    }
  };

  return (
    <FeatureGate
      featureId="in_app_support"
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="w-full max-w-2xl">
            <UpgradePrompt featureId="in_app_support" />
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-background">
        {/* Beta Notice */}
        <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-orange-100 p-2">
              <Zap className="h-3 w-3 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-orange-900">
                Limited Support
              </p>
              <p className="mt-0.5 text-xs text-orange-700">
                This is a test feature and will soon only be available for
                premium users. For most requests and support, please use our{" "}
                <a
                  href="https://discord.gg/2gSmB9DxJW"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-orange-800 underline hover:text-orange-900"
                >
                  Discord community
                </a>
                .
              </p>
            </div>
          </div>
        </div>
        {/* Main Content */}
        <main className="mx-auto max-w-6xl px-8 py-12">
          <div className="mb-8 flex items-center justify-between">
            <p className="text-muted-foreground">
              {tickets === undefined
                ? "Loading..."
                : `${filteredTickets.length} ticket${filteredTickets.length !== 1 ? "s" : ""}`}
            </p>
            <div className="flex items-center gap-4">
              {user?.role === "god" && (
                <div className="flex items-center gap-3">
                  <Label htmlFor="show-past-user" className="text-sm">
                    Show all past tickets
                  </Label>
                  <Switch
                    id="show-past-user"
                    checked={showAllPastTickets ?? false}
                    onCheckedChange={(checked) =>
                      updateSetting({
                        key: "show_all_past_tickets",
                        value: checked,
                      })
                    }
                  />
                </div>
              )}
              <NewTicketButton
                projectHasActiveTicket={projectHasActiveTicket}
                onCreateTicket={() => setShowCreateDialog(true)}
              />
            </div>
          </div>

          {tickets === undefined ? (
            <div className="flex justify-center py-12">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-muted-foreground"
              >
                Loading tickets...
              </motion.div>
            </div>
          ) : filteredTickets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-16 text-center"
            >
              <p className="mb-6 text-muted-foreground">
                {showAllPastTickets === false
                  ? "No active tickets"
                  : "No tickets yet"}
              </p>
              <Button
                onClick={() => setShowCreateDialog(true)}
                disabled={projectHasActiveTicket}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Ticket
              </Button>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket, index) => {
                const unreadCount = unreadCounts?.[ticket._id] || 0;
                return (
                  <motion.div
                    key={ticket._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card
                      className="cursor-pointer p-6 transition-colors hover:border-foreground/20"
                      onClick={() => setSelectedTicketId(ticket._id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <h3 className="font-semibold">{ticket.title}</h3>
                            {unreadCount > 0 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                                {unreadCount}
                              </div>
                            )}
                          </div>
                          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                            {ticket.description}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{ticket.projectName}</span>
                            <span>•</span>
                            <span>
                              {new Date(
                                ticket._creationTime,
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`flex items-center gap-2 text-sm font-medium ${getStatusColor(ticket.status)}`}
                        >
                          {getStatusIcon(ticket.status)}
                          <span className="capitalize">
                            {ticket.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </main>

        <CreateTicketDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          projectSemanticIdentifier={project?.semantic_identifier}
        />
        <TicketDetailDialog
          ticketId={selectedTicketId}
          open={selectedTicketId !== null}
          onOpenChange={(open) => !open && setSelectedTicketId(null)}
        />
      </div>
    </FeatureGate>
  );
}
