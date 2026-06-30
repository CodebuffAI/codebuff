"use client";

import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";

// Common schedules. Values are standard 5-field cronspecs, interpreted as UTC.
const PRESETS: { label: string; value: string }[] = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 09:00", value: "0 9 * * *" },
  { label: "Every day at 18:00", value: "0 18 * * *" },
  { label: "Every weekday at 09:00", value: "0 9 * * 1-5" },
  { label: "Every Monday at 09:00", value: "0 9 * * 1" },
  { label: "First of the month at 09:00", value: "0 9 1 * *" },
];

const CUSTOM = "__custom__";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Best-effort human description of a 5-field cronspec. Falls back to the raw
 *  spec for anything it doesn't recognize. Times are UTC. */
export function describeCron(spec: string): string {
  const preset = PRESETS.find((p) => p.value === spec.trim());
  if (preset) return `${preset.label} (UTC)`;

  const fields = spec.trim().split(/\s+/);
  if (fields.length !== 5) return "Custom schedule";
  const [minute, hour, dom, month, dow] = fields;

  const pad = (n: string) => (n.length === 1 ? `0${n}` : n);
  const isNum = (s: string) => /^\d+$/.test(s);

  if (isNum(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Every hour at :${pad(minute)} (UTC)`;
  }
  if (isNum(minute) && isNum(hour) && month === "*") {
    const time = `${pad(hour)}:${pad(minute)}`;
    if (dom === "*" && dow === "*") return `Every day at ${time} (UTC)`;
    if (dom === "*" && dow === "1-5") return `Every weekday at ${time} (UTC)`;
    if (dom === "*" && isNum(dow) && Number(dow) <= 6) {
      return `Every ${DAY_NAMES[Number(dow)]} at ${time} (UTC)`;
    }
    if (isNum(dom) && dow === "*") return `Monthly on day ${dom} at ${time} (UTC)`;
  }
  return "Custom schedule (UTC)";
}

export function CronScheduleInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const isPreset = PRESETS.some((p) => p.value === value.trim());
  const selectValue = isPreset ? value.trim() : CUSTOM;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Schedule (UTC)</Label>
      <select
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM) {
            // Seed the custom field with the current value if it was a preset.
            onChange(isPreset ? value : value || "0 9 * * *");
          } else {
            onChange(next);
          }
        }}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value={CUSTOM}>Custom cron expression…</option>
      </select>

      {selectValue === CUSTOM && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0 9 * * 1   (minute hour day month weekday)"
          spellCheck={false}
          className="font-mono text-xs"
        />
      )}

      <p className="text-xs text-muted-foreground">{describeCron(value)}</p>
    </div>
  );
}
