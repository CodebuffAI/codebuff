"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";

// The picker works in a chosen IANA timezone, then composes a standard 5-field
// cron expression in UTC (Convex crons run in UTC). Editing parses the stored
// UTC spec back into the chosen timezone.
//
// Caveat: conversion uses the timezone's *current* UTC offset, so a schedule is
// a fixed UTC time and won't shift across daylight-saving changes.

type Frequency = "hourly" | "weekly" | "custom";
type FreqButton = "hourly" | "weekdays" | "weekly" | "custom";

const FREQ_BUTTONS: { id: FreqButton; label: string }[] = [
  { id: "hourly", label: "Hourly" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom" },
];

// JS getDay()/cron day-of-week both use 0=Sun … 6=Sat.
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Curated common timezones for the picker (the viewer's own tz is prepended if
// it isn't already in the list).
const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Central Europe" },
  { value: "Europe/Athens", label: "Eastern Europe" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Shanghai", label: "China" },
  { value: "Asia/Tokyo", label: "Japan" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

const pad2 = (n: number) => n.toString().padStart(2, "0");
const shiftDay = (d: number, by: number) => (((d + by) % 7) + 7) % 7;

function sameDays(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Offset (minutes) of `timeZone` relative to UTC right now (negative = behind). */
function tzOffsetMinutes(timeZone: string): number {
  const now = new Date();
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const p = Object.fromEntries(
      dtf.formatToParts(now).map((x) => [x.type, x.value]),
    );
    const asUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour === "24" ? "0" : p.hour),
      Number(p.minute),
      Number(p.second),
    );
    return Math.round((asUtc - now.getTime()) / 60000);
  } catch {
    return 0; // unknown tz → treat as UTC
  }
}

/** Short tz label for display, e.g. "PST" / "GMT+5:30". Falls back to the name. */
function tzShortLabel(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value || timeZone;
  } catch {
    return timeZone;
  }
}

function normalize(total: number): { value: number; dayShift: number } {
  let dayShift = 0;
  if (total < 0) {
    total += 1440;
    dayShift = -1;
  } else if (total >= 1440) {
    total -= 1440;
    dayShift = 1;
  }
  return { value: total, dayShift };
}

/** Wall time in `timeZone` → UTC hour/minute + day shift. */
function localToUtc(hour: number, minute: number, timeZone: string) {
  const offset = tzOffsetMinutes(timeZone);
  const { value, dayShift } = normalize(hour * 60 + minute - offset);
  return { utcHour: Math.floor(value / 60), utcMinute: value % 60, dayShift };
}

/** UTC hour/minute → wall time in `timeZone` + day shift. */
function utcToLocal(utcHour: number, utcMinute: number, timeZone: string) {
  const offset = tzOffsetMinutes(timeZone);
  const { value, dayShift } = normalize(utcHour * 60 + utcMinute + offset);
  return { hour: Math.floor(value / 60), minute: value % 60, dayShift };
}

type State = {
  frequency: Frequency;
  hour: number;
  minute: number;
  days: number[];
  custom: string;
  timezone: string;
};

function defaultState(timezone: string): State {
  return {
    frequency: "weekly",
    hour: 9,
    minute: 0,
    days: [...WEEKDAYS],
    custom: "",
    timezone,
  };
}

function composeCron(state: State): string {
  if (state.frequency === "custom") return state.custom.trim();
  if (state.frequency === "hourly") {
    const { utcMinute } = localToUtc(0, state.minute, state.timezone);
    return `${utcMinute} * * * *`;
  }
  // weekly
  const { utcHour, utcMinute, dayShift } = localToUtc(
    state.hour,
    state.minute,
    state.timezone,
  );
  if (sameDays(state.days, ALL_DAYS)) {
    return `${utcMinute} ${utcHour} * * *`;
  }
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
    return null;
  }
  return out;
}

function parseCronToState(spec: string, timezone: string): State {
  const base = defaultState(timezone);
  const f = spec.trim().split(/\s+/);
  if (f.length !== 5) return { ...base, frequency: "custom", custom: spec.trim() };
  const [min, hr, dom, mon, dow] = f;
  const isNum = (s: string) => /^\d+$/.test(s);

  if (isNum(min) && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    const { minute } = utcToLocal(0, Number(min), timezone);
    return { ...base, frequency: "hourly", minute };
  }

  if (isNum(min) && isNum(hr) && dom === "*" && mon === "*") {
    const { hour, minute, dayShift } = utcToLocal(Number(hr), Number(min), timezone);
    if (dow === "*") {
      return { ...base, frequency: "weekly", hour, minute, days: [...ALL_DAYS] };
    }
    const utcDays = parseDowList(dow);
    if (utcDays) {
      const days = [...new Set(utcDays.map((d) => shiftDay(d, dayShift)))].sort(
        (a, b) => a - b,
      );
      return { ...base, frequency: "weekly", hour, minute, days };
    }
  }

  return { ...base, frequency: "custom", custom: spec.trim() };
}

