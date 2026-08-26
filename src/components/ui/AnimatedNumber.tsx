import { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
};

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 700,
  prefix = "",
  suffix = "",
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const start = previous.current;
    const end = value;

    let frame = 0;
    const totalFrames = Math.max(1, Math.round(duration / 16));

    const animate = () => {
      frame++;

      const progress = frame / totalFrames;

      const eased = 1 - Math.pow(1 - progress, 3);

      const current = start + (end - start) * eased;

      setDisplay(current);

      if (frame < totalFrames) {
        requestAnimationFrame(animate);
      } else {
        previous.current = end;
        setDisplay(end);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </>
  );
}
