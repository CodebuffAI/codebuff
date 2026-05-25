import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Send, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
// import { useAuth } from "@/hooks/use-auth";
import { useSignedInUser } from "@/hooks/use-user";
import { Id } from "@/convex/_generated/dataModel";
import FileUpload from "@/components/FileUpload";
import AttachmentDisplay from "@/components/AttachmentDisplay";
import AdminToolkit from "@/components/AdminToolkit";

interface TicketDetailDialogProps {
  ticketId: Id<"tickets"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TicketDetailDialog({
  ticketId,
  open,
  onOpenChange,
}: TicketDetailDialogProps) {
  const user = useSignedInUser();
  const ticket = useQuery(
    api.tickets.get,
    ticketId ? { id: ticketId } : "skip",
  );
  const messages = useQuery(
    api.tickets_messages.listByTicket,
    ticketId ? { ticketId } : "skip",
  );

  const sendMessage = useMutation(api.tickets_messages.send);
  const updateStatus = useMutation(api.tickets.updateStatus);
  const markTicketAsRead = useMutation(api.ticket_read_state.markTicketAsRead);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachmentIds, setAttachmentIds] = useState<Id<"_storage">[]>([]);

  // Mark ticket as read when dialog opens
  useEffect(() => {
    if (open && ticketId) {
      markTicketAsRead({ ticketId }).catch((error) => {
        console.error("Error marking ticket as read:", error);
      });
    }
  }, [open, ticketId, markTicketAsRead]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setNewMessage("");
      setAttachmentIds([]);
    }
  }, [open]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ticketId) return;

    setIsSending(true);
    try {
      await sendMessage({
        ticketId,
        content: newMessage,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
      });
      setNewMessage("");
      setAttachmentIds([]);
      toast.success("Message sent");
    } catch (error) {
      toast.error("Failed to send message");
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!ticketId) return;
    try {
      await updateStatus({
        id: ticketId,
        status: newStatus as "open" | "in_progress" | "resolved" | "closed",
      });
      toast.success("Status updated");
    } catch (error) {
      toast.error("Failed to update status");
      console.error(error);
    }
  };

  if (!ticketId) return null;

  const isAdmin = user?.role === "god";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[95vh] max-h-[95vh] w-[98vw] max-w-[98vw] flex-col p-0">
        {/* Header - Always render for accessibility */}
        <DialogHeader className="border-b p-6 pb-4">
          <div className="mb-3 flex items-center justify-between">
            <DialogTitle className="text-lg font-bold tracking-tight">
              {ticket === undefined || messages === undefined
                ? "Loading..."
                : ticket === null
                  ? "Ticket Not Found"
                  : ticket.title}
            </DialogTitle>
            {ticket && ticket !== null && (
              <>
                {isAdmin ? <AdminToolkit ticket={ticket} /> : null}
                {isAdmin ? (
                  <Select
                    value={ticket.status}
                    onValueChange={handleStatusChange}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="capitalize">
                    {ticket.status.replace("_", " ")}
                  </Badge>
                )}
              </>
            )}
          </div>
          {ticket && ticket !== null && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{ticket.projectName}</span>
              <span>•</span>
              <span>{ticket.userName}</span>
              <span>•</span>
              <span>{new Date(ticket._creationTime).toLocaleDateString()}</span>
            </div>
          )}
        </DialogHeader>

        {ticket === undefined || messages === undefined ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : ticket === null ? (
          <div className="flex items-center justify-center p-12">
            <p className="text-muted-foreground">Ticket not found</p>
          </div>
        ) : (
          <>
            {/* Chat Messages Area */}
            <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-6">
              {/* Initial Ticket Message */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {ticket.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {ticket.userName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ticket._creationTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <p className="whitespace-pre-wrap text-sm">
                      {ticket.description}
                    </p>
                    {ticket.attachments && ticket.attachments.length > 0 && (
                      <AttachmentDisplay attachments={ticket.attachments} />
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Chat Messages */}
              {messages.map((message: any, index: number) => {
                const isAdminMessage = message.role === "admin";
                return (
                  <motion.div
                    key={message._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex gap-3"
                  >
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        isAdminMessage
                          ? "bg-blue-600 text-white"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {message.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {message.userName}
                        </span>
                        {isAdminMessage && (
                          <Badge
                            variant="default"
                            className="px-1.5 py-0 text-xs"
                          >
                            Admin
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(message._creationTime).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                      <div
                        className={`rounded-lg border p-3 shadow-sm ${
                          isAdminMessage
                            ? "bg-blue-50 dark:bg-blue-950/20"
                            : "bg-card"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </p>
                        {message.attachments &&
                          message.attachments.length > 0 && (
                            <AttachmentDisplay
                              attachments={message.attachments}
                            />
                          )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Message Input Area */}
            {ticket.status !== "closed" && (
              <div className="border-t p-6 pt-4">
                <form onSubmit={handleSendMessage} className="space-y-3">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    rows={3}
                    className="resize-none"
                  />

                  <div className="flex items-end justify-between gap-3">
                    <div className="flex-1">
                      <FileUpload
                        files={attachmentIds}
                        onFilesChange={setAttachmentIds}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isSending || !newMessage.trim()}
                      className="flex-shrink-0"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
