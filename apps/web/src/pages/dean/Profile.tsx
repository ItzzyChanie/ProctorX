import { useEffect, useState } from "react"
import { KeyRound, ShieldCheck } from "lucide-react"
import type { User } from "@proctorx/shared-types"
import { DashboardLayout } from "../../components/layout/DashboardLayout"
import { ProfilePictureEditor } from "../../components/ProfilePictureEditor"
import { Card, CardHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { api } from "../../lib/api"
import { useAuthStore } from "../../store/authStore"

export default function DeanProfile() {
  const { user, updateUser } = useAuthStore()
  const [form, setForm] = useState({
    fullName: "",
    employeeId: "",
    office: "",
    email: "",
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [messageError, setMessageError] = useState(false)

  useEffect(
    () =>
      setForm({
        fullName: user?.fullName ?? "",
        employeeId: user?.employeeId ?? "",
        office: user?.office ?? "",
        email: user?.email ?? "",
      }),
    [user?.fullName, user?.employeeId, user?.office, user?.email],
  )

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { data } = await api.patch<User>("/auth/profile", form)
      updateUser(data)
      setMessage("Profile updated successfully.")
      setMessageError(false)
    } catch {
      setMessage(
        "Could not update profile. Check that the email and employee ID are unique.",
      )
      setMessageError(true)
    } finally {
      setBusy(false)
    }
  }
  const saved = {
    fullName: user?.fullName ?? "",
    employeeId: user?.employeeId ?? "",
    office: user?.office ?? "",
    email: user?.email ?? "",
  }
  const dirty = (Object.keys(saved) as (keyof typeof saved)[]).some(
    (key) => form[key] !== saved[key],
  )

  return (
    <DashboardLayout role="dean" pageTitle="Profile & Settings">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <ProfilePictureEditor />
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-text-3">Institution</span>
              <input readOnly value={user?.institutionName ?? ""} className="w-full cursor-not-allowed rounded-[9px] border border-border bg-slate-100 px-3 py-2.5 text-[13.5px] text-text-1 opacity-75 dark:bg-slate-800" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-text-3">Official title or position</span>
              <input readOnly value={user?.officialTitle ?? ""} className="w-full cursor-not-allowed rounded-[9px] border border-border bg-slate-100 px-3 py-2.5 text-[13.5px] text-text-1 opacity-75 dark:bg-slate-800" />
            </label>
          </div>
          <form onSubmit={save} className="space-y-3">
            {([
              ["fullName", "Full name", "text"],
              ["employeeId", "Employee ID", "text"],
              ["office", "Department", "text"],
              ["email", "Email", "email"],
            ] as const).map(([key, label, type]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-[11.5px] text-text-3">
                  {label}
                </span>
                <input
                  required={key === "fullName" || key === "email"}
                  readOnly={key === "employeeId" || key === "email"}
                  type={type}
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                  className={`w-full rounded-[9px] border border-border px-3 py-2.5 text-[13.5px] text-text-1 outline-none focus:border-brand ${
                    key === "employeeId" || key === "email"
                      ? "cursor-not-allowed bg-slate-100 opacity-75 dark:bg-slate-800"
                      : "bg-canvas"
                  }`}
                />
              </label>
            ))}
            {(dirty || message) && <div className="flex items-center gap-3 pt-1">
              {dirty && <Button disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </Button>}
              {message && (
                <span className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  messageError
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-800"
                }`}>{message}</span>
              )}
            </div>}
          </form>
        </Card>
        <Card>
          <CardHeader title="Access controls" />
          <div className="mb-3.5 flex items-center gap-3 rounded-[10px] bg-brand-soft p-3.5">
            <ShieldCheck size={20} className="text-brand" />
            <div>
              <div className="text-[13px] font-semibold text-text-1">
                Full administrative access
              </div>
              <div className="text-[11.5px] text-text-2">
                Analytics, departments, reports, audit logs, and security
                settings are enabled.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-[10px] bg-canvas p-3.5">
            <KeyRound size={18} className="text-risk-low" />
            <div className="text-xs leading-relaxed text-text-2">
              Sensitive review and security functions are protected by
              role-based controls and audit logging.
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  )
}
