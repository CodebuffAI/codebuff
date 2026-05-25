/**
 * Generic reusable accordion component
 * Provides consistent shell/structure for all billing accordions
 */

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface InfoAccordionProps {
  /** Unique accordion value identifier */
  value: string;
  /** Display title */
  title: string;
  /** Description shown in accordion content */
  description: string;
  /** Icon component to show next to title */
  icon: React.ReactNode;
  /** Summary text or component to show on the right side of header */
  summary?: React.ReactNode;
  /** Content to display when accordion is expanded */
  children: React.ReactNode;
}

export function InfoAccordion({
  value,
  title,
  description,
  icon,
  summary,
  children,
}: InfoAccordionProps) {
  return (
    <AccordionItem
      value={value}
      className="overflow-hidden rounded-2xl border border-zinc-200/40 bg-white/80 shadow-sm backdrop-blur-sm"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex w-full items-center justify-between pr-2">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-semibold text-zinc-800">{title}</span>
          </div>
          {summary && <div className="flex items-center gap-2">{summary}</div>}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <p className="pb-3 pt-2 text-xs text-zinc-600">{description}</p>
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
