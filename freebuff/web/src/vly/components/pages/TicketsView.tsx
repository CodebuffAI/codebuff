"use client";

import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/vly/components/ui/card";
import { Switch } from "@/vly/components/ui/switch";
import { Label } from "@/vly/components/ui/label";
import { MessageSquare, Clock, CheckCircle, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Id } from "@/convex/_generated/dataModel";
import { MigrationDialog } from "@/vly/components/MigrationDialog";
import { cn } from "@/vly/lib/utils";

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

interface StatusFilterCardProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

function StatusFilterCard({
  label,
  icon,
  isActive,
  onClick,
}: StatusFilterCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer p-4 transition-all hover:shadow-md",
        isActive && "ring-2 ring-primary ring-offset-2",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        {icon}
      </div>
    </Card>
  );
}

interface TicketsViewProps {
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  setSelectedTicketId: (id: Id<"tickets"> | null) => void;
}

export function TicketsView({
  statusFilter,
  setStatusFilter,
  setSelectedTicketId,
}: TicketsViewProps) {
  const tickets = useQuery(
    api.tickets.listAll,
    statusFilter === "all"
      ? {}
      : {
          status: statusFilter as
            | "open"
            | "in_progress"
            | "resolved"
            | "closed",
        },
  );

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

  // Sort tickets by creation time descending
  const sortedTickets = useMemo(() => {
    if (!tickets) return [];
    return [...tickets].sort((a, b) => b._creationTime - a._creationTime);
  }, [tickets]);

  return (
    <>
      {/* Status Filter Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatusFilterCard
          label="All"
          icon={<MessageSquare className="h-6 w-6 text-muted-foreground" />}
          isActive={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <StatusFilterCard
          label="Open"
          icon={<Clock className="h-6 w-6 text-blue-600" />}
          isActive={statusFilter === "open"}
          onClick={() => setStatusFilter("open")}
        />
        <StatusFilterCard
          label="In Progress"
          icon={<MessageSquare className="h-6 w-6 text-yellow-600" />}
          isActive={statusFilter === "in_progress"}
          onClick={() => setStatusFilter("in_progress")}
        />
        <StatusFilterCard
          label="Resolved"
          icon={<CheckCircle className="h-6 w-6 text-green-600" />}
          isActive={statusFilter === "resolved"}
          onClick={() => setStatusFilter("resolved")}
        />
        <StatusFilterCard
          label="Closed"
          icon={<XCircle className="h-6 w-6 text-gray-600" />}
          isActive={statusFilter === "closed"}
          onClick={() => setStatusFilter("closed")}
        />
      </div>

      {/* Controls */}
      <div className="mb-8 flex items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <Label htmlFor="show-past" className="text-sm">
            Show all past tickets
          </Label>
          <Switch
            id="show-past"
            checked={showAllPastTickets ?? false}
            onCheckedChange={(checked) =>
              updateSetting({
                key: "show_all_past_tickets",
                value: checked,
              })
            }
          />
        </div>
        <MigrationDialog />
      </div>

      <p className="mb-6 text-muted-foreground">
        {tickets === undefined
          ? "Loading..."
          : `${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}`}
      </p>

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
      ) : tickets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-16 text-center"
        >
          <p className="text-muted-foreground">No tickets found</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {sortedTickets.map((ticket, index) => {
            const unreadCount = unreadCounts?.[ticket._id] || 0;
            return (
              <motion.div
                key={ticket._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.5) }}
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
                        <span>{ticket.userName}</span>
                        <span>•</span>
                        <span>{ticket.projectName}</span>
                        <span>•</span>
                        <span>
                          {new Date(ticket._creationTime).toLocaleDateString()}
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
    </>
  );
}
