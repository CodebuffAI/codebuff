"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";

// The picker works entirely in the user's LOCAL timezone, then composes a
// standard 5-field cron expression in UTC (Convex crons run in UTC). Editing an
// existing automation parses the stored UTC spec back into local controls.
//
// Caveat: the conversion uses the current UTC offset, so a schedule is a fixed
// UTC time and will not shift across daylight-saving changes.

type Frequency = "hourly" | "daily" | "weekly" | "custom";
type FreqButton = "hourly" | "daily" | "weekdays" | "weekly" | "custom";

const FREQ_BUTTONS: { id: FreqButton; label: string }[] = [
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom" },
];

// JS getDay()/cron day-of-week both use 0=Sun … 6=Sat.
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = [1, 2, 3, 4, 5];

const TZ_LABEL = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
})();

const pad2 = (n: number) => n.toString().padStart(2, "0");
const shiftDay = (d: number, by: number) => (((d + by) % 7) + 7) % 7;

function sameDays(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** Local time-of-day → UTC hour/minute plus the day shift (−1/0/+1). */
function localToUtc(hour: number, minute: number) {
  const r = new Date();
  const d = new Date(r.getFullYear(), r.getMonth(), r.getDate(), hour, minute, 0, 0);
  let dayShift = d.getUTCDay() - d.getDay();
  if (dayShift === 6) dayShift = -1;
  if (dayShift === -6) dayShift = 1;
  return { utcHour: d.getUTCHours(), utcMinute: d.getUTCMinutes(), dayShift };
}

/** UTC time-of-day → local hour/minute plus the (reverse) day shift. */
function utcToLocal(utcHour: number, utcMinute: number) {
  const r = new Date();
  const d = new Date(
    Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate(), utcHour, utcMinute, 0, 0),
  );
  let dayShift = d.getDay() - d.getUTCDay();
  if (dayShift === 6) dayShift = -1;
  if (dayShift === -6) dayShift = 1;
  return { hour: d.getHours(), minute: d.getMinutes(), dayShift };
}

type State = {
  frequency: Frequency;
  hour: number; // local
  minute: number; // local
  days: number[]; // local weekdays (0..6), used when frequency === "weekly"
  custom: string;
};

const DEFAULT_STATE: State = {
  frequency: "daily",
  hour: 9,
  minute: 0,
  days: [...WEEKDAYS],
  custom: "",
};

function composeCron(state: State): string {
  if (state.frequency === "custom") return state.custom.trim();
  if (state.frequency === "hourly") {
    const { utcMinute } = localToUtc(0, state.minute);
    return `${utcMinute} * * * *`;
  }
  const { utcHour, utcMinute, dayShift } = localToUtc(state.hour, state.minute);
  if (state.frequency === "daily") {
    return `${utcMinute} ${utcHour} * * *`;
  }
  // weekly
  const utcDays = [...new Set(state.days.map((d) => shiftDay(d, dayShift)))].sort(
    (a, b) => a - b,
  );
  return `${utcMinute} ${utcHour} * * ${utcDays.length ? utcDays.join(",") : "*"}`;
}

function parseDowList(dow: string): number[] | null {
  const out: number[] = [];
  for (const part of dow.split(",")) {
    if (/^\d+$/.test(part)) {
      out.push(Number(part) === 7 ? 0 : Number(part));
      continue;
    }
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i === 7 ? 0 : i);
      continue;
    }
    return null; // names / steps → fall back to custom
  }
  return out;
}

function parseCron(spec: string): State {
  const f = spec.trim().split(/\s+/);
  if (f.length !== 5) {
    return { ...DEFAULT_STATE, frequency: "custom", custom: spec.trim() };
  }
  const [min, hr, dom, mon, dow] = f;
  const isNum = (s: string) => /^\d+$/.test(s);

  if (isNum(min) && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    const { minute } = utcToLocal(0, Number(min));
    return { ...DEFAULT_STATE, frequency: "hourly", minute };
  }

  if (isNum(min) && isNum(hr) && dom === "*" && mon === "*") {
    const { hour, minute, dayShift } = utcToLocal(Number(hr), Number(min));
    if (dow === "*") {
      return { ...DEFAULT_STATE, frequency: "daily", hour, minute };
    }
    const utcDays = parseDowList(dow);
    if (utcDays) {
      const days = [...new Set(utcDays.map((d) => shiftDay(d, dayShift)))].sort(
        (a, b) => a - b,
      );
      return { ...DEFAULT_STATE, frequency: "weekly", hour, minute, days };
    }
  }

  return { ...DEFAULT_STATE, frequency: "custom", custom: spec.trim() };
}

