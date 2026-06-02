/**
 * Plan Card Wrapper Component
 * Provides consistent card structure with header, body, and footer
 */

interface PlanCardProps {
  /** Header content (typically PlanHeaderCard) */
  header: React.ReactNode;
  /** Main body content */
  children: React.ReactNode;
  /** Footer content (typically PaymentMethodDisplay) */
  footer: React.ReactNode;
}

export function PlanCard({ header, children, footer }: PlanCardProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-white bg-white outline outline-1 outline-white transition-all duration-200 lg:col-span-2">
      <div className="flex-1 p-6">
        {header}
        <div className="space-y-6">{children}</div>
      </div>
      {footer}
    </div>
  );
}
