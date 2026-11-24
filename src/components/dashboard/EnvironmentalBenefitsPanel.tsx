import { IndianRupee, Leaf, Mountain, TreePine } from "lucide-react";
import { Chip, Panel, PanelHeading, Skeleton } from "@/components/ui/primitives";
import type { EnvironmentalBenefits } from "@/types/solar";
import { formatDate } from "@/utils/format";

const CO2_FORMATTER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const COUNT_FORMATTER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

/** Grams-scale mass rendered as kg, rolling over to tonnes above 1,000 kg. */
function formatMass(kg: number): { value: string; unit: string } {
  if (!Number.isFinite(kg) || kg <= 0) return { value: "0", unit: "kg" };
  if (kg >= 1000) return { value: CO2_FORMATTER.format(kg / 1000), unit: "t" };
  return { value: CO2_FORMATTER.format(kg), unit: "kg" };
}

/**
 * Environmental & economic value of the plant's archived generation.
 *
 * Every number comes from `/api/archive/benefits`, which derives it from the
 * canonical archive lifetime total. The panel states the conversion factors and
 * the tariff assumption so the figures read as documented estimates rather than
 * metered measurements.
 */
export function EnvironmentalBenefitsPanel({
  benefits,
  loading,
  delay = 0.62,
}: {
  benefits: EnvironmentalBenefits | null | undefined;
  loading?: boolean;
  delay?: number;
}) {
  const co2 = formatMass(benefits?.co2_avoided_kg ?? 0);
  const coal = formatMass(benefits?.coal_saved_kg ?? 0);
  const period =
    benefits?.first_day && benefits.last_day
      ? `${formatDate(benefits.first_day)} – ${formatDate(benefits.last_day)}`
      : null;

  return (
    <Panel delay={delay}>
      <PanelHeading
        title="Environmental & economic benefits"
        subtitle="Estimated lifetime impact of the energy your plant has produced"
        action={<Chip tone="positive">Estimated</Chip>}
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : benefits ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Benefit
              icon={Leaf}
              label="CO₂ avoided"
              value={co2.value}
              unit={co2.unit}
              note="grid emissions displaced"
            />
            <Benefit
              icon={Mountain}
              label="Coal saved"
              value={coal.value}
              unit={coal.unit}
              note="fossil fuel not burned"
            />
            <Benefit
              icon={TreePine}
              label="Trees equivalent"
              value={COUNT_FORMATTER.format(benefits.trees_equivalent)}
              unit="trees"
              note="annual CO₂ absorption"
            />
            <Benefit
              icon={IndianRupee}
              label="Bill savings"
              value={`₹${CURRENCY_FORMATTER.format(benefits.savings_inr)}`}
              note={`at ₹${benefits.tariff_inr_per_kwh}/kWh avoided tariff`}
            />
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
            Based on {CO2_FORMATTER.format(benefits.generation_kwh)} kWh of archived generation
            {period ? ` (${period})` : ""}. Factors: {benefits.factors.co2_kg_per_kwh} kg CO₂/kWh
            (CEA India grid baseline), {benefits.factors.coal_kg_per_kwh} kg coal/kWh, and{" "}
            {benefits.factors.tree_kg_co2_per_year} kg CO₂ absorbed per mature tree per year.
            Estimates for context, not metered measurements.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Benefits appear once the EnergyScope Archive has at least one recorded day.
        </p>
      )}
    </Panel>
  );
}

function Benefit({
  icon: Icon,
  label,
  value,
  unit,
  note,
}: {
  icon: typeof Leaf;
  label: string;
  value: string;
  unit?: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/25 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0 text-positive" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="num mt-2 flex items-baseline gap-1.5 text-2xl font-semibold">
        {value}
        {unit ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
