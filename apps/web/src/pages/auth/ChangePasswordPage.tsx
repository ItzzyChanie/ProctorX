import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(6, 'Use at least 6 characters.')
      .regex(/\d/, 'Include a number.')
      .regex(/[^A-Za-z0-9]/, 'Include a symbol.'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match.',
  });
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { updateUser, user } = useAuthStore();
  const [visiblePasswords, setVisiblePasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirm: false,
  });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const newPassword = watch('newPassword', '');
  const passwordRequirements = [
    { label: 'At least 6 characters', met: newPassword.length >= 6 },
    { label: 'At least one number', met: /\d/.test(newPassword) },
    {
      label: 'At least one special character',
      met: /[^A-Za-z0-9]/.test(newPassword),
    },
  ];
  const submit = async ({
    currentPassword,
    newPassword,
  }: z.infer<typeof schema>) => {
    const { data } = await api.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    updateUser(data);
    navigate(`/${data.role.toLowerCase()}`);
  };
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090b16] p-6 text-white">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 15%, #4f46e5 0, transparent 26%), radial-gradient(circle at 84% 82%, #0ea5b7 0, transparent 24%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <form
        onSubmit={handleSubmit(submit)}
        className="glass-card relative w-full max-w-md rounded-[24px] p-8 shadow-[0_24px_80px_rgba(0,0,0,.35)]"
      >
        <p className="font-mono text-[11px] tracking-[0.16em] text-blue-300">
          // REQUIRED SECURITY STEP
        </p>
        <h1 className="mt-2 font-head text-3xl font-bold tracking-tight">
          Set your password
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Welcome, {user?.fullName}. Create a password only you know.
        </p>
        {(['currentPassword', 'newPassword', 'confirm'] as const).map(
          (field) => (
            <div
              key={field}
              className="mt-5 block text-sm capitalize text-slate-200"
            >
              {field.replace(/([A-Z])/g, ' $1')}
              <div className="relative mt-2">
                <input
                  id={field}
                  aria-label={
                    field === 'currentPassword'
                      ? 'Current password'
                      : field === 'newPassword'
                        ? 'New password'
                        : 'Confirm password'
                  }
                  type={visiblePasswords[field] ? 'text' : 'password'}
                  {...register(field)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 pr-12 text-white outline-none transition focus:border-blue-400/60 focus:ring-4 focus:ring-blue-400/10"
                />
                <button
                  type="button"
                  onClick={() =>
                    setVisiblePasswords((current) => ({
                      ...current,
                      [field]: !current[field],
                    }))
                  }
                  aria-label={
                    visiblePasswords[field]
                      ? 'Hide ' +
                        (field === 'currentPassword'
                          ? 'current password'
                          : field === 'newPassword'
                            ? 'new password'
                            : 'confirm password')
                      : 'Show ' +
                        (field === 'currentPassword'
                          ? 'current password'
                          : field === 'newPassword'
                            ? 'new password'
                            : 'confirm password')
                  }
                  aria-pressed={visiblePasswords[field]}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 transition hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
                >
                  {visiblePasswords[field] ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
              {errors[field] && (
                <span className="mt-1 block text-xs text-red-300">
                  {errors[field].message}
                </span>
              )}
              {field === 'newPassword' && (
                <div
                  className="mt-3 grid gap-2"
                  aria-label="Password requirements"
                >
                  {passwordRequirements.map((requirement) => (
                    <div
                      key={requirement.label}
                      className={
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ' +
                        (requirement.met
                          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                          : 'border-white/10 bg-white/[0.03] text-slate-500')
                      }
                    >
                      <span
                        className={
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ' +
                          (requirement.met
                            ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                            : 'border-slate-600')
                        }
                        aria-hidden="true"
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {requirement.label}
                      <span className="sr-only">
                        {requirement.met
                          ? ' requirement met'
                          : ' requirement not met'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        <button
          disabled={isSubmitting}
          className="btn-primary mt-7 w-full rounded-xl py-3 font-semibold shadow-glow"
        >
          {isSubmitting ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </main>
  );
}
