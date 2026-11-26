import { CalendarRange, Trophy, Zap } from "lucide-react";
import { Chip, Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import type { PlantRecords } from "@/types/solar";
import { formatDate, formatEnergy, formatPower } from "@/utils/format";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-08" -> "Aug 2026" (UTC, so the month never shifts with the browser TZ). */
function formatMonth(month: string): string {
  return MONTH_FORMATTER.format(new Date(`${month}-01T00:00:00Z`));
}

/** Archive `timeMinutes` (minutes after IST midnight) -> "10:07 AM". */
function formatSampleTime(timeMinutes: number | null): string | null {
  if (timeMinutes === null || !Number.isFinite(timeMinutes)) return null;
  const total = Math.round(timeMinutes);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

/**
 * Plant records & milestones from `/api/archive/records`.
 *
 * Every figure is computed server-side from the canonical archive, so the panel
 * cannot disagree with the dashboard totals or the History page. Only the 1 MWh
 * date is an estimate (the plant produced before archive coverage began); it is
 * marked with ≈ and an "Estimated" badge, and the footnote states the gap it was
 * derived from. A partial archive never has the offset applied, so the panel
 * cannot present an invented milestone date as a record.
 */
export function PlantRecordsPanel({
  records,
  loading,
  delay = 0.64,
}: {
  records: PlantRecords | null | undefined;
  loading?: boolean;
  delay?: number;
}) {
  const highestDay = records?.highest_day ?? null;
  const highestMonth = records?.highest_month ?? null;
  const highestPower = records?.highest_power ?? null;
  const bestMonth = records?.best_month ?? null;
  const bestYear = records?.best_year ?? null;
  const peakTime = formatSampleTime(highestPower?.time_minutes ?? null);

  const dayEnergy = highestDay ? formatEnergy(highestDay.kwh) : null;
  const monthEnergy = highestMonth ? formatEnergy(highestMonth.kwh) : null;
  const peakPower = highestPower ? formatPower(highestPower.watts) : null;

  return (
    <Panel delay={delay}>
      <PanelHeading
        title="Plant records & milestones"
        subtitle="Automatically tracked from the EnergyScope Archive"
        action={<Chip tone="solar">Archive</Chip>}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : records ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <RecordTile
              icon={Trophy}
              label="Highest day"
              value={dayEnergy?.value ?? "—"}
              unit={dayEnergy?.unit}
              note={highestDay ? formatDate(highestDay.date) : "No recorded day yet"}
            />
            <RecordTile
              icon={CalendarRange}
              label="Highest month"
              value={monthEnergy?.value ?? "—"}
              unit={monthEnergy?.unit}
              note={
                highestMonth
                  ? `${formatMonth(highestMonth.month)} · ${highestMonth.days_reported}/${highestMonth.days_expected} days${
                      highestMonth.complete ? "" : " · partial"
                    }`
                  : "No recorded month yet"
              }
            />
            <RecordTile
              icon={Zap}
              label="Peak power"
              value={peakPower?.value ?? "—"}
              unit={peakPower?.unit}
              note={
                highestPower
                  ? `${formatDate(highestPower.date)}${peakTime ? ` · ${peakTime}` : ""}`
                  : "No stored power curve yet"
              }
            />
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Milestones
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {records.milestones.items.map((milestone) => (
                <MilestoneCard
                  key={milestone.threshold_kwh}
                  milestone={milestone}
                  lifetimeKwh={records.lifetime.generation_kwh}
                />
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              Best month by daily average:{" "}
              <strong className="font-semibold text-foreground">
                {bestMonth
                  ? `${formatMonth(bestMonth.month)} · ${NUMBER_FORMATTER.format(bestMonth.average_kwh)} kWh/day`
                  : "not enough days yet"}
              </strong>
            </span>
            <span>
              Best year:{" "}
              <strong className="font-semibold text-foreground">
                {bestYear
                  ? `${bestYear.year} · ${formatEnergy(bestYear.kwh).value} ${formatEnergy(bestYear.kwh).unit}${
                      bestYear.complete ? "" : " (partial)"
                    }`
                  : "no archived year yet"}
              </strong>
            </span>
            <span>
              Record-breaking days:{" "}
              <strong className="font-semibold text-foreground">{records.record_days.count}</strong>
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Records appear once the EnergyScope Archive has at least one recorded day.
        </p>
      )}
    </Panel>
  );
}

function RecordTile({
  icon: Icon,
  label,
  value,
  unit,
  note,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  unit?: string | undefined;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/25 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0 text-solar" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="num mt-2 flex items-baseline gap-1.5 text-2xl font-semibold">
        {value}
        {unit ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

function MilestoneCard({
  milestone,
  lifetimeKwh,
}: {
  milestone: PlantRecords["milestones"]["items"][number];
  lifetimeKwh: number;
}) {
  const width = Math.max(0, Math.min(100, milestone.progress_pct));
  const lifetime = formatEnergy(lifetimeKwh);
  const estimated = milestone.estimated;
  const note = milestone.achieved_on
    ? estimated
      ? ""
      : "Milestone reached"
    : milestone.achieved_before_coverage
      ? "Reached before archive coverage began"
      : `${lifetime.value} ${lifetime.unit} lifetime of ${milestone.label}`;

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/25 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {milestone.label}
        </span>
        <span className="num text-[11px] font-semibold text-foreground">
          {milestone.achieved_on ? (
            <>
              {estimated ? <span aria-hidden="true">≈ </span> : null}
              {formatDate(milestone.achieved_on)}
            </>
          ) : (
            `${width.toFixed(1)}%`
          )}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/60"
        role="progressbar"
        aria-label={`Progress towards ${milestone.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
      >
        <div
          className="h-full rounded-full bg-positive transition-[width]"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {note}
        {estimated && milestone.achieved_on ? (
          <span className="ml-1 rounded bg-solar/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-solar">
            Estimated
          </span>
        ) : null}
      </p>
    </div>
  );
}