/** Human description of a stored (UTC) cronspec, rendered in local time. */
export function describeCron(spec: string): string {
  const s = parseCron(spec);
  const time = `${pad2(s.hour)}:${pad2(s.minute)}`;
  if (s.frequency === "custom") return `Custom · ${spec.trim()} (UTC)`;
  if (s.frequency === "hourly") return `Every hour at :${pad2(s.minute)}`;
  if (s.frequency === "daily") return `Daily at ${time}`;
  if (sameDays(s.days, WEEKDAYS)) return `Weekdays at ${time}`;
  const names = [...s.days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]);
  return `${names.join(", ") || "—"} at ${time}`;
}

function HourMinuteSelect({
  value,
  count,
  onChange,
}: {
  value: number;
  count: 24 | 60;
  onChange: (n: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {Array.from({ length: count }, (_, n) => (
        <option key={n} value={n}>
          {pad2(n)}
        </option>
      ))}
    </select>
  );
}

export function CronScheduleInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [state, setState] = useState<State>(() =>
    value?.trim() ? parseCron(value) : DEFAULT_STATE,
  );
  const lastEmitted = useRef<string | null>(null);

  // Re-seed from `value` only when it changes externally (e.g. opening the
  // dialog on a different automation) — not from our own emitted cronspec.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setState(value?.trim() ? parseCron(value) : DEFAULT_STATE);
    }
  }, [value]);

  // Emit the composed (UTC) cronspec whenever the controls change.
  useEffect(() => {
    const spec = composeCron(state);
    if (spec && spec !== lastEmitted.current) {
      lastEmitted.current = spec;
      onChange(spec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  const activeButton: FreqButton =
    state.frequency === "hourly"
      ? "hourly"
      : state.frequency === "daily"
        ? "daily"
        : state.frequency === "custom"
          ? "custom"
          : sameDays(state.days, WEEKDAYS)
            ? "weekdays"
            : "weekly";

  const selectFrequency = (id: FreqButton) => {
    if (id === "hourly") update({ frequency: "hourly" });
    else if (id === "daily") update({ frequency: "daily" });
    else if (id === "weekdays") update({ frequency: "weekly", days: [...WEEKDAYS] });
    else if (id === "weekly") {
      const days = sameDays(state.days, WEEKDAYS) ? [new Date().getDay()] : state.days;
      update({ frequency: "weekly", days });
    } else {
      // Seed the raw field with the current schedule so it's easy to tweak.
      const seed =
        state.custom.trim() ||
        composeCron({ ...state, frequency: state.frequency === "custom" ? "daily" : state.frequency });
      update({ frequency: "custom", custom: seed });
    }
  };

  const toggleDay = (d: number) => {
    setState((s) => {
      const on = s.days.includes(d);
      const days = on ? s.days.filter((x) => x !== d) : [...s.days, d];
      return { ...s, days: days.length ? days : s.days }; // keep at least one day
    });
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground">Schedule</Label>

      <div className="flex flex-wrap gap-1.5">
        {FREQ_BUTTONS.map((b) => {
          const active = activeButton === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => selectFrequency(b.id)}
              aria-pressed={active}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-muted/40 text-foreground/80 hover:bg-muted hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      {state.frequency === "custom" ? (
        <Input
          value={state.custom}
          onChange={(e) => update({ custom: e.target.value })}
          placeholder="0 9 * * 1-5   (minute hour day month weekday — UTC)"
          spellCheck={false}
          className="font-mono text-xs"
        />
      ) : (
        <div className="space-y-2.5">
          {state.frequency === "hourly" ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">At</span>
              <HourMinuteSelect
                value={state.minute}
                count={60}
                onChange={(minute) => update({ minute })}
              />
              <span className="text-muted-foreground">minutes past the hour</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">At</span>
              <HourMinuteSelect
                value={state.hour}
                count={24}
                onChange={(hour) => update({ hour })}
              />
              <span className="text-muted-foreground">:</span>
              <HourMinuteSelect
                value={state.minute}
                count={60}
                onChange={(minute) => update({ minute })}
              />
            </div>
          )}

          {state.frequency === "weekly" && (
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-sm text-muted-foreground">On</span>
              {DAY_LABELS.map((lbl, d) => {
                const on = state.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    title={DAY_SHORT[d]}
                    className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground shadow"
                        : "bg-muted/40 text-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {describeCron(composeCron(state))}
        {state.frequency !== "custom" && (
          <span className="text-muted-foreground/70"> · {TZ_LABEL} (fixed UTC, no DST shift)</span>
        )}
      </p>
    </div>
  );
}
