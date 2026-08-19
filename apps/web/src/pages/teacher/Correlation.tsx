import {
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Upload } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { axisProps, tooltipProps } from "../../components/charts/chartTheme";
import { useChartPalette } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";
import { correlationData, linearRegression } from "../../data/mockDashboard";

export default function Correlation() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);
  const regressionLine = linearRegression(correlationData);

  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Score Upload & Correlation"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <div className="flex items-center gap-4 p-1">
            <div className="w-11 h-11 rounded-[10px] bg-brand-soft flex items-center justify-center flex-shrink-0">
              <Upload size={20} className="text-brand" />
            </div>
            <div className="flex-1">
              <div className="font-head text-sm font-semibold text-text-1">
                Upload exam scores (CSV)
              </div>
              <div className="font-body text-xs text-text-2">
                Or sync automatically from Google Forms/Sheets
              </div>
            </div>
            {/* Wire this input to POST /teacher/scores/upload with FormData */}
            <Button>Choose file</Button>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <div className="font-head text-[15px] font-semibold text-text-1">
              Suspicion vs. exam performance
            </div>
            <div className="font-body text-[12.5px] text-text-2 mt-0.5">
              Each point is one student session · trend line via linear
              regression
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid stroke={p.border} />
              <XAxis
                type="number"
                dataKey="suspicion"
                name="Suspicion score"
                domain={[0, 100]}
                {...axisProps(p)}
              />
              <YAxis
                type="number"
                dataKey="performance"
                name="Exam score"
                domain={[0, 100]}
                {...axisProps(p)}
              />
              <Tooltip
                {...tooltipProps(p)}
                cursor={{ strokeDasharray: "3 3" }}
              />
              <Scatter
                data={correlationData}
                fill={p.brand}
                fillOpacity={0.55}
              />
              <Line
                data={regressionLine}
                type="linear"
                dataKey="performance"
                stroke={p.riskHigh}
                strokeWidth={2}
                dot={false}
                legendType="none"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-3 p-3 rounded-[10px] bg-brand-soft font-body text-[12.5px] text-text-2">
            Higher suspicion scores trend with lower exam performance across
            this section — consistent with flagged behavior reflecting genuine
            academic dishonesty rather than false positives.
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
