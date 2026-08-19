import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { Role, type LoginResponse } from "../types";
type PendingActivationResponse = { activationRequired: true };
const schema = z.object({
  loginId: z.string().min(1, "Enter your Student ID or school email."),
  password: z.string().min(1, "Enter your password."),
});
const destination: Record<Role, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  DEAN: "/dean",
};
export function SignInModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [activation, setActivation] = useState<{ loginId: string } | null>(null);
  const [otp, setOtp] = useState("");
  const { setAuth } = useAuthStore();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  const submit = async (values: z.infer<typeof schema>) => {
    setError("");
    try {
      const { data } = await api.post<LoginResponse | PendingActivationResponse>("/auth/login", values);
      if ("activationRequired" in data) {
        setActivation({ loginId: values.loginId });
        return;
      }
      setAuth(data.user);
      onClose();
      navigate(
        data.user.mustChangePassword
          ? "/change-password"
          : destination[data.user.role],
      );
    } catch {
      setError(
        "We couldn’t sign you in. Check your credentials and try again.",
      );
    }
  };
  const verifyActivation = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const { data } = await api.post("/auth/verify-activation", { loginId: activation?.loginId, code: otp });
      setAuth(data.user); onClose(); navigate("/change-password");
    } catch { setError("The activation code is invalid or expired."); }
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        aria-label="Close sign in"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0f172a]/90 p-7 shadow-[0_0_80px_rgba(59,130,246,.18)] outline-none"
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-5 top-5 text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>
        <p className="font-mono text-[.68rem] tracking-[.15em] text-blue-400">
          // SECURE ACCESS
        </p>
        <h2
          id="signin-title"
          className="mt-2 font-[var(--font-heading)] text-3xl font-bold text-slate-50"
        >
          Sign in to ProctorX
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Students use their Student ID. Teachers and Deans use their school
          email.
        </p>
        {activation ? <form className="mt-7 space-y-4" onSubmit={verifyActivation}>
          <p className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-3 text-sm text-blue-100">Enter the 6-digit activation code sent to your registered email address.</p>
          <label className="block text-sm font-medium text-slate-200">Activation code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-blue-400/60" /></label>
          {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          <button className="btn-primary w-full rounded-xl py-3 font-semibold text-white">Verify and continue</button>
          <button type="button" className="w-full text-sm text-blue-300" onClick={() => { setActivation(null); setOtp(""); }}>Back to sign in</button>
        </form> : <form className="mt-7 space-y-4" onSubmit={handleSubmit(submit)}>
          <label className="block text-sm font-medium text-slate-200">
            Student ID or school email
            <input
              autoComplete="username"
              {...register("loginId")}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder="e.g. 2026-0001 or name@school.edu"
            />
          </label>
          {errors.loginId && (
            <p className="text-xs text-red-300">{errors.loginId.message}</p>
          )}
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              autoComplete="current-password"
              type="password"
              {...register("password")}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          {errors.password && (
            <p className="text-xs text-red-300">{errors.password.message}</p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200"
            >
              {error}
            </p>
          )}
          <button
            disabled={isSubmitting}
            className="btn-primary w-full rounded-xl py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? "Signing in…" : "Sign In"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-blue-300 opacity-70"
            disabled
          >
            Forgot password?
          </button>
        </form>}
      </div>
    </div>
  );
}
