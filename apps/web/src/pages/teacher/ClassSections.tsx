import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers3, Plus, Search, Trash2, Users } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

type Section = {
  id: string;
  name: string;
  program: string;
  yearLevel: string;
  _count: { students: number };
};
type Subject = {
  id: string;
  subjectCode: string;
  name: string;
  schedule?: string;
  sectionAssignments: { section: Section }[];
  _count: { enrollments: number };
};
type Overview = { subjects: Subject[]; sections: Section[] };

export default function ClassSections() {
  const client = useQueryClient();
  const [subjectId, setSubjectId] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Section | null>(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Section | null>(null);
  const [enroll, setEnroll] = useState(true);
  const [search, setSearch] = useState('');
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [toast, setToast] = useState<{ message: string; error?: boolean }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['section-assignments'],
    queryFn: async () =>
      (await api.get<Overview>('/subjects/section-assignments/overview')).data,
  });
  const activeId = subjectId || data?.subjects[0]?.id || '';
  const subject = data?.subjects.find((x) => x.id === activeId);
  const chosenSubjects = data?.subjects.filter((x) =>
    selectedSubjectIds.includes(x.id)
  );
  const available = useMemo(
    () =>
      (data?.sections ?? []).filter(
        (x) =>
          !chosenSubjects?.every((chosen) =>
            chosen.sectionAssignments.some(
              (assignment) => assignment.section.id === x.id
            )
          ) &&
          (!program || x.program === program) &&
          (!year || x.yearLevel === year) &&
          `${x.name} ${x.program}`.toLowerCase().includes(search.toLowerCase())
      ),
    [data, chosenSubjects, program, year, search]
  );
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(undefined), 3500);
  };
  const assign = useMutation({
    mutationFn: async () =>
      Promise.all(
        selectedSubjectIds.map((id) =>
          api.post(`/subjects/${id}/sections`, {
            sectionId: selected?.id,
            enrollCurrentStudents: enroll,
          })
        )
      ),
    onSuccess: (responses) => {
      client.invalidateQueries({ queryKey: ['section-assignments'] });
      selectedSubjectIds.forEach((id) => {
        client.invalidateQueries({ queryKey: ['student-rosters', id] });
        client.invalidateQueries({ queryKey: ['classes-subject-roster', id] });
      });
      setAdding(false);
      setSelected(null);
      setSelectedSubjectIds([]);
      notify(
        `Section assigned to ${responses.length} subject(s). ${responses.reduce((total, response) => total + response.data.enrolledCount, 0)} enrollment(s) processed.`
      );
    },
    onError: () => notify('Could not assign the section.', true),
  });
  const remove = useMutation({
    mutationFn: () =>
      api.delete(`/subjects/${activeId}/sections/${removing?.id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['section-assignments'] });
      setRemoving(null);
      notify('Section assignment removed successfully.');
    },
    onError: () => notify('Could not remove the section assignment.', true),
  });
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Class Sections"
      userName="Professor"
      userTag="College of Computer Studies"
    >
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Class Sections"
            subtitle="Connect official dean-managed sections to each subject you handle."
          />
          {isLoading ? (
            <p className="text-sm text-text-2">Loading sections…</p>
          ) : isError ? (
            <p className="text-sm text-risk-high">
              Could not load class sections.
            </p>
          ) : !data?.subjects.length ? (
            <p className="text-sm text-text-2">
              Create a subject first in My Subjects & Exams.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[280px] flex-1 text-xs font-semibold text-text-2">
                Subject
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
                  value={activeId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  {data.subjects.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.subjectCode} — {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                icon={Plus}
                onClick={() => {
                  setSelectedSubjectIds([activeId]);
                  setAdding(true);
                }}
              >
                Assign section
              </Button>
            </div>
          )}
        </Card>
        {subject && (
          <Card>
            <CardHeader
              title={`${subject.subjectCode} assigned sections`}
              subtitle={`${subject._count.enrollments} enrolled student(s). Assigning a section does not restrict the teacher to one year level.`}
            />
            {!subject.sectionAssignments.length ? (
              <p className="text-sm text-text-2">No sections assigned yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {subject.sectionAssignments.map(({ section }) => (
                  <div
                    key={section.id}
                    className="rounded-xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">
                          Section {section.name}
                        </div>
                        <div className="mt-1 text-sm text-text-2">
                          {section.program} · {section.yearLevel} Year
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs text-text-2">
                          <Users size={14} />
                          {section._count.students} official student(s)
                        </div>
                      </div>
                      <button
                        onClick={() => setRemoving(section)}
                        className="rounded-lg p-2 text-risk-high hover:bg-red-50"
                        aria-label={`Remove section ${section.name}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
      {adding && (
        <Modal
          title="Assign a class section"
          onClose={() => {
            setAdding(false);
            setSelected(null);
            setSelectedSubjectIds([]);
          }}
        >
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-semibold">
              Assign to subject(s)
            </legend>
            <div className="max-h-36 space-y-2 overflow-auto rounded-lg border border-border p-3">
              {data?.subjects.map((item) => (
                <label key={item.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedSubjectIds.includes(item.id)}
                    onChange={(event) =>
                      setSelectedSubjectIds((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id)
                      )
                    }
                  />
                  <span>
                    <b>{item.subjectCode}</b> — {item.name}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-text-2">
              Select one or several subjects handled by this professor.
            </p>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <input
              aria-label="Search sections"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search section"
              className="col-span-2 rounded-lg border border-border px-3 py-2"
            />
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              className="rounded-lg border border-border px-3 py-2"
            >
              <option value="">All programs</option>
              <option>CS</option>
              <option>IT</option>
            </select>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-lg border border-border px-3 py-2"
            >
              <option value="">All years</option>
              {['1st', '2nd', '3rd', '4th'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-auto">
            {available.map((x) => (
              <button
                key={x.id}
                onClick={() => setSelected(x)}
                className={`flex w-full justify-between rounded-lg border p-3 text-left ${selected?.id === x.id ? 'border-brand bg-brand-soft' : 'border-border'}`}
              >
                <span>
                  <b>Section {x.name}</b>
                  <span className="block text-xs text-text-2">
                    {x.program} · {x.yearLevel} Year
                  </span>
                </span>
                <span className="text-xs text-text-2">
                  {x._count.students} students
                </span>
              </button>
            ))}
            {!available.length && (
              <p className="py-4 text-center text-sm text-text-2">
                No available sections match.
              </p>
            )}
          </div>
          <label className="mt-4 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={enroll}
              onChange={(e) => setEnroll(e.target.checked)}
            />{' '}
            Enroll all current students in the selected section
          </label>
          <p className="mt-2 text-xs text-text-2">
            Future students added to the section are not automatically enrolled;
            this prevents unintended subject access.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setSelectedSubjectIds([]);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !selected || !selectedSubjectIds.length || assign.isPending
              }
              onClick={() => assign.mutate()}
            >
              Assign to {selectedSubjectIds.length || 0} subject(s)
            </Button>
          </div>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Remove section assignment?"
          onClose={() => setRemoving(null)}
        >
          <p className="text-sm text-text-2">
            Section {removing.name} will be detached from this subject. Existing
            student enrollments, exam sessions, and history will remain.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button onClick={() => remove.mutate()} disabled={remove.isPending}>
              Remove assignment
            </Button>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-[80] rounded-lg px-4 py-3 text-sm text-white ${toast.error ? 'bg-red-600' : 'bg-emerald-600'}`}
        >
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl rounded-2xl bg-surface p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Layers3 size={19} className="text-brand" />
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
