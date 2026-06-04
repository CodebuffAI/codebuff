import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/vly/components/ui/accordion";

interface MonitoringSectionAccordionProps {
  value: string;
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}

export default function MonitoringSectionAccordion({
  value,
  icon,
  title,
  defaultOpen = true,
  children,
  badge,
}: MonitoringSectionAccordionProps) {
  return (
    <Accordion
      type="multiple"
      defaultValue={defaultOpen ? [value] : []}
      className="w-full"
    >
      <AccordionItem
        value={value}
        className="rounded-lg border border-border bg-card"
      >
        <AccordionTrigger className="px-5 py-4 hover:no-underline">
          <div className="flex w-full items-center justify-between pr-2">
            <div className="flex items-center gap-2.5">
              {icon}
              <span className="text-sm font-semibold text-foreground">
                {title}
              </span>
            </div>
            {badge && (
              <div className="rounded-md border border-primary/45 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {badge}
              </div>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-5 pb-5">
          <div className="space-y-5 pt-4">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
