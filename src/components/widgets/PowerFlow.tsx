import { Battery, Cpu, Grid2X2, Home, Sun } from "lucide-react";
import { useLivePower, useLogger, usePlantInfo } from "@/hooks/useSolarData";
import { cn } from "@/lib/utils";
import { getCapacityPercentage } from "@/utils/capacity";
import { formatPower } from "@/utils/format";
import type { LucideIcon } from "lucide-react";

const PATHS = {
  solar: "M380 126 C380 150 380 170 380 184",
  grid: "M326 286 C286 309 239 334 194 369",
  house: "M434 286 C474 309 521 334 566 369",
  battery: "M380 293 L380 383",
};

type NodeState = "active" | "inactive" | "disabled";

function FlowPath({
  d,
  active,
  color,
  dashed = false,
}: {
  d: string;
  active: boolean;
  color: string;
  dashed?: boolean;
}) {
  const dots = active ? 3 : 0;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="var(--border)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? "5 7" : undefined}
      />
      {active ? (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.3}
        />
      ) : null}
      {Array.from({ length: dots }).map((_, index) => (
        <circle key={index} r={4} fill={color}>
          <animateMotion
            dur="2.1s"
            repeatCount="indefinite"
            begin={`${(index * 2.1) / dots}s`}
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
            path={d}
          />
        </circle>
      ))}
    </g>
  );
}

function FlowNode({
  x,
  y,
  icon: Icon,
  label,
  value,
  detail,
  state,
  dimmed = false,
}: {
  x: number;
  y: number;
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  state: NodeState;
  dimmed?: boolean;
}) {
  const appearance = {
    active: "border-primary/35 bg-primary/10 text-primary",
    inactive: "border-border bg-muted/40 text-muted-foreground",
    disabled: "border-dashed border-border bg-muted/25 text-muted-foreground",
  }[state];

  return (
    <foreignObject x={x - 90} y={y - 60} width={180} height={120}>
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-1.5 text-center",
          dimmed && "opacity-45",
        )}
      >
        <span
          className={cn(
            "grid size-12 place-items-center rounded-2xl border bg-card/90 shadow-sm",
            appearance,
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="num text-sm font-semibold">{value}</p>
        <p className="text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </foreignObject>
  );
}

export function PowerFlow() {
  const { data: live } = useLivePower();
  const { data: logger } = useLogger();
  const { data: plant } = usePlantInfo();

  const solarPower = live?.solarPower ?? 0;
  const solar = formatPower(solarPower);
  const capacityPercentage = getCapacityPercentage(solarPower, plant?.capacityKw);
  const loggerOnline = logger?.status === "online";
  const producing = live?.plantStatus === "producing" && solarPower > 0;
  const animateFlow = loggerOnline && producing;
  const inverterDetail = animateFlow ? "Producing" : "Standby";

  return (
    <div className="relative overflow-hidden">
      <svg
        viewBox="0 0 760 540"
        className="mx-auto block w-full max-w-4xl"
        role="img"
        aria-label={`Power flow: solar ${solar.value} ${solar.unit}; ${inverterDetail.toLowerCase()}; grid and home consumption are not measured`}
      >
        <FlowPath d={PATHS.solar} color="var(--solar)" active={animateFlow} />
        <FlowPath d={PATHS.grid} color="var(--grid)" active={animateFlow} />
        <FlowPath d={PATHS.house} color="var(--load)" active={animateFlow} />
        <FlowPath d={PATHS.battery} color="var(--muted-foreground)" active={false} dashed />

        <FlowNode
          x={380}
          y={66}
          icon={Sun}
          label="Solar"
          value={`${solar.value} ${solar.unit}`}
          detail={
            capacityPercentage === null
              ? "Capacity unavailable"
              : `${capacityPercentage}% of capacity`
          }
          state="active"
          dimmed={!animateFlow}
        />
        <FlowNode
          x={380}
          y={240}
          icon={Cpu}
          label="Inverter"
          value={capacityPercentage === null ? "—" : `${capacityPercentage}%`}
          detail={inverterDetail}
          state={producing ? "active" : "inactive"}
          dimmed={!animateFlow}
        />
        <FlowNode
          x={132}
          y={426}
          icon={Grid2X2}
          label="Grid"
          value="Connection"
          detail="Not measured"
          state="inactive"
          dimmed={!animateFlow}
        />
        <FlowNode
          x={628}
          y={426}
          icon={Home}
          label="House"
          value="Not measured"
          detail="Consumption unavailable"
          state="inactive"
          dimmed={!animateFlow}
        />
        <FlowNode
          x={380}
          y={444}
          icon={Battery}
          label="Battery"
          value="Coming soon"
          detail="Not supported"
          state="disabled"
        />
      </svg>
    </div>
  );
}
