import { useChartPalette, riskTier } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";

type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, number> = { sm: 6, md: 8, lg: 10 };
const NUM_SIZE: Record<Size, string> = { sm: "text-[13px]", md: "text-[18px]", lg: "text-[34px]" };

/**
 * The signature ProctorX component: a continuous 0–100 gradient bar (teal → amber →
 * crimson) with a glowing marker at the score, used anywhere a suspicion/risk score
 * appears. Never replace with a flat pass/fail badge — the continuity is the point.
 */
export function SuspicionMeter({ score, size = "md" }: { score: number; size?: Size }) {
  const { dark } = useTheme();
  const palette = useChartPalette(dark);
  const tier = riskTier(score, palette);
  const h = HEIGHT[size];

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1">
        <span className={`font-mono font-semibold text-text-1 ${NUM_SIZE[size]}`}>{score}</span>
        <span className="font-body text-[11.5px] font-semibold" style={{ color: tier.color }}>
          {tier.label}
        </span>
      </div>
      <div
        className="relative rounded-full opacity-90"
        style={{
          height: h,
          background: `linear-gradient(90deg, ${palette.riskLow}, ${palette.riskMed} 55%, ${palette.riskHigh})`,
        }}
      >
        <div
          className="absolute rounded-sm"
          style={{
            top: -2,
            left: `calc(${score}% - 2px)`,
            width: 4,
            height: h + 4,
            background: "#fff",
            boxShadow: `0 0 0 2px ${tier.color}, 0 0 8px ${tier.color}99`,
          }}
        />
      </div>
    </div>
  );
}
