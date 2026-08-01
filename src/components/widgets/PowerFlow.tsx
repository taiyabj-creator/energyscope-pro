import { motion } from "framer-motion";
import { Cpu, Home, Sun, Zap, BatteryCharging } from "lucide-react";
import { useBattery, useLivePower } from "@/hooks/useSolarData";
import { formatPower } from "@/utils/format";
import { cn } from "@/lib/utils";

/** Line definitions in the SVG coordinate space (0 0 520 360). */
const PATHS = {
  solar: "M260 108 L260 152",
  grid: "M126 258 L126 208 Q126 190 148 190 L226 190",
  load: "M394 258 L394 208 Q394 190 372 190 L294 190",
  battery: "M260 232 L260 268",
};

function reverse(d: string) {
  // Dots travel along the same geometry in the opposite direction.
  return d;
}

function FlowLine({
  d,
  color,
  active,
  reversed,
  intensity,
}: {
  d: string;
  color: string;
  active: boolean;
  reversed?: boolean;
  intensity: number;
}) {
  const dots = active ? 3 : 0;
  const duration = Math.max(1.1, 2.6 - intensity * 1.5);
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="text-border"
      />
      {active && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.35}
        />
      )}
      {Array.from({ length: dots }).map((_, i) => (
        <circle key={i} r={4} fill={color}>
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            begin={`${(i * duration) / dots}s`}
            keyPoints={reversed ? "1;0" : "0;1"}
            keyTimes="0;1"
            calcMode="linear"
            path={reverse(d)}
          />
        </circle>
      ))}
    </g>
  );
}

function Node({
  x,
  y,
  label,
  value,
  unit,
  icon: Icon,
  colorClass,
  ringClass,
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  unit: string;
  icon: typeof Sun;
  colorClass: string;
  ringClass: string;
}) {
  return (
    <foreignObject x={x - 78} y={y - 52} width={156} height={104}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
        <div
          className={cn(
            "grid size-11 place-items-center rounded-2xl border bg-card/80 backdrop-blur",
            ringClass,
            colorClass,
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="num text-sm font-semibold">
          {value}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
        </p>
      </div>
    </foreignObject>
  );
}

export function PowerFlow() {
  const { data: live } = useLivePower();
  const { data: battery } = useBattery();

  const solar = live?.solarPower ?? 0;
  const load = live?.loadPower ?? 0;
  const grid = live?.gridPower ?? 0;
  const exporting = grid < 0;
  const hasBattery = Boolean(battery?.installed);

  const s = formatPower(solar);
  const l = formatPower(load);
  const g = formatPower(Math.abs(grid));

  return (
    <div className="relative">
      <svg
        viewBox="0 0 520 360"
        className="w-full"
        role="img"
        aria-label={`Live power flow: solar ${s.value} ${s.unit}, load ${l.value} ${l.unit}, grid ${exporting ? "export" : "import"} ${g.value} ${g.unit}`}
      >
        <FlowLine
          d={PATHS.solar}
          color="var(--solar)"
          active={solar > 20}
          intensity={Math.min(1, solar / 4305)}
        />
        <FlowLine
          d={PATHS.grid}
          color="var(--grid)"
          active={Math.abs(grid) > 20}
          reversed={!exporting}
          intensity={Math.min(1, Math.abs(grid) / 3000)}
        />
        <FlowLine
          d={PATHS.load}
          color="var(--load)"
          active={load > 20}
          reversed
          intensity={Math.min(1, load / 3000)}
        />
        {hasBattery && (
          <FlowLine
            d={PATHS.battery}
            color="var(--battery)"
            active={Boolean(battery?.power)}
            reversed={!battery?.charging}
            intensity={0.5}
          />
        )}

        <Node
          x={260}
          y={56}
          label="Solar"
          value={s.value}
          unit={s.unit}
          icon={Sun}
          colorClass="text-solar"
          ringClass="border-solar/30"
        />
        <Node
          x={260}
          y={190}
          label="Inverter"
          value={((solar / 4305) * 100).toFixed(0)}
          unit="% load"
          icon={Cpu}
          colorClass="text-primary"
          ringClass="border-primary/30"
        />
        <Node
          x={126}
          y={300}
          label={exporting ? "Grid export" : "Grid import"}
          value={g.value}
          unit={g.unit}
          icon={Zap}
          colorClass="text-grid"
          ringClass="border-grid/30"
        />
        <Node
          x={394}
          y={300}
          label="Home load"
          value={l.value}
          unit={l.unit}
          icon={Home}
          colorClass="text-load"
          ringClass="border-load/30"
        />
        {hasBattery && (
          <Node
            x={260}
            y={310}
            label="Battery"
            value={String(battery?.soc ?? 0)}
            unit="%"
            icon={BatteryCharging}
            colorClass="text-battery"
            ringClass="border-battery/30"
          />
        )}
      </svg>

      {!hasBattery && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 rounded-xl border border-dashed border-border/80 px-3 py-2 text-center text-xs text-muted-foreground"
        >
          No battery installed — storage flow appears here automatically once a battery is added.
        </motion.p>
      )}
    </div>
  );
}
