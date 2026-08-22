import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { axisProps, tooltipProps } from '../../components/charts/chartTheme';
import { useChartPalette, riskTier } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { api } from '../../lib/api';
type Data = {
  incidenceRateBySection: { section: string; rate: number }[];
  correlation: {
    points: { suspicion: number; performance: number }[];
    regressionLine: { suspicion: number; performance: number }[] | null;
    insufficientData: boolean;
  };
};
export default function Analytics() {
  const { dark } = useTheme(),
    p = useChartPalette(dark);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    program: '',
    yearLevel: '',
    section: '',
    subjectCode: '',
  });
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v)
  );
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dean-analytics', params],
    queryFn: async () =>
      (await api.get<Data>('/dean/analytics', { params })).data,
  });
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Analytics"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Analytics filters"
            subtitle="All charts and correlation use this same server-side scope."
          />
          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                ['dateFrom', 'date'],
                ['dateTo', 'date'],
                ['program', 'text'],
                ['yearLevel', 'text'],
                ['section', 'text'],
                ['subjectCode', 'text'],
              ] as const
            ).map(([key, type]) => (
              <input
                key={key}
                type={type}
                value={filters[key]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
                placeholder={key}
                className="rounded border border-border p-2"
              />
            ))}
          </div>
        </Card>
        {isLoading && <Card>Loading analytics…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">
              Could not load analytics for these filters.
            </span>
          </Card>
        )}
        <Card>
          <CardHeader
            title="Suspicion vs. performance"
            subtitle={
              data?.correlation.insufficientData
                ? 'Insufficient distinct, teacher-confirmed results for a regression line.'
                : 'Teacher-confirmed scores and final suspicion snapshots'
            }
          />
          {data?.correlation.points.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart>
                <CartesianGrid stroke={p.border} />
                <XAxis
                  type="number"
                  dataKey="suspicion"
                  domain={[0, 100]}
                  {...axisProps(p)}
                />
                <YAxis
                  type="number"
                  dataKey="performance"
                  domain={[0, 100]}
                  {...axisProps(p)}
                />
                <Tooltip {...tooltipProps(p)} />
                <Scatter data={data.correlation.points} fill={p.violet} />
                {data.correlation.regressionLine && (
                  <Line
                    data={data.correlation.regressionLine}
                    type="linear"
                    dataKey="performance"
                    stroke={p.riskHigh}
                    dot={false}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-2">
              No confirmed graded sessions match the filters.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader title="Section comparison" />
          {data?.incidenceRateBySection.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.incidenceRateBySection}>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="section" {...axisProps(p)} />
                <YAxis {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Bar dataKey="rate">
                  {data.incidenceRateBySection.map((d, i) => (
                    <Cell key={i} fill={riskTier(d.rate, p).color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-2">
              No section data matches the filters.
            </p>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