/** Human description of a stored (UTC) cronspec, rendered in `timezone`. */
export function describeCron(spec: string, timezone?: string): string {
  const tz = timezone || "UTC";
  const s = parseCronToState(spec, tz);
  const time = `${pad2(s.hour)}:${pad2(s.minute)}`;
  const abbr = tzShortLabel(tz);
  if (s.frequency === "custom") return `Custom · ${spec.trim()} (UTC)`;
  if (s.frequency === "hourly") return `Every hour at :${pad2(s.minute)} (${abbr})`;
  if (sameDays(s.days, ALL_DAYS)) return `Every day at ${time} (${abbr})`;
  if (sameDays(s.days, WEEKDAYS)) return `Weekdays at ${time} (${abbr})`;
  const names = [...s.days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]);
  return `${names.join(", ") || "—"} at ${time} (${abbr})`;
}

function NumberSelect({
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
  cronSpec,
  timezone,
  onChange,
}: {
  cronSpec: string;
  timezone: string;
  onChange: (next: { cronSpec: string; timezone: string }) => void;
}) {
  const [state, setState] = useState<State>(() =>
    cronSpec?.trim()
      ? parseCronToState(cronSpec, timezone || browserTimeZone())
      : defaultState(timezone || browserTimeZone()),
  );
  const lastEmitted = useRef<{ cronSpec: string; timezone: string } | null>(null);

  // Re-seed only when the props change externally (not from our own emit).
  useEffect(() => {
    if (
      cronSpec !== lastEmitted.current?.cronSpec ||
      timezone !== lastEmitted.current?.timezone
    ) {
      setState(
        cronSpec?.trim()
          ? parseCronToState(cronSpec, timezone || browserTimeZone())
          : defaultState(timezone || browserTimeZone()),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cronSpec, timezone]);

  // Emit the composed (UTC) cronspec + timezone whenever the controls change.
  useEffect(() => {
    const spec = composeCron(state);
    const tz = state.timezone;
    if (
      spec &&
      (spec !== lastEmitted.current?.cronSpec ||
        tz !== lastEmitted.current?.timezone)
    ) {
      lastEmitted.current = { cronSpec: spec, timezone: tz };
      onChange({ cronSpec: spec, timezone: tz });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  const activeButton: FreqButton =
    state.frequency === "hourly"
      ? "hourly"
      : state.frequency === "custom"
        ? "custom"
        : sameDays(state.days, WEEKDAYS)
          ? "weekdays"
          : "weekly";

  const selectFrequency = (id: FreqButton) => {
    if (id === "hourly") update({ frequency: "hourly" });
    else if (id === "weekdays") update({ frequency: "weekly", days: [...WEEKDAYS] });
    else if (id === "weekly") {
      const days = sameDays(state.days, WEEKDAYS) ? [new Date().getDay()] : state.days;
      update({ frequency: "weekly", days });
    } else {
      const seed =
        state.custom.trim() ||
        composeCron({ ...state, frequency: state.frequency === "custom" ? "weekly" : state.frequency });
      update({ frequency: "custom", custom: seed });
    }
  };

  const toggleDay = (d: number) => {
    setState((s) => {
      const on = s.days.includes(d);
      const days = on ? s.days.filter((x) => x !== d) : [...s.days, d];
      return { ...s, days: days.length ? days : s.days };
    });
  };

  const tzOptions = COMMON_TIMEZONES.some((t) => t.value === state.timezone)
    ? COMMON_TIMEZONES
    : [{ value: state.timezone, label: state.timezone }, ...COMMON_TIMEZONES];

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
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">At</span>
              <NumberSelect
                value={state.minute}
                count={60}
                onChange={(minute) => update({ minute })}
              />
              <span className="text-muted-foreground">minutes past the hour</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">At</span>
              <NumberSelect
                value={state.hour}
                count={24}
                onChange={(hour) => update({ hour })}
              />
              <span className="text-muted-foreground">:</span>
              <NumberSelect
                value={state.minute}
                count={60}
                onChange={(minute) => update({ minute })}
              />
              <span className="text-muted-foreground">in</span>
              <select
                value={state.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
                className="h-9 max-w-[200px] rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {tzOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
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
        {describeCron(composeCron(state), state.timezone)}
        {state.frequency !== "custom" && (
          <span className="text-muted-foreground/70"> · fixed UTC (no DST shift)</span>
        )}
      </p>
    </div>
  );
}
