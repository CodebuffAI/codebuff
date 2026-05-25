import React from "react";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader,
  Clock,
  Zap,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MessageStateStatus =
  | "complete"
  | "error"
  | "type_errors"
  | "checking_errors"
  | "processing_tools"
  | "streaming"
  | "thinking"
  | "insufficient_credits";

type MessageStateColor =
  | "green"
  | "red"
  | "orange"
  | "yellow"
  | "blue"
  | "gray";

interface MessageStateProps {
  status: MessageStateStatus;
  message?: string;
  color?: MessageStateColor;
  timestamp?: number;
  className?: string;
  subtle?: boolean; // For end-of-message display
}

// Memoized status configuration to prevent recalculation on every render
const STATUS_CONFIGS = {
  complete: {
    icon: CheckCircle,
    label: "Complete",
    defaultColor: "green" as const,
    bgColor: "bg-green-50",
    textColor: "text-green-700",
    borderColor: "border-green-200",
  },
  error: {
    icon: XCircle,
    label: "Error",
    defaultColor: "red" as const,
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    borderColor: "border-red-200",
  },
  type_errors: {
    icon: AlertCircle,
    label: "Type Errors",
    defaultColor: "orange" as const,
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    borderColor: "border-orange-200",
  },
  checking_errors: {
    icon: AlertCircle,
    label: "Checking Errors",
    defaultColor: "yellow" as const,
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-700",
    borderColor: "border-yellow-200",
  },
  processing_tools: {
    icon: Zap,
    label: "Processing Tools",
    defaultColor: "yellow" as const,
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-700",
    borderColor: "border-yellow-200",
  },
  streaming: {
    icon: Loader,
    label: "Streaming",
    defaultColor: "blue" as const,
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
  },
  thinking: {
    icon: Clock,
    label: "Thinking",
    defaultColor: "gray" as const,
    bgColor: "bg-gray-50",
    textColor: "text-gray-700",
    borderColor: "border-gray-200",
  },
  insufficient_credits: {
    icon: Coins,
    label: "Out of Credits",
    defaultColor: "yellow" as const,
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
  },
} as const;

const getStatusConfig = (status: MessageStateStatus) => {
  return (
    STATUS_CONFIGS[status] || {
      icon: AlertCircle,
      label: "Unknown",
      defaultColor: "gray" as const,
      bgColor: "bg-gray-50",
      textColor: "text-gray-700",
      borderColor: "border-gray-200",
    }
  );
};

export const MessageState: React.FC<MessageStateProps> = React.memo(
  ({
    status,
    message,
    color: _color,
    timestamp,
    className,
    subtle = false,
  }) => {
    const config = getStatusConfig(status);
    const Icon = config.icon;
    const isAnimated =
      status === "streaming" ||
      status === "checking_errors" ||
      status === "processing_tools";

    return (
      <div
        className={cn(
          subtle
            ? "mt-4 inline-flex items-center gap-1 text-xs text-gray-500"
            : "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium",
          !subtle && config.bgColor,
          !subtle && config.textColor,
          !subtle && config.borderColor,
          className,
        )}
      >
        <Icon
          className={cn(
            subtle ? "h-3 w-3" : "h-3 w-3",
            isAnimated && "animate-spin",
          )}
        />
        <span>{config.label}</span>
        {message && (
          <span className={cn("text-xs", subtle ? "opacity-70" : "opacity-80")}>
            - {message}
          </span>
        )}
        {timestamp && (
          <span className={cn("text-xs", subtle ? "opacity-50" : "opacity-60")}>
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    );
  },
);

MessageState.displayName = "MessageState";
