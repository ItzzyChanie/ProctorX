/**
 * Recharts needs resolved hex/rgba values (SVG props don't reliably read CSS vars
 * across all browsers), so we mirror the design tokens from design-tokens.css here.
 * Keep these two files in sync if you change a token.
 */
export type ChartPalette = {
  border: string;
  textTertiary: string;
  textSecondary: string;
  surfaceRaised: string;
  brand: string;
  riskLow: string;
  riskMed: string;
  riskHigh: string;
  violet: string;
  cyan: string;
  pink: string;
};

export const CHART_PALETTE: Record<"light" | "dark", ChartPalette> = {
  light: {
    border: "#E7E9F0",
    textTertiary: "#9397AC",
    textSecondary: "#5D6178",
    surfaceRaised: "#FFFFFF",
    brand: "#4F46E5",
    riskLow: "#0EA37B",
    riskMed: "#E8A23B",
    riskHigh: "#E5484D",
    violet: "#8B5CF6",
    cyan: "#0EA5B7",
    pink: "#EC4899",
  },
  dark: {
    border: "#232634",
    textTertiary: "#5F6478",
    textSecondary: "#9498AC",
    surfaceRaised: "#191C27",
    brand: "#7C7BFF",
    riskLow: "#1FD8A6",
    riskMed: "#F5B94F",
    riskHigh: "#FF6369",
    violet: "#A78BFA",
    cyan: "#22D3EE",
    pink: "#F472B6",
  },
};

export function useChartPalette(dark: boolean): ChartPalette {
  return dark ? CHART_PALETTE.dark : CHART_PALETTE.light;
}

/** Risk tier lookup shared by the SuspicionMeter and any chart that colors by risk. */
export function riskTier(score: number, palette: ChartPalette) {
  if (score < 40) return { label: "Low", color: palette.riskLow };
  if (score < 70) return { label: "Medium", color: palette.riskMed };
  return { label: "High", color: palette.riskHigh };
}
