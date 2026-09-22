import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  Users,
} from "lucide-react"
import { DashboardLayout } from "../../components/layout/DashboardLayout"
import { Card, CardHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { api } from "../../lib/api"

type ActorRole = "DEAN" | "TEACHER" | "STUDENT"
type Log = {
  id: string
  actorName: string
  actorEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  occurredAt: string
}
type Result = { items: Log[]; total: number; page: number; pageCount: number }
type Filters = {
  dateFrom: string
  timeFrom: string
  dateTo: string
  timeTo: string
}
const blank: Filters = { dateFrom: "", timeFrom: "", dateTo: "", timeTo: "" }
const formatAuditTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(value))

function AuditTable({ role, title }: { role: ActorRole; title: string }) {
  const [filters, setFilters] = useState({ ...blank })
  const [applied, setApplied] = useState({ ...blank })
  const [page, setPage] = useState(1)
  const params = {
    role,
    page,
    limit: 10,
    ...Object.fromEntries(Object.entries(applied).filter(([, value]) => value)),
  }
  const logs = useQuery({
    queryKey: ["audit-logs", role, params],
    queryFn: async () =>
      (await api.get<Result>("/dean/audit-logs", { params })).data,
  })
  const clear = () => {
    setFilters({ ...blank })
    setApplied({ ...blank })
    setPage(1)
  }
  return (
    <Card padded={false}>
      <div className="p-5">
        <CardHeader
          title={`${title} Audit Logs`}
          subtitle={`${logs.data?.total ?? 0} matching records`}
        />
        <form
          className="grid items-end gap-3 md:grid-cols-[1fr_0.8fr_1fr_0.8fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            setPage(1)
            setApplied(filters)
          }}
        >
          <input
            aria-label={`${title} start date`}
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              setFilters({ ...filters, dateFrom: event.target.value })
            }
            className="rounded border border-border p-2"
          />
          <input
            aria-label={`${title} start time`}
            type="time"
            value={filters.timeFrom}
            onChange={(event) =>
              setFilters({ ...filters, timeFrom: event.target.value })
            }
            className="rounded border border-border p-2"
          />
          <input
            aria-label={`${title} end date`}
            type="date"
            value={filters.dateTo}
            onChange={(event) =>
              setFilters({ ...filters, dateTo: event.target.value })
            }
            className="rounded border border-border p-2"
          />
          <input
            aria-label={`${title} end time`}
            type="time"
            value={filters.timeTo}
            onChange={(event) =>
              setFilters({ ...filters, timeTo: event.target.value })
            }
            className="rounded border border-border p-2"
          />
          <div className="flex gap-2">
            <Button className="flex-1">Apply</Button>
            <Button type="button" variant="ghost" onClick={clear}>
              Clear
            </Button>
          </div>
        </form>
      </div>
      {logs.isLoading && (
        <div className="border-t border-border p-5 text-sm text-text-2">
          Loading audit logs…
        </div>
      )}
      {logs.isError && (
        <div className="border-t border-border p-5 text-sm text-risk-high">
          Could not load audit logs.
        </div>
      )}
      {!logs.isLoading && !logs.isError && !logs.data?.items.length && (
        <div className="border-t border-border p-5 text-sm text-text-2">
          No audit entries match these filters.
        </div>
      )}
      {!!logs.data?.items.length && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[360px] text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-3">
              <tr>
                <th className="p-3">Actor</th>
                <th className="p-3">Log details</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.items.map((log) => (
                <tr key={log.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-semibold text-text-1">
                      {log.actorName}
                    </div>
                    <div className="text-xs text-text-3">
                      {log.actorEmail ?? "No email"}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-mono text-xs text-text-1">
                      {log.action}
                    </div>
                    <div className="mt-1 text-xs text-text-3">
                      {log.targetType ?? "—"} {log.targetId ?? ""}
                    </div>
                    <div className="mt-1 whitespace-nowrap text-xs text-text-2">
                      {formatAuditTime(log.occurredAt)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border p-4 text-sm text-text-3">
        <span>
          Page {logs.data?.page ?? page} of {logs.data?.pageCount ?? 1}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={page <= 1 || logs.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            disabled={page >= (logs.data?.pageCount ?? 1) || logs.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function AuditLogs() {
  const [selectedRole, setSelectedRole] = useState<ActorRole>()
  const choices = [
    {
      role: "DEAN" as const,
      title: "Dean",
      description: "Administrative and dean account activity",
      icon: Building2,
    },
    {
      role: "TEACHER" as const,
      title: "Teachers",
      description: "Faculty and assessment management activity",
      icon: GraduationCap,
    },
    {
      role: "STUDENT" as const,
      title: "Students",
      description: "Student account and examination activity",
      icon: Users,
    },
  ]
  const selected = choices.find((choice) => choice.role === selectedRole)
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Audit Logs"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      {!selectedRole ? (
        <>
          <p className="mb-6 text-sm text-text-3">
            Select an account role to view its audit records.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {choices.map(({ role, title, description, icon: Icon }) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className="group rounded-2xl border border-border bg-surface p-7 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand"
              >
                <span className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon size={23} />
                </span>
                <span className="block font-head text-xl font-bold text-text-1">
                  {title} Logs
                </span>
                <span className="mt-2 block text-sm text-text-3">
                  {description}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <button
            onClick={() => setSelectedRole(undefined)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand"
          >
            <ArrowLeft size={16} /> Audit log roles
          </button>
          <AuditTable
            key={selectedRole}
            role={selectedRole}
            title={selected!.title}
          />
        </div>
      )}
    </DashboardLayout>
  )
}
