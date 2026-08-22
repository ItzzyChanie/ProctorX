import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { api } from '../../lib/api';
import axios from 'axios';
import { z } from 'zod';

type Role = 'dean' | 'teacher';
type Student = {
  id: string;
  fullName: string;
  email: string | null;
  status: string;
  createdAt: string;
  studentProfile: {
    studentId: string | null;
    program: string | null;
    yearLevel: string | null;
  } | null;
};
const years = [1, 2, 3, 4];
const createStudentSchema = z.object({
  studentId: z.string().regex(/^[A-Za-z0-9-]{3,50}$/),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email().max(320),
  program: z.enum(['CS', 'IT']),
  yearLevel: z.enum(['1', '2', '3', '4']),
});
const updateStudentSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  email: z.string().email().max(320),
});
const suffix = (year: number) =>
  year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th';
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const formatCreatedAt = (value: string) => {
  const parts = Object.fromEntries(
    dateFormat
      .formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${parts.month} ${parts.day}, ${parts.year} - ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod}`;
};

export default function StudentLists({ role }: { role: Role }) {
  const [program, setProgram] = useState<string>();
  const [yearLevel, setYearLevel] = useState<string>();
  const [rows, setRows] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [confirm, setConfirm] = useState<'save' | 'delete' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);
  const [editForm, setEditForm] = useState({ fullName: '', email: '' });
  const [form, setForm] = useState({
    studentId: '',
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
  });
  const refresh = async () => {
    if (!program || !yearLevel) return;
    setLoading(true);
    try {
      setRows(
        (
          await api.get<Student[]>(
            `/students?program=${program}&yearLevel=${yearLevel}`
          )
        ).data
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [program, yearLevel]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setRequestError(null);
    const parsed = createStudentSchema.safeParse({
      ...form,
      program,
      yearLevel,
    });
    if (!parsed.success) {
      setRequestError(
        parsed.error.issues[0]?.message ?? 'Check the student details.'
      );
      return;
    }
    setSaving(true);
    try {
      await api.post('/users/students', parsed.data);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      setRequestError(
        message ?? 'Unable to create the student account. Please try again.'
      );
      setSaving(false);
      return;
    }
    setSaving(false);
    setShowModal(false);
    setForm({
      studentId: '',
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
    });
    setToast('Student account added successfully.');
    window.setTimeout(() => setToast(null), 3500);
    await refresh();
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setRequestError(null);
    const data = new FormData();
    data.append('file', file);
    setImporting(true);
    try {
      const response = await api.post<{
        createdRows: number;
        skippedRows: number;
        errorRows: number;
      }>('/users/import/students', data);
      setToast(
        `Import complete: ${response.data.createdRows} created, ${response.data.skippedRows} duplicates skipped, ${response.data.errorRows} errors.`
      );
      window.setTimeout(() => setToast(null), 5000);
      await refresh();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      setRequestError(
        message ?? 'Unable to import the spreadsheet. Please try again.'
      );
    } finally {
      setImporting(false);
    }
  };
  const displayName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    const last = parts.pop();
    return `${last}, ${parts.join(' ')}`;
  };
  const filteredRows = rows
    .filter((row) =>
      `${row.fullName} ${row.studentProfile?.studentId ?? ''} ${row.email ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sort === 'asc'
        ? displayName(a.fullName).localeCompare(displayName(b.fullName))
        : displayName(b.fullName).localeCompare(displayName(a.fullName))
    );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice(
    (page - 1) * pageSize,
    page * pageSize
  );
  const confirmAction = async () => {
    if (!editing || !confirm) return;
    setConfirming(true);
    setRequestError(null);
    try {
      if (confirm === 'delete') await api.delete(`/students/${editing.id}`);
      else {
        const parsed = updateStudentSchema.safeParse(editForm);
        if (!parsed.success) {
          setRequestError(
            parsed.error.issues[0]?.message ?? 'Check the student details.'
          );
          setConfirming(false);
          return;
        }
        await api.patch(`/students/${editing.id}`, parsed.data);
      }
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      setRequestError(
        message ??
          `Unable to ${
            confirm === 'delete' ? 'delete' : 'update'
          } the student account.`
      );
      setConfirming(false);
      return;
    }
    setToast(
      confirm === 'delete'
        ? 'Student account deleted successfully.'
        : 'Student account updated successfully.'
    );
    window.setTimeout(() => setToast(null), 3500);
    setConfirm(null);
    setEditing(null);
    setConfirming(false);
    await refresh();
  };
  return (
    <DashboardLayout role={role} pageTitle="Student Lists">
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[70] rounded-[10px] bg-emerald-600 px-4 py-3 font-body text-sm font-semibold text-white shadow-xl"
        >
          {toast}
        </div>
      )}
      {requestError && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-[70] max-w-md rounded-[10px] bg-red-600 px-4 py-3 font-body text-sm font-semibold text-white shadow-xl"
        >
          {requestError}
        </div>
      )}
      {!program && (
        <>
          <p className="mb-6 font-body text-sm text-text-3">
            Choose a program to view its student lists.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              ['CS', 'Computer Science', 'CS'],
              ['IT', 'Information Technology', 'IT'],
            ].map(([key, label, tag]) => (
              <button
                key={key}
                onClick={() => setProgram(key)}
                className="group rounded-[16px] border border-border bg-surface p-7 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <GraduationCap size={23} />
                </div>
                <div className="font-head text-xl font-bold text-text-1">
                  {label}
                </div>
                <div className="mt-2 font-body text-sm text-text-3">
                  Browse {tag} student records
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {program && !yearLevel && (
        <>
          <button
            onClick={() => setProgram(undefined)}
            className="mb-5 inline-flex items-center gap-1 font-body text-sm font-medium text-brand"
          >
            <ArrowLeft size={16} /> Programs
          </button>
          <h2 className="mb-1 font-head text-xl font-bold text-text-1">
            {program === 'CS' ? 'Computer Science' : 'Information Technology'}
          </h2>
          <p className="mb-6 font-body text-sm text-text-3">
            Select a year level to see enrolled student accounts.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {years.map((year) => (
              <button
                key={year}
                onClick={() => setYearLevel(String(year))}
                className="rounded-[14px] border border-border bg-surface p-6 text-left shadow-card transition hover:border-brand"
              >
                <span className="font-head text-2xl font-bold text-brand">
                  {year}
                  {suffix(year)}
                </span>
                <p className="mt-2 font-body text-sm font-medium text-text-1">
                  Year level
                </p>
              </button>
            ))}
          </div>
        </>
      )}
      {program && yearLevel && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setYearLevel(undefined)}
              className="inline-flex items-center gap-1 font-body text-sm font-medium text-brand"
            >
              <ArrowLeft size={16} /> Year levels
            </button>
            {role === 'dean' && (
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-[10px] border border-border px-3 py-2 font-body text-sm font-medium text-text-2 hover:bg-brand-soft">
                  <Upload size={15} className="mr-1 inline" />{' '}
                  {importing ? 'Importing…' : 'Import Excel'}
                  <input
                    className="hidden"
                    type="file"
                    disabled={importing}
                    accept=".xlsx"
                    onChange={(event) => void upload(event.target.files?.[0])}
                  />
                </label>
                <button
                  onClick={() => setShowModal(true)}
                  className="rounded-[10px] bg-brand px-3 py-2 font-body text-sm font-semibold text-white"
                >
                  <Plus size={15} className="mr-1 inline" /> Add student
                </button>
              </div>
            )}
          </div>
          <Card padded={false}>
            <div className="p-5">
              <CardHeader
                title={`${program} · ${yearLevel}${suffix(Number(yearLevel))} Year`}
                subtitle="Student accounts filtered by program and year level"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm text-text-2">
                  Show{' '}
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded border border-border p-1"
                  >
                    {[15, 25, 35, 50, 100].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>{' '}
                  rows
                </label>
                <div className="flex gap-2">
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as 'asc' | 'desc');
                      setPage(1);
                    }}
                    className="rounded border border-border p-1 text-sm"
                  >
                    <option value="asc">Name: A–Z</option>
                    <option value="desc">Name: Z–A</option>
                  </select>
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search students…"
                    className="rounded border border-border px-3 py-1 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left font-body text-[13px]">
                <thead className="border-y border-border bg-surface-2 text-text-3">
                  <tr>
                    {[
                      'Student ID',
                      'Full Name',
                      'Program',
                      'Email',
                      'Status',
                      'Date & Time Created',
                      ...(role === 'dean' ? ['Actions'] : []),
                    ].map((header) => (
                      <th key={header} className="px-5 py-3 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((student) => (
                    <tr
                      key={student.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-4 font-medium text-text-1">
                        {student.studentProfile?.studentId}
                      </td>
                      <td className="px-5 py-4 text-text-1">
                        {displayName(student.fullName)}
                      </td>
                      <td className="px-5 py-4">
                        {student.studentProfile?.program}
                      </td>
                      <td className="px-5 py-4">{student.email}</td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            student.status === 'ACTIVE'
                              ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'
                              : 'rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700'
                          }
                        >
                          {student.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-text-2">
                        {formatCreatedAt(student.createdAt)}
                      </td>
                      {role === 'dean' && (
                        <td className="px-5 py-4">
                          <button
                            className="text-brand"
                            onClick={() => {
                              setEditing(student);
                              setEditForm({
                                fullName: student.fullName,
                                email: student.email ?? '',
                              });
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="ml-3 text-red-500"
                            onClick={() => {
                              setEditing(student);
                              setConfirm('delete');
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!loading && filteredRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={role === 'dean' ? 7 : 6}
                        className="px-5 py-10 text-center text-text-3"
                      >
                        No students found in this year level.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-text-3">
              <span>
                Showing {filteredRows.length ? (page - 1) * pageSize + 1 : 0}–
                {Math.min(page * pageSize, filteredRows.length)} of{' '}
                {filteredRows.length}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="px-2 disabled:opacity-40"
                >
                  Previous
                </button>
                {Array.from(
                  { length: Math.min(pageCount, 10) },
                  (_, i) => i + 1
                ).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={
                      n === page ? 'rounded bg-brand px-2 text-white' : 'px-2'
                    }
                  >
                    {n}
                  </button>
                ))}
                <button
                  disabled={page === pageCount}
                  onClick={() => setPage(page + 1)}
                  className="px-2 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </Card>
        </>
      )}
      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={save}
            className="w-full max-w-lg rounded-[16px] bg-surface p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-head text-xl font-bold text-text-1">
                  Add student
                </h2>
                <p className="mt-1 text-sm text-text-3">
                  The account will start as Pending.
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['studentId', 'Student ID'],
                ['firstName', 'Firstname'],
                ['middleName', 'Middle name'],
                ['lastName', 'Lastname'],
                ['email', 'Email'],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className={key === 'email' ? 'sm:col-span-2' : ''}
                >
                  <span className="mb-1 block text-xs font-medium text-text-2">
                    {label}
                  </span>
                  <input
                    required
                    type={key === 'email' ? 'email' : 'text'}
                    value={form[key as keyof typeof form]}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                    className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-[9px] px-4 py-2 text-sm font-medium text-text-2"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
      {editing && !confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm('save');
            }}
            className="w-full max-w-md rounded-[16px] bg-surface p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-head text-xl font-bold text-text-1">
                Edit student
              </h2>
              <button type="button" onClick={() => setEditing(null)}>
                <X size={20} />
              </button>
            </div>
            <label className="mb-3 block text-sm text-text-2">
              Full name
              <input
                required
                value={editForm.fullName}
                onChange={(e) =>
                  setEditForm({ ...editForm, fullName: e.target.value })
                }
                className="mt-1 w-full rounded-[9px] border border-border px-3 py-2 text-text-1"
              />
            </label>
            <label className="block text-sm text-text-2">
              Email
              <input
                required
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
                className="mt-1 w-full rounded-[9px] border border-border px-3 py-2 text-text-1"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button className="rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white">
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}
      {editing && confirm && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-surface p-6 shadow-2xl">
            <h2 className="font-head text-xl font-bold text-text-1">
              Confirm {confirm === 'delete' ? 'deletion' : 'changes'}
            </h2>
            <p className="mt-2 text-sm text-text-3">
              {confirm === 'delete'
                ? `Delete ${editing.fullName}'s account? This cannot be undone.`
                : `Save the changes to ${editing.fullName}'s account?`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setConfirm(null);
                  if (confirm === 'delete') setEditing(null);
                }}
                className="px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={confirming}
                onClick={() => void confirmAction()}
                className={
                  confirm === 'delete'
                    ? 'rounded-[9px] bg-red-600 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white'
                }
              >
                {confirming
                  ? 'Working…'
                  : confirm === 'delete'
                    ? 'Delete account'
                    : 'Confirm save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
