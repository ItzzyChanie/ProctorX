import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { Role, type LoginResponse } from "../types";
import { useQueryClient } from "@tanstack/react-query";
type PendingActivationResponse = { activationRequired: true };
const schema = z.object({
  loginId: z.string().trim().min(1, "Enter your ID or institutional email.").max(320),
  password: z.string().min(1, "Enter your password."),
});
const otpSchema = z.object({ loginId: z.string().trim().min(1).max(320), code: z.string().regex(/^\d{6}$/, "Enter the six-digit activation code.") });
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
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [activation, setActivation] = useState<{ loginId: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      queryClient.clear();
      setAuth(data.user);
      onClose();
      navigate(
        data.user.mustChangePassword
          ? "/change-password"
          : destination[data.user.role],
      );
    }
    catch (error: any) {
      setError(
        error?.response?.status === 409
          ? "This student account is already active on another browser or device. The existing session was kept active and notified."
          : "We couldn’t sign you in. Check your credentials and try again.",
      );
    }
  };

  const verifyActivation = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    const parsed = otpSchema.safeParse({ loginId: activation?.loginId, code: otp });

    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Enter a valid activation code."); return; }

    try {
      const { data } = await api.post("/auth/verify-activation", parsed.data);
      queryClient.clear(); setAuth(data.user); onClose(); navigate("/change-password");
    }
    catch { setError("The activation code is invalid or expired."); }
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        aria-label="Close sign in"
        className="absolute inset-0 bg-slate-950/70"
        onClick={onClose}
      />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 font-body text-slate-900 shadow-2xl outline-none"
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={20} />
        </button>
        <h2
          id="signin-title"
          className="pr-8 font-head text-3xl font-semibold tracking-tight text-slate-950"
        >
          Sign in to ProctorX
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Students use their Student ID. Teachers and Deans can use their
          Employee ID or institutional email.
        </p>
        {activation ? <form className="mt-7 space-y-4" onSubmit={verifyActivation}>
          <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">Enter the 6-digit activation code sent to your registered email address.</p>
          <label className="block text-sm font-medium text-slate-700">Activation code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10" /></label>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 py-3 font-semibold text-white hover:from-blue-700 hover:to-sky-600">Verify and continue</button>
          <button type="button" className="w-full text-sm text-blue-600" onClick={() => { setActivation(null); setOtp(""); }}>Back to sign in</button>
        </form> : <form className="mt-7 space-y-4" onSubmit={handleSubmit(submit)}>
          <label className="block text-sm font-medium text-slate-700">
            Student ID, Employee ID, or institutional email
            <input
              autoComplete="username"
              {...register("loginId")}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              placeholder="e.g. 2026-0001 or name@school.edu"
            />
          </label>
          {errors.loginId && (
            <p className="text-xs text-red-300">{errors.loginId.message}</p>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Password
            <span className="relative mt-2 block"><input
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              {...register("password")}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-slate-950 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
            /><button type="button" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 transition-colors hover:text-blue-600" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
          </label>
          {errors.password && (
            <p className="text-xs text-red-300">{errors.password.message}</p>
          )}
          {error && (
            <p
              role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <button
            disabled={isSubmitting}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 py-3 font-body font-semibold text-white shadow-sm transition-colors hover:from-blue-700 hover:to-sky-600 disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? "Signing in…" : "Sign In"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-slate-400"
            disabled
          >
            Forgot password?
          </button>
        </form>}
      </div>
    </div>
  );
}
