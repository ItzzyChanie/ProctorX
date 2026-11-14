import type { ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';
import { useIsPhone } from '../../lib/useMediaQuery';

/** Max plot height on phones; taller desktop charts shrink to fit the screen. */
const PHONE_MAX_HEIGHT = 200;

/**
 * Drop-in replacement for Recharts' ResponsiveContainer that renders shorter
 * charts on phones. Charts whose height grows with their row count (horizontal
 * bar charts) pass `className="chart-tall"` and keep their full height.
 */
export function ResponsiveChart({
  height,
  className,
  ...props
}: ComponentProps<typeof ResponsiveContainer>) {
  const isPhone = useIsPhone();
  const shrink =
    isPhone &&
    typeof height === 'number' &&
    !String(className ?? '').includes('chart-tall');
  return (
    <ResponsiveContainer
      {...props}
      className={className}
      height={shrink ? Math.min(height, PHONE_MAX_HEIGHT) : height}
    />
  );
}
