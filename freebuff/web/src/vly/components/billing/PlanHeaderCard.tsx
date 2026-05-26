/**
 * Plan Header Card Component
 * Displays plan title, subtitle, and badge in a consistent format
 */

interface PlanHeaderCardProps {
  /** Main title */
  title: string;
  /** Subtitle/description text */
  subtitle: string;
  /** Plan badge text */
  badge: string;
}

export function PlanHeaderCard({
  title,
  subtitle,
  badge,
}: PlanHeaderCardProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="font-['PP_Cirka'] text-xl font-normal">{title}</h2>
        <p className="text-xs text-zinc-600">{subtitle}</p>
      </div>
      <div className="rounded-[10px] border border-purple-400/60 bg-purple-100/60 px-3 py-1 text-base font-medium text-purple-800 outline outline-1 outline-purple-400/40 backdrop-blur-[80px]">
        {badge}
      </div>
    </div>
  );
}
