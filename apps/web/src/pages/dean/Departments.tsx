import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Upload,
  X,
} from "lucide-react"
import axios from "axios"
import { DashboardLayout } from "../../components/layout/DashboardLayout"
import { Card, CardHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { api, assetSrc } from "../../lib/api"
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
  department: Department | null
  workload: number
  subjects: {
    id: string
    code: string
    name: string
    schedule: string | null
    createdAt: string
    studentCount: number
    assessmentCount: number
  }[]
}
type Department = {
  id: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  _count: { faculty: number }
}
const empty = {
  employeeId: "",
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  title: "",
  departmentId: "",
  profilePicture: "",
}
const emptyDepartment = { code: "", name: "", description: "" }
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
    [createdCredentials, setCreatedCredentials] = useState<{
      employeeId: string
      initialPassword: string
    }>(),
    [editing, setEditing] = useState<Faculty>(),
    [deleting, setDeleting] = useState<Faculty>()
  const [edit, setEdit] = useState({
    employeeId: "",
    fullName: "",
    email: "",
    title: "",
    departmentId: "",
    profilePicture: "",
  })
  const [departmentForm, setDepartmentForm] = useState(emptyDepartment)
  const [departmentModal, setDepartmentModal] = useState<
    "create" | "edit" | undefined
  >()
  const [editingDepartment, setEditingDepartment] = useState<Department>()
  const [viewingWorkload, setViewingWorkload] = useState<Faculty>()
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
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () =>
      (await api.get<Department[]>("/dean/departments")).data,
  })
  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 3500)
  }
  const saveDepartment = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      if (departmentModal === "edit" && editingDepartment) {
        await api.patch(
          "/dean/departments/" + editingDepartment.id,
          departmentForm,
        )
        notify("Department updated successfully.")
      } else {
        await api.post("/dean/departments", departmentForm)
        notify("Department created successfully.")
      }
      setDepartmentModal(undefined)
      setEditingDepartment(undefined)
      setDepartmentForm(emptyDepartment)
      await qc.invalidateQueries({ queryKey: ["departments"] })
    } catch (requestError) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message ?? "Could not save department."
          : "Could not save department.",
      )
    } finally {
      setBusy(false)
    }
  }
  const updateDepartmentStatus = async (department: Department) => {
    setBusy(true)
    setError("")
    try {
      await api.patch("/dean/departments/" + department.id + "/status", {
        status: department.isActive ? "ARCHIVED" : "ACTIVE",
      })
      notify(
        department.isActive
          ? "Department archived."
          : "Department reactivated.",
      )
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["departments"] }),
        qc.invalidateQueries({ queryKey: ["professors"] }),
      ])
    } catch {
      setError("Could not update department status.")
    } finally {
      setBusy(false)
    }
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
      const { data } = await api.post<{
        initialPassword: string
      }>("/dean/professors/invite", {
        ...form,
        departmentId: form.departmentId || null,
      })
      setCreatedCredentials({
        employeeId: form.employeeId,
        initialPassword: data.initialPassword,
      })
      setShow(false)
      setForm(empty)
      notify("Faculty account created. Share the temporary credentials securely.")
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
      await api.patch("/dean/professors/" + editing.userId, {
        ...edit,
        departmentId: edit.departmentId || null,
      })
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
  const updateStatus = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      const status = deleting.status === "DISABLED" ? "ACTIVE" : "DISABLED"
      await api.patch(`/dean/professors/${deleting.userId}/status`, { status })
      setDeleting(undefined)
      notify(`Faculty account ${status === "ACTIVE" ? "reactivated" : "disabled"} successfully.`)
      await qc.invalidateQueries({ queryKey: ["professors"] })
    } catch (requestError) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message ??
              "Could not update the faculty account status."
          : "Could not update the faculty account status.",
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
      <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Departments"
          subtitle="Create official departments and assign faculty consistently."
          right={
            <Button
              icon={Plus}
              onClick={() => {
                setDepartmentForm(emptyDepartment)
                setEditingDepartment(undefined)
                setDepartmentModal("create")
              }}
            >
              Add Department
            </Button>
          }
        />
        {departments.isLoading ? (
          <p className="text-sm text-text-3">Loading departments...</p>
        ) : departments.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {departments.data.map((department) => (
              <article
                key={department.id}
                className={
                  "rounded-xl border p-4 " +
                  (department.isActive
                    ? "border-border bg-surface-2"
                    : "border-border bg-surface-2 opacity-60")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                      <Building2 size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{department.name}</p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
                        {department.code}
                      </p>
                    </div>
                  </div>
                  <span
                    className={
                      "rounded-full px-2 py-1 text-[11px] font-semibold " +
                      (department.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600")
                    }
                  >
                    {department.isActive ? "ACTIVE" : "ARCHIVED"}
                  </span>
                </div>
                <p className="mt-3 min-h-10 text-sm text-text-3">
                  {department.description || "No description provided."}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-text-3">
                    {department._count.faculty} faculty
                  </span>
                  <div className="flex gap-3">
                    <button
                      className="text-brand"
                      aria-label={"Edit " + department.name}
                      onClick={() => {
                        setEditingDepartment(department)
                        setDepartmentForm({
                          code: department.code,
                          name: department.name,
                          description: department.description ?? "",
                        })
                        setDepartmentModal("edit")
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      disabled={busy}
                      className={
                        department.isActive
                          ? "text-red-600"
                          : "text-emerald-600"
                      }
                      aria-label={
                        (department.isActive ? "Archive " : "Reactivate ") +
                        department.name
                      }
                      onClick={() => void updateDepartmentStatus(department)}
                    >
                      {department.isActive ? (
                        <PowerOff size={16} />
                      ) : (
                        <Power size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Building2 className="mx-auto text-text-3" />
            <p className="mt-2 font-medium">No departments yet</p>
            <p className="mt-1 text-sm text-text-3">
              Add the institution's first department to begin organizing faculty.
            </p>
          </div>
        )}
      </Card>
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
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="border-y border-border bg-surface-2 text-xs uppercase text-text-3">
              <tr>
                {[
                  "Profile",
                  "Employee ID",
                  "Full Name",
                  "Email Address",
                  "Title/Position",
                  "Department",
                  "Workload",
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
                        src={assetSrc(x.profilePicture)}
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
                    {x.department ? (
                      <span className="font-medium">{x.department.name}</span>
                    ) : (
                      <span className="text-text-3">Unassigned</span>
                    )}
                  </td>
                  <td className="p-3">
                    {x.role === "TEACHER" ? (
                      <button
                        type="button"
                        className="whitespace-nowrap font-medium text-brand hover:underline"
                        onClick={() => setViewingWorkload(x)}
                        aria-label={`View ${x.name}'s faculty workload`}
                      >
                        {x.workload} {x.workload === 1 ? "subject" : "subjects"}
                      </button>
                    ) : (
                      <span className="whitespace-nowrap text-text-2">
                        {x.workload} {x.workload === 1 ? "subject" : "subjects"}
                      </span>
                    )}
                  </td>
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
                          departmentId: x.department?.id ?? "",
                          profilePicture: x.profilePicture ?? "",
                        })
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    {x.role !== "DEAN" && x.status !== "PENDING" && <button
                      className="ml-3 text-red-600"
                      onClick={() => setDeleting(x)}
                      aria-label={`${x.status === "DISABLED" ? "Reactivate" : "Disable"} ${x.name}`}
                    >
                      {x.status === "DISABLED" ? <Power size={16} /> : <PowerOff size={16} />}
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
      </div>
      {departmentModal && (
        <Modal
          title={
            departmentModal === "create"
              ? "Add Department"
              : "Edit Department"
          }
          onClose={() => setDepartmentModal(undefined)}
        >
          <form onSubmit={saveDepartment} className="space-y-3">
            <label className="block text-sm">
              Department Code
              <input
                required
                maxLength={20}
                value={departmentForm.code}
                onChange={(event) =>
                  setDepartmentForm({
                    ...departmentForm,
                    code: event.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g. CCS"
                className="mt-1 w-full rounded border p-2 uppercase"
              />
            </label>
            <label className="block text-sm">
              Department Name
              <input
                required
                maxLength={120}
                value={departmentForm.name}
                onChange={(event) =>
                  setDepartmentForm({
                    ...departmentForm,
                    name: event.target.value,
                  })
                }
                placeholder="College of Computer Studies"
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            <label className="block text-sm">
              Description (optional)
              <textarea
                maxLength={500}
                rows={3}
                value={departmentForm.description}
                onChange={(event) =>
                  setDepartmentForm({
                    ...departmentForm,
                    description: event.target.value,
                  })
                }
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            <Actions
              busy={busy}
              cancel={() => setDepartmentModal(undefined)}
              label={
                departmentModal === "create"
                  ? "Create Department"
                  : "Save Department"
              }
            />
          </form>
        </Modal>
      )}
      {viewingWorkload && (
        <Modal
          title="View Faculty Workload"
          onClose={() => setViewingWorkload(undefined)}
        >
          <p className="mb-4 text-sm text-text-3">
            Subjects currently handled by{" "}
            <b className="text-text-1">{viewingWorkload.name}</b>.
          </p>
          {viewingWorkload.subjects.length ? (
            <div className="space-y-3">
              {viewingWorkload.subjects.map((subject) => (
                <article
                  key={subject.id}
                  className="rounded-xl border border-border bg-surface-2 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-text-1">{subject.name}</p>
                      <p className="mt-1 font-mono text-xs font-semibold text-brand">
                        {subject.code}
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
                      {subject.assessmentCount}{" "}
                      {subject.assessmentCount === 1
                        ? "assessment"
                        : "assessments"}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-text-3 sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-text-2">Schedule</dt>
                      <dd>{subject.schedule || "Not specified"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-text-2">Students</dt>
                      <dd>{subject.studentCount} enrolled</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-text-2">Created</dt>
                      <dd>{createdAt(subject.createdAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-3">
              This faculty member has no subjects yet.
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={() => setViewingWorkload(undefined)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
      {show && (
        <Modal title="Add Faculty" onClose={() => setShow(false)}>
          <form onSubmit={submit} className="space-y-3">
            {([
              ["employeeId", "Employee ID"],
              ["firstName", "Firstname"],
              ["middleName", "Middle name (optional)"],
              ["lastName", "Lastname"],
              ["email", "Email Address"],
              ["title", "Title/Position"],
            ] as const).map(([k, l]) => (
              <label key={k} className="block text-sm">
                {l}
                <input
                  required={k !== "middleName"}
                  type={k === "email" ? "email" : "text"}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
            ))}
            <label className="block text-sm">
              Department
              <select
                value={form.departmentId}
                onChange={(event) =>
                  setForm({ ...form, departmentId: event.target.value })
                }
                className="mt-1 w-full rounded border p-2"
              >
                <option value="">Unassigned</option>
                {departments.data
                  ?.filter((department) => department.isActive)
                  .map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} - {department.name}
                    </option>
                  ))}
              </select>
            </label>
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
      {createdCredentials && (
        <Modal
          title="Faculty temporary credentials"
          onClose={() => setCreatedCredentials(undefined)}
        >
          <p className="text-sm text-text-3">
            Give these credentials directly to the faculty member. They will
            verify the emailed activation code and must choose a new password
            before entering the portal.
          </p>
          <dl className="mt-5 space-y-3 rounded-xl bg-surface-2 p-4">
            <div>
              <dt className="text-xs text-text-3">Employee ID</dt>
              <dd className="font-mono font-semibold">
                {createdCredentials.employeeId}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-3">Temporary password</dt>
              <dd className="font-mono font-semibold">
                {createdCredentials.initialPassword}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setCreatedCredentials(undefined)}>
              I have saved the credentials
            </Button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Faculty" onClose={() => setEditing(undefined)}>
          <form onSubmit={save} className="space-y-3">
            {(["employeeId", "fullName", "email", "title"] as const).map(
              (k) => (
                <label key={k} className="block text-sm">
                  {
                    {
                      fullName: "Full Name",
                      employeeId: "Employee ID",
                      email: "Email Address",
                      title: "Title/Position",
                    }[k]
                  }
                  <input
                    type={
                      k === "email"
                        ? "email"
                        : "text"
                    }
                    required
                    value={edit[k]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                    className="mt-1 w-full rounded border p-2"
                  />
                </label>
              ),
            )}
            {editing.role === "TEACHER" && (
              <label className="block text-sm">
                Department
                <select
                  value={edit.departmentId}
                  onChange={(event) =>
                    setEdit({ ...edit, departmentId: event.target.value })
                  }
                  className="mt-1 w-full rounded border p-2"
                >
                  <option value="">Unassigned</option>
                  {departments.data
                    ?.filter(
                      (department) =>
                        department.isActive ||
                        department.id === editing.department?.id,
                    )
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.code} - {department.name}
                      </option>
                    ))}
                </select>
              </label>
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
        <Modal
          title={`${deleting.status === "DISABLED" ? "Reactivate" : "Disable"} Faculty`}
          onClose={() => setDeleting(undefined)}
        >
          <p className="text-sm">
            {deleting.status === "DISABLED" ? "Reactivate" : "Disable"}{" "}
            <b>{deleting.name}</b>? {deleting.status === "DISABLED"
              ? "They will regain access to their existing subjects and records."
              : "They will immediately lose access, while their academic records remain intact."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void updateStatus()}
            >
              {deleting.status === "DISABLED" ? "Reactivate Faculty" : "Disable Faculty"}
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
        <img src={assetSrc(value)} className="my-2 h-20 w-20 rounded-full object-cover" />
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
