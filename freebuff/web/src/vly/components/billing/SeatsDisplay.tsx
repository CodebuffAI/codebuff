/**
 * Seats Display Component
 * Shows team seat usage for organization billing
 */

import { Users } from "lucide-react";
import { Progress } from "@/vly/components/ui/progress";

interface SeatsDisplayProps {
  /** Number of included seats in the plan */
  includedSeats: number;
  /** Number of currently used seats */
  usedSeats: number;
}

export function SeatsDisplay({ includedSeats, usedSeats }: SeatsDisplayProps) {
  const availableSeats = includedSeats - usedSeats;
  const usagePercentage = (usedSeats / includedSeats) * 100;
  const isAtLimit = usedSeats >= includedSeats;

  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          <span className="font-medium">Team Seats</span>
        </div>
        <span className="bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text font-bold text-transparent">
          {usedSeats} / {includedSeats}
        </span>
      </div>
      <Progress value={usagePercentage} className="h-2" />
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
        <span>Available seats: {availableSeats}</span>
        {isAtLimit && (
          <span className="text-orange-600">Seats limit reached</span>
        )}
      </div>
    </div>
  );
}
