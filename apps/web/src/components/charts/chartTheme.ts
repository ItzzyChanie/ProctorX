import type { ChartPalette } from "../../lib/chartPalette";

/** Spread onto <XAxis>/<YAxis> for consistently themed axes. */
export function axisProps(p: ChartPalette) {
  return {
    stroke: p.textTertiary,
    tick: {
      fill: p.textTertiary,
      fontFamily: "var(--font-body)",
      fontSize: 11.5,
    },
    axisLine: false as const,
    tickLine: false as const,
  };
}

/** Spread onto <Tooltip> for a themed tooltip surface. */
export function tooltipProps(p: ChartPalette) {
  return {
    contentStyle: {
      background: p.surfaceRaised,
      border: `1px solid ${p.border}`,
      borderRadius: 10,
      fontFamily: "var(--font-body)",
      fontSize: 12.5,
    },
    labelStyle: { color: p.textSecondary },
  };
}

export const INCIDENT_COLORS = (p: ChartPalette) => [
  p.brand,
  p.riskHigh,
  p.riskMed,
  p.cyan,
];
