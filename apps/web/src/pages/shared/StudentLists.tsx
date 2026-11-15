import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  GraduationCap,
  Pencil,
  Power,
  PowerOff,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { api, assetSrc } from '../../lib/api';
import axios from 'axios';
import { z } from 'zod';

type Role = 'dean' | 'teacher';
type Student = {
  id: string;
  fullName: string;
  email: string | null;
  status: string;
  createdAt: string;
  profilePicture?: string | null;
  assessmentStatus?: 'TAKEN' | 'NOT_TAKEN';
  studentProfile: {
    studentId: string | null;
    program: string | null;
    yearLevel: string | null;
    section?: {
      id: string;
      name: string;
    } | null;
  } | null;
};
type Section = {
  id: string;
  name: string;
  _count: { students: number };
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
  sectionId: z.string().uuid(),
  profilePicture: z.string(),
});
const updateStudentSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  email: z.string().email().max(320),
  newPassword: z
    .string()
    .min(6, 'Use at least 6 characters.')
    .max(128)
    .regex(/\d/, 'Include a number.')
    .regex(/[^A-Za-z0-9]/, 'Include a special character.')
    .or(z.literal('')),
  profilePicture: z.string(),
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
  const [section, setSection] = useState<Section>();
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [creatingSection, setCreatingSection] = useState(false);
  const [editingSection, setEditingSection] = useState<Section>();
  const [deletingSection, setDeletingSection] = useState<Section>();
  const [sectionActionPending, setSectionActionPending] = useState(false);
  const [rows, setRows] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    studentId: string;
    initialPassword: string;
  }>();
  const [editing, setEditing] = useState<Student | null>(null);
  const [placement, setPlacement] = useState<{
    mode: 'transfer' | 'promote';
    student?: Student;
  }>();
  const [placementProgram, setPlacementProgram] = useState('');
  const [placementYear, setPlacementYear] = useState('');
  const [placementSections, setPlacementSections] = useState<Section[]>([]);
  const [placementSectionId, setPlacementSectionId] = useState('');
  const [placementPending, setPlacementPending] = useState(false);
  const [confirm, setConfirm] = useState<'save' | 'status' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    newPassword: '',
    profilePicture: '',
  });
  const [form, setForm] = useState({
    studentId: '',
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    profilePicture: '',
  });
  const refresh = async () => {
    if (!program || !yearLevel || (role === 'dean' && !section)) return;
    setLoading(true);
    try {
      setRows(
        (
          await api.get<Student[]>(
            `/students?program=${program}&yearLevel=${yearLevel}${
              section ? `&sectionId=${section.id}` : ''
            }`
          )
        ).data
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [program, yearLevel, section]);
  useEffect(() => {
    if (!program || !yearLevel || (role === 'dean' && !section)) return;
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [program, yearLevel, section, role]);
  useEffect(() => {
    if (role !== 'dean' || !program || !yearLevel) return;
    setSectionsLoading(true);
    api
      .get<Section[]>(
        `/students/sections?program=${program}&yearLevel=${yearLevel}`
      )
      .then(({ data }) => setSections(data))
      .catch(() => setRequestError('Unable to load sections.'))
      .finally(() => setSectionsLoading(false));
  }, [program, yearLevel, role]);
  useEffect(() => {
    if (!placement || !placementProgram || !placementYear) return;
    setPlacementSectionId('');
    api
      .get<Section[]>(
        '/students/sections?program=' +
          placementProgram +
          '&yearLevel=' +
          placementYear
      )
      .then(({ data }) => setPlacementSections(data))
      .catch(() => setRequestError('Unable to load target sections.'));
  }, [placement, placementProgram, placementYear]);
  const openTransfer = (student: Student) => {
    setPlacement({ mode: 'transfer', student });
    setPlacementProgram(student.studentProfile?.program ?? program ?? '');
    setPlacementYear(student.studentProfile?.yearLevel ?? yearLevel ?? '');
    setPlacementSectionId('');
  };
  const openPromotion = () => {
    if (!section || !program || !yearLevel) return;
    setPlacement({ mode: 'promote' });
    setPlacementProgram(program);
    setPlacementYear(String(Math.min(4, Number(yearLevel) + 1)));
    setPlacementSectionId('');
  };
  const savePlacement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!placement || !placementSectionId) return;
    setPlacementPending(true);
    setRequestError(null);
    try {
      if (placement.mode === 'transfer' && placement.student) {
        await api.patch('/students/' + placement.student.id + '/placement', {
          program: placementProgram,
          yearLevel: placementYear,
          sectionId: placementSectionId,
        });
        setToast('Student transferred successfully.');
      } else if (section) {
        const { data } = await api.post<{ promoted: number }>(
          '/students/sections/' + section.id + '/promote',
          { targetSectionId: placementSectionId }
        );
        setToast(
          String(data.promoted) +
            (data.promoted === 1
              ? ' student promoted successfully.'
              : ' students promoted successfully.')
        );
      }
      setPlacement(undefined);
      window.setTimeout(() => setToast(null), 3500);
      await refresh();
    } catch (error) {
      setRequestError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message ?? 'Unable to update placement.')
          : 'Unable to update placement.'
      );
    } finally {
      setPlacementPending(false);
    }
  };
  const createSection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!program || !yearLevel || !sectionName.trim()) return;
    setCreatingSection(true);
    setRequestError(null);
    try {
      const { data } = await api.post<Section>('/students/sections', {
        program,
        yearLevel,
        name: sectionName.trim(),
      });
      setSections((current) =>
        [...current, { ...data, _count: { students: 0 } }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setSectionName('');
      setShowSectionModal(false);
      setToast('Section added successfully.');
      window.setTimeout(() => setToast(null), 3500);
    } catch (error) {
      setRequestError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message ?? 'Unable to create the section.')
          : 'Unable to create the section.'
      );
    } finally {
      setCreatingSection(false);
    }
  };
  const updateSection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingSection || !sectionName.trim()) return;
    setSectionActionPending(true);
    setRequestError(null);
    try {
      const { data } = await api.patch<Section>(
        `/students/sections/${editingSection.id}`,
        { name: sectionName.trim() }
      );
      setSections((current) =>
        current
          .map((item) => (item.id === data.id ? data : item))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingSection(undefined);
      setSectionName('');
      setToast('Section updated successfully.');
      window.setTimeout(() => setToast(null), 3500);
    } catch (error) {
      setRequestError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message ?? 'Unable to update the section.')
          : 'Unable to update the section.'
      );
    } finally {
      setSectionActionPending(false);
    }
  };
  const deleteSection = async () => {
    if (!deletingSection) return;
    setSectionActionPending(true);
    setRequestError(null);
    try {
      await api.delete(`/students/sections/${deletingSection.id}`);
      setSections((current) =>
        current.filter((item) => item.id !== deletingSection.id)
      );
      setDeletingSection(undefined);
      setToast('Section deleted successfully.');
      window.setTimeout(() => setToast(null), 3500);
    } catch (error) {
      setRequestError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message ?? 'Unable to delete the section.')
          : 'Unable to delete the section.'
      );
    } finally {
      setSectionActionPending(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setRequestError(null);
    const parsed = createStudentSchema.safeParse({
      ...form,
      program,
      yearLevel,
      sectionId: section?.id,
    });
    if (!parsed.success) {
      setRequestError(
        parsed.error.issues[0]?.message ?? 'Check the student details.'
      );
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{
        user: { loginId: string };
        initialPassword: string;
      }>('/users/students', parsed.data);
      setCreatedCredentials({
        studentId: data.user.loginId,
        initialPassword: data.initialPassword,
      });
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
      profilePicture: '',
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
    if (!section)
      return setRequestError('Select a section before importing students.');
    data.append('sectionId', section.id);
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
      if (confirm === 'status') {
        await api.patch(`/students/${editing.id}/status`, {
          status: editing.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED',
        });
      }
      else {
        const parsed = updateStudentSchema.safeParse(editForm);
        if (!parsed.success) {
          setRequestError(
            parsed.error.issues[0]?.message ?? 'Check the student details.'
          );
          setConfirming(false);
          return;
        }
        await api.patch(`/students/${editing.id}`, {
          ...parsed.data,
          newPassword: parsed.data.newPassword || undefined,
        });
      }
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      setRequestError(
        message ??
          `Unable to ${confirm === 'status' ? 'change the status of' : 'update'} the student account.`
      );
      setConfirming(false);
      return;
    }
    setToast(
      confirm === 'status'
        ? `Student account ${editing.status === 'DISABLED' ? 'reactivated' : 'disabled'} successfully.`
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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {years.map((year) => (
              <button
                key={year}
                onClick={() => setYearLevel(String(year))}
                className="rounded-[14px] border border-border bg-surface p-4 text-left sm:p-6 shadow-card transition hover:border-brand"
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
      {program && yearLevel && role === 'dean' && !section && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setYearLevel(undefined)}
              className="inline-flex items-center gap-1 font-body text-sm font-medium text-brand"
            >
              <ArrowLeft size={16} /> Year levels
            </button>
            <button
              onClick={() => setShowSectionModal(true)}
              className="rounded-[10px] bg-brand px-3 py-2 font-body text-sm font-semibold text-white"
            >
              <Plus size={15} className="mr-1 inline" /> Create new section
            </button>
          </div>
          <h2 className="mb-1 font-head text-xl font-bold text-text-1">
            {program} · {yearLevel}
            {suffix(Number(yearLevel))} Year Sections
          </h2>
          <p className="mb-6 font-body text-sm text-text-3">
            Select a section to view and manage its students.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {sections.map((item) => (
              <div
                key={item.id}
                className="relative rounded-[14px] border border-border bg-surface shadow-card transition hover:border-brand"
              >
                <button
                  onClick={() => setSection(item)}
                  className="w-full p-6 pr-20 text-left"
                >
                  <span className="font-head text-2xl font-bold text-brand">
                    {item.name}
                  </span>
                  <p className="mt-2 font-body text-sm text-text-3">
                    {item._count.students}{' '}
                    {item._count.students === 1 ? 'student' : 'students'}
                  </p>
                </button>
                <div className="absolute right-3 top-3 flex gap-1">
                  <button
                    aria-label={`Edit section ${item.name}`}
                    title="Edit section"
                    onClick={() => {
                      setEditingSection(item);
                      setSectionName(item.name);
                    }}
                    className="rounded-lg p-2 text-brand hover:bg-brand-soft"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label={`Delete section ${item.name}`}
                    title="Delete section"
                    onClick={() => setDeletingSection(item)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {sectionsLoading && (
            <p className="mt-5 text-sm text-text-3">Loading sections…</p>
          )}
          {!sectionsLoading && sections.length === 0 && (
            <p className="mt-5 text-sm text-text-3">
              No sections have been created yet.
            </p>
          )}
        </>
      )}
      {program && yearLevel && (role !== 'dean' || section) && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() =>
                role === 'dean'
                  ? setSection(undefined)
                  : setYearLevel(undefined)
              }
              className="inline-flex items-center gap-1 font-body text-sm font-medium text-brand"
            >
              <ArrowLeft size={16} />{' '}
              {role === 'dean' ? 'Sections' : 'Year levels'}
            </button>
            {role === 'dean' && (
              <div className="flex gap-2">
                <button
                  disabled={rows.length === 0}
                  onClick={openPromotion}
                  className="rounded-[10px] border border-border px-3 py-2 font-body text-sm font-medium text-text-2 hover:bg-brand-soft disabled:opacity-50"
                >
                  <GraduationCap size={15} className="mr-1 inline" /> Promote
                  section
                </button>
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
                title={`${program} · ${yearLevel}${suffix(Number(yearLevel))} Year${
                  section ? ` - Section ${section.name}` : ''
                }`}
                subtitle={`Student accounts filtered by program, year level${
                  section ? ' and their section' : ''
                }`}
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
                      'Profile',
                      'Full Name',
                      'Program',
                      'Email',
                      'Status',
                      ...(role === 'teacher' ? ['Assessment Status'] : []),
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
                      <td className="px-5 py-4">
                        {student.profilePicture ? (
                          <img alt=""
                            src={assetSrc(student.profilePicture)}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                            {student.fullName[0]}
                          </span>
                        )}
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
                      {role === 'teacher' && (
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              student.assessmentStatus === 'TAKEN'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {student.assessmentStatus === 'TAKEN'
                              ? 'Exam/Quiz Taken'
                              : 'Exam/Quiz Not yet taken'}
                          </span>
                        </td>
                      )}
                      <td className="px-5 py-4 text-text-2">
                        {formatCreatedAt(student.createdAt)}
                      </td>
                      {role === 'dean' && (
                        <td className="px-5 py-4">
                          <button
                            className="mr-3 text-brand"
                            title="Transfer student"
                            aria-label={'Transfer ' + student.fullName}
                            onClick={() => openTransfer(student)}
                          >
                            <ArrowRightLeft size={16} />
                          </button>
                          <button
                            className="text-brand"
                            onClick={() => {
                              setEditing(student);
                              setEditForm({
                                fullName: student.fullName,
                                email: student.email ?? '',
                                newPassword: '',
                                profilePicture: student.profilePicture ?? '',
                              });
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          {student.status !== 'PENDING' && (
                            <button
                              className="ml-3 text-red-500"
                              aria-label={`${student.status === 'DISABLED' ? 'Reactivate' : 'Disable'} ${student.fullName}`}
                              onClick={() => {
                                setEditing(student);
                                setConfirm('status');
                              }}
                            >
                              {student.status === 'DISABLED' ? (
                                <Power size={16} />
                              ) : (
                                <PowerOff size={16} />
                              )}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {!loading && filteredRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-10 text-center text-text-3"
                      >
                        No students found in this section.
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
      {placement && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={savePlacement}
            className="w-full max-w-md rounded-[16px] bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-head text-xl font-bold text-text-1">
                  {placement.mode === 'transfer'
                    ? 'Transfer student'
                    : 'Promote section'}
                </h2>
                <p className="mt-1 text-sm text-text-3">
                  {placement.mode === 'transfer'
                    ? 'Move ' +
                      placement.student?.fullName +
                      ' to another program, year, or section.'
                    : 'Move every student in Section ' +
                      section?.name +
                      ' to the selected target section.'}
                </p>
              </div>
              <button type="button" onClick={() => setPlacement(undefined)}>
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-sm text-text-2">
                Program
                <select
                  value={placementProgram}
                  onChange={(event) =>
                    setPlacementProgram(event.target.value)
                  }
                  className="mt-1 w-full rounded border border-border bg-surface p-2"
                >
                  <option value="CS">CS</option>
                  <option value="IT">IT</option>
                </select>
              </label>
              <label className="text-sm text-text-2">
                Year level
                <select
                  value={placementYear}
                  onChange={(event) => setPlacementYear(event.target.value)}
                  className="mt-1 w-full rounded border border-border bg-surface p-2"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                      {suffix(year)} Year
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm text-text-2">
              Target section
              <select
                required
                value={placementSectionId}
                onChange={(event) =>
                  setPlacementSectionId(event.target.value)
                }
                className="mt-1 w-full rounded border border-border bg-surface p-2"
              >
                <option value="">Select a section</option>
                {placementSections
                  .filter((item) => item.id !== section?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item._count.students} students)
                    </option>
                  ))}
              </select>
            </label>
            {placement.mode === 'promote' && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                This updates the program, year level, and section for all
                students currently in this section. Account and assessment
                history will be preserved.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={placementPending}
                onClick={() => setPlacement(undefined)}
                className="px-4 py-2 text-sm text-text-2"
              >
                Cancel
              </button>
              <button
                disabled={placementPending || !placementSectionId}
                className="rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {placementPending
                  ? 'Updating...'
                  : placement.mode === 'transfer'
                    ? 'Transfer Student'
                    : 'Promote Students'}
              </button>
            </div>
          </form>
        </div>
      )}
      {showSectionModal && program && yearLevel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={createSection}
            className="w-full max-w-md rounded-[16px] bg-surface p-6 shadow-2xl"
          >
            <h2 className="font-head text-xl font-bold text-text-1">
              Create new section
            </h2>
            <p className="mt-1 text-sm text-text-3">
              Add a section for {program} · {yearLevel}
              {suffix(Number(yearLevel))} Year.
            </p>
            <label className="mt-5 block text-sm text-text-2">
              Section name
              <input
                autoFocus
                required
                maxLength={30}
                value={sectionName}
                onChange={(event) => setSectionName(event.target.value)}
                className="mt-1 w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-text-1 outline-none focus:border-brand"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSectionModal(false);
                  setSectionName('');
                }}
                className="px-4 py-2 text-sm text-text-2"
              >
                Cancel
              </button>
              <button
                disabled={creatingSection}
                className="rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {creatingSection ? 'Adding…' : 'Add Section'}
              </button>
            </div>
          </form>
        </div>
      )}
      {editingSection && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={updateSection}
            className="w-full max-w-md rounded-[16px] bg-surface p-6 shadow-2xl"
          >
            <h2 className="font-head text-xl font-bold text-text-1">
              Edit section
            </h2>
            <p className="mt-1 text-sm text-text-3">
              Rename section {editingSection.name}.
            </p>
            <label className="mt-5 block text-sm text-text-2">
              Section name
              <input
                autoFocus
                required
                maxLength={30}
                value={sectionName}
                onChange={(event) => setSectionName(event.target.value)}
                className="mt-1 w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-text-1 outline-none focus:border-brand"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={sectionActionPending}
                onClick={() => {
                  setEditingSection(undefined);
                  setSectionName('');
                }}
                className="px-4 py-2 text-sm text-text-2"
              >
                Cancel
              </button>
              <button
                disabled={sectionActionPending}
                className="rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sectionActionPending ? 'Savingâ€¦' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
      {deletingSection && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-[16px] bg-surface p-6 shadow-2xl">
            <h2 className="font-head text-xl font-bold text-text-1">
              Delete section
            </h2>
            <p className="mt-2 text-sm text-text-3">
              Are you sure you want to delete section{' '}
              <b>{deletingSection.name}</b>? Its{' '}
              {deletingSection._count.students}{' '}
              {deletingSection._count.students === 1 ? 'student' : 'students'}{' '}
              will be preserved but left unassigned. This action cannot be
              undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={sectionActionPending}
                onClick={() => setDeletingSection(undefined)}
                className="px-4 py-2 text-sm text-text-2"
              >
                Cancel
              </button>
              <button
                disabled={sectionActionPending}
                onClick={() => void deleteSection()}
                className="rounded-[9px] bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sectionActionPending ? 'Deletingâ€¦' : 'Delete section'}
              </button>
            </div>
          </div>
        </div>
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
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-text-2">
                  Profile Picture (optional)
                </span>
                {form.profilePicture && (
                  <img alt="Profile picture preview"
                    src={assetSrc(form.profilePicture)}
                    className="mb-2 h-16 w-16 rounded-full object-cover"
                  />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file || file.size > 2_000_000) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setForm({
                        ...form,
                        profilePicture: String(reader.result),
                      });
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
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
      {createdCredentials && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-[16px] bg-surface p-6 shadow-2xl">
            <h2 className="font-head text-xl font-bold text-text-1">
              Student temporary credentials
            </h2>
            <p className="mt-2 text-sm text-text-3">
              Give these credentials directly to the student. They will verify
              the emailed activation code and must choose a new password before
              entering the portal.
            </p>
            <dl className="mt-5 space-y-3 rounded-xl bg-surface-2 p-4">
              <div>
                <dt className="text-xs text-text-3">Student ID</dt>
                <dd className="font-mono font-semibold text-text-1">
                  {createdCredentials.studentId}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-3">Temporary password</dt>
                <dd className="font-mono font-semibold text-text-1">
                  {createdCredentials.initialPassword}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setCreatedCredentials(undefined)}
                className="rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                I have saved the credentials
              </button>
            </div>
          </div>
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
            <label className="mt-3 block text-sm text-text-2">
              Change password (optional)
              <input
                type="password"
                value={editForm.newPassword}
                onChange={(e) =>
                  setEditForm({ ...editForm, newPassword: e.target.value })
                }
                className="mt-1 w-full rounded-[9px] border border-border px-3 py-2 text-text-1"
              />
            </label>
            <label className="mt-3 block text-sm text-text-2">
              Profile Picture (optional)
              {editForm.profilePicture && (
                <img alt="Profile picture preview"
                  src={assetSrc(editForm.profilePicture)}
                  className="my-2 h-20 w-20 rounded-full object-cover"
                />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file || file.size > 2_000_000) return;
                  const reader = new FileReader();
                  reader.onload = () =>
                    setEditForm({
                      ...editForm,
                      profilePicture: String(reader.result),
                    });
                  reader.readAsDataURL(file);
                }}
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
              Confirm {confirm === 'status' ? 'status change' : 'changes'}
            </h2>
            <p className="mt-2 text-sm text-text-3">
              {confirm === 'status'
                ? `${editing.status === 'DISABLED' ? 'Reactivate' : 'Disable'} ${editing.fullName}'s account? Their academic records will be preserved.`
                : `Save the changes to ${editing.fullName}'s account?`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setConfirm(null);
                  if (confirm === 'status') setEditing(null);
                }}
                className="px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={confirming}
                onClick={() => void confirmAction()}
                className={
                  confirm === 'status' && editing.status !== 'DISABLED'
                    ? 'rounded-[9px] bg-red-600 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-[9px] bg-brand px-4 py-2 text-sm font-semibold text-white'
                }
              >
                {confirming
                  ? 'Working…'
                  : confirm === 'status'
                    ? editing.status === 'DISABLED'
                      ? 'Reactivate account'
                      : 'Disable account'
                    : 'Confirm save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
