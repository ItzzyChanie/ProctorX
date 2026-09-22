import { useEffect, useMemo, useState } from 'react';
import type { User } from '@proctorx/shared-types';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';

export function ProfileFieldsEditor({
  role,
}: {
  role: 'dean' | 'teacher' | 'student';
}) {
  const { user, updateUser } = useAuthStore();
  const saved = useMemo(
    () =>
      role === 'teacher' || role === 'dean'
        ? {
            fullName: user?.fullName ?? '',
            employeeId: user?.employeeId ?? '',
            office: user?.office ?? '',
            email: user?.email ?? '',
          }
        : {
            fullName: user?.fullName ?? '',
            studentId: user?.studentId ?? '',
            program: user?.program ?? '',
            email: user?.email ?? '',
          },
    [
      role,
      user?.fullName,
      user?.employeeId,
      user?.office,
      user?.studentId,
      user?.program,
      user?.email,
    ]
  );
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  useEffect(() => setForm(saved), [saved]);
  const dirty = (Object.keys(saved) as (keyof typeof saved)[]).some(
    (key) => form[key] !== saved[key]
  );
  const labels: Record<string, string> = {
    fullName: 'Full name',
    employeeId: 'Employee ID',
    office: 'Department',
    studentId: 'Student number',
    program: 'Program',
    email: 'Email',
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.patch<User>('/auth/profile', form);
      updateUser(data);
      setMessage('Profile updated successfully.');
      setMessageError(false);
    } catch {
      setMessage(
        'Could not update profile. Check that the ID and email are unique.'
      );
      setMessageError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-3">
      {Object.keys(form).map((key) => (
        <label key={key} className="block">
          <span className="mb-1 block text-[11.5px] text-text-3">
            {labels[key]}
          </span>
          <input
            type={key === 'email' ? 'email' : 'text'}
            required={key === 'fullName' || key === 'email'}
            readOnly={
              key === 'email' ||
              (role === 'student' &&
                (key === 'studentId' || key === 'program')) ||
              (role === 'teacher' && key === 'office') ||
              (key === 'employeeId' && (role === 'teacher' || role === 'dean'))
            }
            value={form[key as keyof typeof form]}
            onChange={(event) =>
              setForm({ ...form, [key]: event.target.value })
            }
            className={`w-full rounded-[9px] border border-border px-3 py-2.5 text-[13.5px] text-text-1 outline-none focus:border-brand ${
              key === 'email' ||
              key === 'employeeId' ||
              (role === 'teacher' && key === 'office') ||
              (role === 'student' && (key === 'studentId' || key === 'program'))
                ? 'cursor-not-allowed bg-slate-100 opacity-75 dark:bg-slate-800'
                : 'bg-canvas'
            }`}
          />
        </label>
      ))}
      {(dirty || message) && (
        <div className="flex items-center gap-3 pt-1">
          {dirty && (
            <Button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
          )}
          {message && (
            <span
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                messageError
                  ? 'bg-red-100 text-red-700'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {message}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
