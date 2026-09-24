import type { ReactNode } from "react";

/**
 * Tappable 3D card-flip wrapper for the dual-source Energy Summary cards.
 * The whole card is the toggle target: the front face shows live UTL data and
 * the back face shows the canonical Archive summary. Both faces are always
 * mounted and stacked in the same grid cell so the card height never changes,
 * with the non-visible face hidden via backface-visibility.
 */
export function FlipMetricCard({
  title,
  flipped,
  onToggle,
  front,
  back,
}: {
  title: string;
  flipped: boolean;
  onToggle: () => void;
  front: ReactNode;
  back: ReactNode;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${title} — switch between UTL and archive data`}
      title={`${title} — tap to flip data source`}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className="relative cursor-pointer select-none rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [perspective:1200px]"
    >
      <div
        className="grid grid-cols-1 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div
          aria-hidden={flipped}
          className="[backface-visibility:hidden] [-webkit-backface-visibility:hidden] [grid-area:1/1]"
        >
          {front}
        </div>
        <div
          aria-hidden={!flipped}
          className="[backface-visibility:hidden] [-webkit-backface-visibility:hidden] [grid-area:1/1]"
          style={{ transform: "rotateY(180deg)" }}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
