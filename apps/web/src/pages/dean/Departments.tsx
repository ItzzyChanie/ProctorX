import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react"
import axios from "axios"
import { DashboardLayout } from "../../components/layout/DashboardLayout"
import { Card, CardHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { api } from "../../lib/api"
import { useAuthStore } from "../../store/authStore"
import type { User } from "@proctorx/shared-types"

type Faculty = {
  userId: string
  employeeId: string
  name: string
  email: string
  title: string
  profilePicture: string | null
  status: string
  createdAt: string
  role: "DEAN" | "TEACHER"
}
const empty = {
  employeeId: "",
  firstName: "",
  lastName: "",
  email: "",
  title: "",
  profilePicture: "",
}
const imageData = (file?: File) =>
  new Promise<string>((resolve, reject) => {
    if (!file) return resolve("")
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2_000_000
    )
      return reject(new Error("Choose a PNG, JPEG, or WebP image under 2 MB."))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
const createdAt = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(value))

export default function Departments() {
  const qc = useQueryClient()
  const { user, updateUser } = useAuthStore()
  const [show, setShow] = useState(false),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState<Faculty>(),
    [deleting, setDeleting] = useState<Faculty>()
  const [edit, setEdit] = useState({
    employeeId: "",
    fullName: "",
    email: "",
    title: "",
    newPassword: "",
    profilePicture: "",
  })
  const [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState<"asc" | "desc">("asc"),
    [size, setSize] = useState(15),
    [page, setPage] = useState(1)
  const faculty = useQuery({
    queryKey: ["professors"],
    queryFn: async () => (await api.get<Faculty[]>("/dean/professors")).data,
    refetchInterval: 5_000,
  })
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 3500)
  }
  const rows = [...(faculty.data ?? [])]
    .filter((x) =>
      `${x.employeeId} ${x.name} ${x.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    )
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    visible = rows.slice((page - 1) * size, page * size)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await api.post<{ initialPassword: string }>(
        "/dean/professors/invite",
        form,
      )
      setShow(false)
      setForm(empty)
      notify(
        `Faculty added successfully. Initial password: ${response.data.initialPassword}`,
      )
      await qc.invalidateQueries({ queryKey: ["professors"] })
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? (e.response?.data?.message ?? "Could not add faculty.")
          : "Could not add faculty.",
      )
    } finally {
      setBusy(false)
    }
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    setBusy(true)
    try {
      await api.patch(`/dean/professors/${editing.userId}`, edit)
      if (editing.userId === user?.id) {
        updateUser((await api.get<User>("/auth/me")).data)
      }
      setEditing(undefined)
      notify("Faculty updated successfully.")
      await qc.invalidateQueries({ queryKey: ["professors"] })
    } catch {
      setError("Could not update faculty.")
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api.delete(`/dean/professors/${deleting.userId}`)
      setDeleting(undefined)
      notify("Faculty deleted successfully.")
      await qc.invalidateQueries({ queryKey: ["professors"] })
    } catch (requestError) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message ??
              "Could not delete faculty. Remove or transfer assigned subjects first."
          : "Could not delete faculty. Remove or transfer assigned subjects first.",
      )
    } finally {
      setBusy(false)
    }
  }
  const upload = async (file?: File) => {
    if (!file) return
    const data = new FormData()
    data.append("file", file)
    setBusy(true)
    try {
      const { data: result } = await api.post<{
        created: number
        errors: number
      }>("/dean/professors/import", data)
      notify(
        `Faculty import complete: ${result.created} created, ${result.errors} errors.`,
      )
      await qc.invalidateQueries({ queryKey: ["professors"] })
    } catch {
      setError("Could not import faculty spreadsheet.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <DashboardLayout role="dean" pageTitle="Departments & Professors">
      {toast && (
        <div className="fixed bottom-5 right-5 z-[70] rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
      {error && (
        <div className="fixed bottom-5 right-5 z-[70] rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          {error}
        </div>
      )}
      <Card padded={false}>
        <div className="p-5">
          <CardHeader
            title="Faculty Members"
            right={
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm">
                  <Upload size={15} className="mr-1 inline" /> Import XLSX
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => void upload(e.target.files?.[0])}
                  />
                </label>
                <Button icon={Plus} onClick={() => setShow(true)}>
                  Add Faculty
                </Button>
              </div>
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm">
              Show{" "}
              <select
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded border p-1"
              >
                {[15, 25, 35, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>{" "}
              rows
            </label>
            <div className="flex gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "asc" | "desc")}
                className="rounded border p-2 text-sm"
              >
                <option value="asc">Name: A-Z</option>
                <option value="desc">Name: Z-A</option>
              </select>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search faculty…"
                className="rounded border p-2 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-y border-border bg-surface-2 text-xs uppercase text-text-3">
              <tr>
                {[
                  "Profile",
                  "Employee ID",
                  "Full Name",
                  "Email Address",
                  "Title/Position",
                  "Status",
                  "Date & Time Created",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => (
                <tr key={x.userId} className="border-b border-border">
                  <td className="p-3">
                    {x.profilePicture ? (
                      <img
                        src={x.profilePicture}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                        {x.name[0]}
                      </span>
                    )}
                  </td>
                  <td className="p-3">{x.employeeId}</td>
                  <td className="p-3 font-medium">{x.name}</td>
                  <td className="p-3">{x.email}</td>
                  <td className="p-3">{x.title}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        x.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-700'
                          : x.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {x.status}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {createdAt(x.createdAt)}
                  </td>
                  <td className="p-3">
                    <button
                      className="text-brand"
                      onClick={() => {
                        setEditing(x)
                        setEdit({
                          employeeId: x.employeeId ?? "",
                          fullName: x.name,
                          email: x.email,
                          title: x.title,
                          newPassword: "",
                          profilePicture: x.profilePicture ?? "",
                        })
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    {x.role !== "DEAN" && <button
                      className="ml-3 text-red-600"
                      onClick={() => setDeleting(x)}
                    >
                      <Trash2 size={16} />
                    </button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between p-4 text-sm">
          <span>
            Page {page} of {pages}
          </span>
          <div>
            <Button
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={page === pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
      {show && (
        <Modal title="Add Faculty" onClose={() => setShow(false)}>
          <form onSubmit={submit} className="space-y-3">
            {([
              ["employeeId", "Employee ID"],
              ["firstName", "Firstname"],
              ["lastName", "Lastname"],
              ["email", "Email Address"],
              ["title", "Title/Position"],
            ] as const).map(([k, l]) => (
              <label key={k} className="block text-sm">
                {l}
                <input
                  required
                  type={k === "email" ? "email" : "text"}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
            ))}
            <ImageInput
              value={form.profilePicture}
              onChange={(v) => setForm({ ...form, profilePicture: v })}
            />
            <Actions
              busy={busy}
              cancel={() => setShow(false)}
              label="Add Faculty"
            />
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Faculty" onClose={() => setEditing(undefined)}>
          <form onSubmit={save} className="space-y-3">
            {(["employeeId", "fullName", "email", "title", "newPassword"] as const).map(
              (k) => (
                <label key={k} className="block text-sm">
                  {
                    {
                      fullName: "Full Name",
                      employeeId: "Employee ID",
                      email: "Email Address",
                      title: "Title/Position",
                      newPassword: "Change Password (optional)",
                    }[k]
                  }
                  <input
                    type={
                      k === "email"
                        ? "email"
                        : k === "newPassword"
                          ? "password"
                          : "text"
                    }
                    required={k !== "newPassword"}
                    value={edit[k]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                    className="mt-1 w-full rounded border p-2"
                  />
                </label>
              ),
            )}
            <ImageInput
              value={edit.profilePicture}
              onChange={(v) => setEdit({ ...edit, profilePicture: v })}
            />
            <Actions
              busy={busy}
              cancel={() => setEditing(undefined)}
              label="Save Changes"
            />
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete Faculty" onClose={() => setDeleting(undefined)}>
          <p className="text-sm">
            Delete <b>{deleting.name}</b>? This permanently removes the faculty
            account and cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete Faculty
            </Button>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  )
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
function Actions({
  busy,
  cancel,
  label,
}: {
  busy: boolean
  cancel: () => void
  label: string
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={cancel}>
        Cancel
      </Button>
      <Button disabled={busy}>{busy ? "Saving…" : label}</Button>
    </div>
  )
}
function ImageInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block text-sm">
      Profile Picture (optional)
      {value && (
        <img src={value} className="my-2 h-20 w-20 rounded-full object-cover" />
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void imageData(e.target.files?.[0]).then(onChange)}
        className="mt-1 block w-full text-sm"
      />
    </label>
  )
}
