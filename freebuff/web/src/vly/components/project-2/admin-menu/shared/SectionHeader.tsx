import { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  iconColor?: string;
  iconBgColor?: string;
  borderColor?: string;
}

export function SectionHeader({
  icon: Icon,
  title,
  iconColor = "text-blue-600",
  iconBgColor = "bg-blue-50",
  borderColor = "border-blue-200",
}: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-md border ${borderColor} ${iconBgColor}`}
      >
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
    </div>
  );
}
