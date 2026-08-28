import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Trash2 } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
type Subject = { id: string; subjectCode: string; name: string };
type Student = {
  id: string;
  fullName: string;
  email: string;
  profilePicture?: string;
  studentProfile?: {
    studentId: string;
    program: string;
    yearLevel: string;
    section?: { id: string; name: string };
  };
  status: string;
  enrolledAt: string;
};
export default function StudentRosters() {
  const client = useQueryClient(),
    [subjectId, setSubjectId] = useState(''),
    [search, setSearch] = useState(''),
    [section, setSection] = useState(''),
    [sort, setSort] = useState('az'),
    [limit, setLimit] = useState(15),
    [page, setPage] = useState(1),
    [remove, setRemove] = useState<Student | null>(null),
    [toast, setToast] = useState('');
  const subjects = useQuery({
    queryKey: ['subjects-mine'],
    queryFn: async () => (await api.get<Subject[]>('/subjects/mine')).data,
  });
  const active = subjectId || subjects.data?.[0]?.id || '';
  const roster = useQuery({
    queryKey: ['student-rosters', active],
    enabled: !!active,
    queryFn: async () => {
      const rows = (
        await api.get<
          {
            student: Omit<Student, 'enrolledAt'>;
            enrolledAt: string;
            assessmentStatus: string;
          }[]
        >(`/subjects/${active}/students`)
      ).data;
      return rows.filter((x) => Boolean(x?.student?.id)).map((x) => ({
        ...x.student,
        enrolledAt: x.enrolledAt,
        status: x.student.status || x.assessmentStatus,
      }));
    },
  });
  const rows = useMemo(() => {
    let x = (roster.data ?? []).filter(
      (s) =>
        `${s.fullName} ${s.email} ${s.studentProfile?.studentId}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!section || s.studentProfile?.section?.name === section)
    );
    x.sort(
      (a, b) => (sort === 'az' ? 1 : -1) * a.fullName.localeCompare(b.fullName)
    );
    return x;
  }, [roster.data, search, section, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / limit));
  const shown = rows.slice(
    (Math.min(page, pages) - 1) * limit,
    Math.min(page, pages) * limit
  );
  const sections = [
    ...new Set(
      (roster.data ?? [])
        .map((x) => x.studentProfile?.section?.name)
        .filter(Boolean)
    ),
  ] as string[];
  const del = useMutation({
    mutationFn: () => api.delete(`/subjects/${active}/students/${remove?.id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['student-rosters', active] });
      client.invalidateQueries({
        queryKey: ['classes-subject-roster', active],
      });
      setRemove(null);
      setToast('Student removed from the subject successfully.');
      setTimeout(() => setToast(''), 3000);
    },
  });
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Student Rosters"
      userName="Professor"
      userTag="College of Computer Studies"
    >
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Student Rosters"
            subtitle="View and manage students enrolled in each subject across different programs, years, and sections."
          />
          <select
            className="w-full max-w-lg rounded-lg border border-border bg-surface px-3 py-2.5"
            value={active}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setPage(1);
            }}
          >
            {subjects.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.subjectCode} — {x.name}
              </option>
            ))}
          </select>
        </Card>
        <Card>
          <div className="mb-4 flex flex-wrap gap-2">
            <label className="relative min-w-[240px] flex-1">
              <Search
                className="absolute left-3 top-2.5 text-text-3"
                size={17}
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search ID, name, or email"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3"
              />
            </label>
            <select
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3"
            >
              <option value="">All sections</option>
              {sections.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3"
            >
              <option value="az">Name A–Z</option>
              <option value="za">Name Z–A</option>
            </select>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(+e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3"
            >
              {[15, 25, 35, 50, 100].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-text-2">
                <tr>
                  {[
                    'Profile',
                    'Student ID',
                    'Full name',
                    'Program',
                    'Year',
                    'Section',
                    'Status',
                    'Enrolled',
                    'Actions',
                  ].map((x) => (
                    <th key={x} className="px-3 py-3">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="border-b border-border">
                    <td className="px-3 py-3">
                      {s.profilePicture ? (
                        <img
                          src={s.profilePicture}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft font-bold text-brand">
                          {s.fullName[0]}
                        </div>
                      )}
                    </td>
                    <td className="px-3">
                      {s.studentProfile?.studentId ?? '—'}
                    </td>
                    <td className="px-3 font-medium">
                      {s.fullName}
                      <div className="text-xs font-normal text-text-2">
                        {s.email}
                      </div>
                    </td>
                    <td className="px-3">{s.studentProfile?.program ?? '—'}</td>
                    <td className="px-3">
                      {s.studentProfile?.yearLevel ?? '—'}
                    </td>
                    <td className="px-3">
                      {s.studentProfile?.section?.name ?? 'Unassigned'}
                    </td>
                    <td className="px-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          s.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : s.status === 'DISABLED'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3">
                      {new Date(s.enrolledAt).toLocaleString()}
                    </td>
                    <td className="px-3">
                      <button
                        onClick={() => setRemove(s)}
                        className="rounded p-2 text-risk-high hover:bg-red-50"
                        aria-label={`Remove ${s.fullName}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && (
              <p className="py-10 text-center text-sm text-text-2">
                {active
                  ? 'No enrolled students match the filters.'
                  : 'No subjects available.'}
              </p>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-text-2">
            <span>
              Showing {shown.length} of {rows.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((x) => x - 1)}
              >
                Previous
              </Button>
              <span className="px-2 py-2">
                Page {Math.min(page, pages)} of {pages}
              </span>
              <Button
                variant="ghost"
                disabled={page >= pages}
                onClick={() => setPage((x) => x + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>
      {remove && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4">
          <div className="max-w-md rounded-2xl bg-surface p-5">
            <h2 className="text-lg font-bold">Remove student?</h2>
            <p className="mt-2 text-sm text-text-2">
              Remove {remove.fullName} from this subject? Their official
              dean-assigned section and historical exam records will not be
              deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemove(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={del.isPending}
                onClick={() => del.mutate()}
              >
                {del.isPending ? 'Removing…' : 'Remove student'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[80] rounded-lg bg-emerald-600 px-4 py-3 text-sm text-white"
        >
          {toast}
        </div>
      )}
    </DashboardLayout>
  );
}
