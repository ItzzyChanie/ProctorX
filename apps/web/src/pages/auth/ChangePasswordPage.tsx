import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { updateUser, user } = useAuthStore();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const submit = async ({
    currentPassword,
    newPassword,
  }: z.infer<typeof schema>) => {
    const { data } = await api.post("/auth/change-password", {
      currentPassword,
      newPassword,
    });
    updateUser(data);
    navigate(`/${data.role.toLowerCase()}`);
  };
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090b16] p-6 text-white">
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 18% 15%, #4f46e5 0, transparent 26%), radial-gradient(circle at 84% 82%, #0ea5b7 0, transparent 24%)" }} />
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <form
        onSubmit={handleSubmit(submit)}
        className="glass-card relative w-full max-w-md rounded-[24px] p-8 shadow-[0_24px_80px_rgba(0,0,0,.35)]"
      >
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient font-head text-lg font-bold shadow-glow">P</div>
        <p className="font-mono text-[11px] tracking-[0.16em] text-blue-300">
          // REQUIRED SECURITY STEP
        </p>
        <h1 className="mt-2 font-head text-3xl font-bold tracking-tight">
          Set your password
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Welcome, {user?.fullName}. Create a password only you know.
        </p>
        {(["currentPassword", "newPassword", "confirm"] as const).map(
          (field) => (
            <label
              key={field}
              className="mt-5 block text-sm capitalize text-slate-200"
            >
              {field.replace(/([A-Z])/g, " $1")}
              <input
                type="password"
                {...register(field)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-blue-400/60 focus:ring-4 focus:ring-blue-400/10"
              />
              {errors[field] && (
                <span className="mt-1 block text-xs text-red-300">
                  {errors[field].message}
                </span>
              )}
            </label>
          ),
        )}
        <button
          disabled={isSubmitting}
          className="btn-primary mt-7 w-full rounded-xl py-3 font-semibold shadow-glow"
        >
          {isSubmitting ? "Saving…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
