import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/vly/components/ui/accordion";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import { Loader2, LucideIcon, Bot } from "lucide-react";
import { cn } from "@/vly/lib/utils";

export interface TopItem {
  id: string;
  label: string;
  value: number;
  secondaryValue?: number;
  secondaryLabel?: string;
}

interface TopItemsAccordionProps {
  title: string;
  items: TopItem[];
  icon?: LucideIcon;
  variant?: "default" | "success" | "warning" | "error";
  formatValue?: (value: number) => string;
  formatSecondaryValue?: (value: number) => string;
  onItemClick?: (item: TopItem) => void;
  onDebugClick?: (item: TopItem) => void;
  onDebugAllClick?: () => void;
  loadingItemId?: string | null;
  emptyMessage?: string;
  showProgress?: boolean;
  maxValue?: number;
  defaultOpen?: boolean;
  className?: string;
}

const variantBadgeStyles = {
  default: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  success:
    "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  warning:
    "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  error: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

const variantProgressBgStyles = {
  default: "bg-blue-500/20",
  success: "bg-green-500/20",
  warning: "bg-yellow-500/20",
  error: "bg-red-500/20",
};

export function TopItemsAccordion({
  title,
  items,
  icon: Icon,
  variant = "default",
  formatValue = (val) => val.toString(),
  formatSecondaryValue = (val) => val.toString(),
  onItemClick,
  onDebugClick,
  onDebugAllClick,
  loadingItemId = null,
  emptyMessage = "No items to display",
  showProgress = true,
  maxValue,
  defaultOpen = false,
  className,
}: TopItemsAccordionProps) {
  const [accordionValue, setAccordionValue] = useState<string>(
    defaultOpen ? "item-1" : "",
  );

  // Calculate max value for progress bars if not provided
  const calculatedMaxValue =
    maxValue || (items.length > 0 ? Math.max(...items.map((i) => i.value)) : 1);

  return (
    <Accordion
      type="single"
      collapsible
      value={accordionValue}
      onValueChange={setAccordionValue}
      className={className}
    >
      <AccordionItem value="item-1" className="rounded-lg border px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex w-full items-center justify-between gap-2 pr-2">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4" />}
              <span className="font-semibold">{title}</span>
              <Badge
                variant="outline"
                className={cn(variantBadgeStyles[variant])}
              >
                {items.length}
              </Badge>
            </div>
            {onDebugAllClick && items.length > 0 && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onDebugAllClick();
                }}
                className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                title="Copy debug info for all items to clipboard"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onDebugAllClick();
                  }
                }}
              >
                <Bot className="h-3 w-3" />
                <span className="text-xs">Debug All</span>
              </div>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {items.map((item) => {
                const isLoading = loadingItemId === item.id;
                const percentage = (item.value / calculatedMaxValue) * 100;

                return (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onItemClick?.(item)}
                        disabled={isLoading || !onItemClick}
                        className="h-auto flex-1 justify-start truncate px-2 py-1 font-mono text-xs"
                      >
                        {isLoading && (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        )}
                        <span className="truncate">{item.label}</span>
                      </Button>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(variantBadgeStyles[variant])}
                        >
                          {formatValue(item.value)}
                        </Badge>
                        {item.secondaryValue !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            {item.secondaryLabel && `${item.secondaryLabel}: `}
                            {formatSecondaryValue(item.secondaryValue)}
                          </span>
                        )}
                        {onDebugClick && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDebugClick(item);
                            }}
                            className="h-7 gap-1 px-2"
                            title="Copy debug info to clipboard"
                          >
                            <Bot className="h-3 w-3" />
                            <span className="text-xs">Debug</span>
                          </Button>
                        )}
                      </div>
                    </div>
                    {showProgress && (
                      <div
                        className={cn(
                          "h-1.5 w-full overflow-hidden rounded-full",
                          variantProgressBgStyles[variant],
                        )}
                      >
                        <div
                          className={cn(
                            "h-full transition-all",
                            variant === "default" && "bg-blue-500",
                            variant === "success" && "bg-green-500",
                            variant === "warning" && "bg-yellow-500",
                            variant === "error" && "bg-red-500",
                          )}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
