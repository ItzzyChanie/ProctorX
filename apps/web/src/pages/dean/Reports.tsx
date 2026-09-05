import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { FileText } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../lib/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';

type Report = {
  id: string;
  name: string;
  format: 'PDF' | 'EXCEL';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  createdAt: string;
  downloadPath: string | null;
  staleAt: string | null;
  dateFrom: string;
  dateTo: string;
  filters: { academicPeriodId?: string; term?: string } | null;
};
const reportSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    format: z.enum(['pdf', 'excel']),
    academicPeriodId: z.string().optional(),
    term: z.string().optional(),
  })
  .refine((x) => x.dateFrom <= x.dateTo, {
    path: ['dateTo'],
    message: 'End date must be after start date.',
  });

export default function Reports() {
  const client = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    dateFrom: '',
    dateTo: '',
    format: 'pdf' as 'pdf' | 'excel',
    academicPeriodId: '',
    term: '',
  });
  const { data: periods = [] } = useQuery({
    queryKey: ['academic-periods'],
    queryFn: async () =>
      (
        await api.get<
          {
            id: string;
            academicYear: string;
            semester: string;
            status: string;
          }[]
        >('/academic-periods')
      ).data,
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>(
    'success'
  );
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['dean-reports'],
    queryFn: async () => (await api.get<Report[]>('/dean/reports')).data,
    refetchInterval: (q) =>
      q.state.data?.some(
        (r) => r.status === 'PENDING' || r.status === 'PROCESSING'
      )
        ? 2500
        : false,
  });
  const create = useMutation({
    mutationFn: (data: z.infer<typeof reportSchema>) =>
      api.post('/dean/reports', data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['dean-reports'] });
      setMessageType('success');
      setMessage('Report queued for generation.');
      setForm({
        name: '',
        dateFrom: '',
        dateTo: '',
        format: 'pdf',
        academicPeriodId: '',
        term: '',
      });
    },
    onError: (error) => {
      setMessageType('error');
      if (axios.isAxiosError(error)) {
        const responseMessage = error.response?.data?.message;
        const detail = Array.isArray(responseMessage)
          ? responseMessage.join(' ')
          : responseMessage;
        setMessage(
          typeof detail === 'string' && detail
            ? `Could not queue the report: ${detail}`
            : 'Could not queue the report.'
        );
        return;
      }
      setMessage('Could not queue the report.');
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = reportSchema.safeParse(form);
    if (!parsed.success) {
      setMessageType('error');
      setMessage(
        parsed.error.issues[0]?.message ?? 'Check the report details.'
      );
      return;
    }
    create.mutate(parsed.data);
  };
  const download = async (report: Report) => {
    if (!report.downloadPath) return;
    setDownloadingId(report.id);
    try {
      const response = await api.get(report.downloadPath, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${report.name}.${
        report.format === 'PDF' ? 'pdf' : 'xlsx'
      }`;
      link.click();
      URL.revokeObjectURL(url);
      setMessageType('success');
      setMessage('Report downloaded successfully.');
    } catch {
      setMessageType('error');
      setMessage('Could not download the report.');
    } finally {
      setDownloadingId(null);
    }
  };
  const regenerate = (report: Report) => {
    create.mutate({
      name: report.name + ' (updated)',
      dateFrom: report.dateFrom.slice(0, 10),
      dateTo: report.dateTo.slice(0, 10),
      format: report.format.toLowerCase() as 'pdf' | 'excel',
      academicPeriodId: report.filters?.academicPeriodId ?? '',
      term: report.filters?.term ?? '',
    });
  };
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Reports"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Build a report"
            subtitle="Date range and output format are required."
          />
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Report name"
              className="rounded border border-border p-2"
            />
            <select
              value={form.academicPeriodId}
              onChange={(e) =>
                setForm({ ...form, academicPeriodId: e.target.value })
              }
              className="rounded border border-border p-2"
            >
              <option value="">All semesters</option>
              {periods.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.academicYear} ·{' '}
                  {x.semester === 'FIRST' ? 'First' : 'Second'} Semester
                </option>
              ))}
            </select>
            <select
              value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value })}
              className="rounded border border-border p-2"
            >
              <option value="">All terms</option>
              <option value="PRELIMINARY">Preliminary</option>
              <option value="MIDTERM">Midterm</option>
              <option value="SEMI_FINAL">Semi-final</option>
              <option value="FINAL">Final</option>
              <option value="UNSPECIFIED">Legacy / Unspecified</option>
            </select>
            <input
              required
              type="date"
              value={form.dateFrom}
              onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
              className="rounded border border-border p-2"
            />
            <input
              required
              type="date"
              value={form.dateTo}
              onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
              className="rounded border border-border p-2"
            />
            <div className="flex gap-2">
              <select
                value={form.format}
                onChange={(e) =>
                  setForm({
                    ...form,
                    format: e.target.value as 'pdf' | 'excel',
                  })
                }
                className="flex-1 rounded border border-border p-2"
              >
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
              </select>
              <Button disabled={create.isPending}>
                {create.isPending ? 'Queuing…' : 'Generate'}
              </Button>
            </div>
          </form>
          {message && (
            <p
              role={messageType === 'error' ? 'alert' : 'status'}
              className={`fixed bottom-5 right-5 z-50 rounded px-4 py-3 text-sm text-white shadow-lg ${
                messageType === 'success' ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {message}
            </p>
          )}
        </Card>
        <Card padded={false}>
          {isLoading && (
            <div className="p-5 text-sm text-text-2">Loading reports…</div>
          )}
          {isError && (
            <div className="p-5 text-sm text-risk-high">
              Could not load reports.
            </div>
          )}
          {!isLoading && !isError && !rows.length && (
            <div className="p-5 text-sm text-text-2">
              No reports have been requested.
            </div>
          )}
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex items-center gap-3">
                <FileText size={17} className="text-text-3" />
                <div>
                  <div className="font-body text-[13.5px] font-semibold text-text-1">
                    {r.name}
                  </div>
                  <div className="font-body text-[11.5px] text-text-3">
                    {new Date(r.createdAt).toLocaleString()}
                    {r.downloadPath && (
                      <>
                        {' '}
                        ·{' '}
                        <button
                          type="button"
                          disabled={downloadingId === r.id}
                          onClick={() => void download(r)}
                          className="text-brand underline disabled:opacity-50"
                        >
                          {downloadingId === r.id ? 'Downloading…' : 'Download'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Chip color="var(--brand)">{r.format}</Chip>
                <Chip
                  color={
                    r.status === 'FAILED'
                      ? 'var(--risk-high)'
                      : r.status === 'COMPLETE'
                        ? 'var(--risk-low)'
                        : 'var(--risk-med)'
                  }
                >
                  {r.status}
                </Chip>
                {r.staleAt && (
                  <>
                    <Chip color="var(--risk-med)">OUTDATED</Chip>
                    <Button
                      variant="ghost"
                      disabled={create.isPending}
                      onClick={() => regenerate(r)}
                    >
                      Regenerate with current facts
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </DashboardLayout>
  );
}
