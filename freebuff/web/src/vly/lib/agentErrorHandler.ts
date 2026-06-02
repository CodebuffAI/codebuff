import { toast } from "sonner";
import { formatRetryTime } from "./rateLimitHelpers";

interface AgentError {
  kind: string;
  retryAfter?: number;
  message?: string;
}

export function handleAgentSendError(error: AgentError): void {
  switch (error.kind) {
    case "RateLimited":
      toast.error(
        `Rate limit exceeded. Please wait ${formatRetryTime(error.retryAfter || 0)} before sending another message.`,
        { duration: 5000 },
      );
      break;
    case "CONTENT_MODERATION":
      toast.error(error.message || "This content is not allowed.", {
        duration: 6000,
      });
      break;
    default:
      toast.error(
        error.message || "Failed to send message. Please try again.",
        { duration: 5000 },
      );
      break;
  }
}
