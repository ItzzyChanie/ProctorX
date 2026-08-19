import {
  CheckCircle2,
  ChevronRight,
  Download,
  FileUp,
  LockKeyhole,
  MessageSquare,
  MonitorPlay,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Upload,
  Users,
  Video,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

const pages: Record<
  string,
  Record<
    string,
    {
      title: string;
      intro: string;
      kind:
        | "join"
        | "sessions"
        | "notices"
        | "profile"
        | "monitor"
        | "create"
        | "playback"
        | "incidents"
        | "upload"
        | "roster"
        | "messages"
        | "analytics"
        | "people"
        | "reports"
        | "audit"
        | "security";
    }
  >
> = {
  student: {
    join: {
      title: "Join session",
      intro: "Enter your professor’s room code and complete the device check.",
      kind: "join",
    },
    sessions: {
      title: "My sessions",
      intro: "Your monitored assessment history and released work.",
      kind: "sessions",
    },
    notifications: {
      title: "Notifications",
      intro: "Warnings, messages, and system updates from your sessions.",
      kind: "notices",
    },
    profile: {
      title: "Profile & device setup",
      intro: "Manage your account and monitoring-client readiness.",
      kind: "profile",
    },
  },
  teacher: {
    monitoring: {
      title: "Live monitoring",
      intro: "CS-204 · Midterm Examination · 43 students connected",
      kind: "monitor",
    },
    sessions: {
      title: "Sessions",
      intro: "Create, schedule, and manage monitored assessment rooms.",
      kind: "create",
    },
    recordings: {
      title: "Recordings & playback",
      intro: "Review recorded sessions alongside their evidence timeline.",
      kind: "playback",
    },
    incidents: {
      title: "Incident reports",
      intro: "Timestamped evidence ready for review and export.",
      kind: "incidents",
    },
    correlation: {
      title: "Score upload & correlation",
      intro: "Compare released exam scores with monitoring signals.",
      kind: "upload",
    },
    classes: {
      title: "Classes & students",
      intro: "Manage sections, rosters, and aggregate monitoring history.",
      kind: "roster",
    },
    messages: {
      title: "Raise-hand queue",
      intro: "Resolve student technical issues during live sessions.",
      kind: "messages",
    },
    profile: {
      title: "Profile & settings",
      intro: "Manage your account and monitoring preferences.",
      kind: "profile",
    },
  },
  dean: {
    analytics: {
      title: "Analytics",
      intro:
        "Filter and investigate academic-integrity trends across the college.",
      kind: "analytics",
    },
    departments: {
      title: "Departments & professors",
      intro: "Manage professor accounts, subject ownership, and sections.",
      kind: "people",
    },
    reports: {
      title: "Reports",
      intro: "Build accreditation and department-review exports.",
      kind: "reports",
    },
    audit: {
      title: "Audit logs",
      intro: "A searchable record of sensitive system activity.",
      kind: "audit",
    },
    security: {
      title: "Security & access control",
      intro: "Review encryption posture and role-based permissions.",
      kind: "security",
    },
    profile: {
      title: "Profile & settings",
      intro: "Manage your account and notification preferences.",
      kind: "profile",
    },
  },
};
const labels: Record<string, string> = {
  dashboard: "Dashboard",
  join: "Join Session",
  sessions: "Sessions",
  notifications: "Notifications",
  profile: "Profile & settings",
  monitoring: "Live Monitoring",
  recordings: "Recordings",
  incidents: "Incident Reports",
  correlation: "Score Correlation",
  classes: "Classes & Students",
  messages: "Raise-hand Queue",
  analytics: "Analytics",
  departments: "Departments & Professors",
  reports: "Reports",
  audit: "Audit Logs",
  security: "Security & Access",
};
export function PortalPage({ role }: { role: "student" | "teacher" | "dean" }) {
  const { page = "" } = useParams();
  const meta = pages[role][page] || pages[role].profile;
  return (
    <div className="portal-page">
      <aside>
        <Link className="portal-brand" to={`/${role}`}>
          <span>⌁</span>Proctor<b>X</b>
        </Link>
        <nav>
          <Link to={`/${role}`}>Dashboard</Link>
          {Object.keys(pages[role]).map((key) => (
            <Link
              className={key === page ? "active" : ""}
              to={`/${role}/${key}`}
              key={key}
            >
              {labels[key]}
            </Link>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <p>
            {role} portal <ChevronRight size={13} /> {meta.title}
          </p>
          <button>
            <Search size={17} /> Search
          </button>
        </header>
        <section>
          <p className="portal-kicker">
            {role === "student"
              ? "ASSESSMENT PORTAL"
              : "ACADEMIC INTEGRITY OPERATIONS"}
          </p>
          <h1>{meta.title}</h1>
          <p className="portal-intro">{meta.intro}</p>
          <PageContent kind={meta.kind} />
        </section>
      </main>
    </div>
  );
}
function PageContent({ kind }: { kind: string }) {
  const rows = [
    ["Maria Santos", "CS-204", "Aug 14, 10:24 AM", "Open"],
    ["John Villanueva", "CS-204", "Aug 14, 10:08 AM", "Reviewed"],
    ["Andrea Reyes", "CS-201", "Aug 13, 2:31 PM", "Resolved"],
  ];
  if (kind === "join")
    return (
      <div className="portal-card portal-join">
        <label>
          Room code
          <input placeholder="CS-4F2K" />
        </label>
        <button className="portal-primary">
          Continue <ChevronRight size={17} />
        </button>
        <hr />
        <h3>Pre-flight check</h3>
        <p>
          <CheckCircle2 /> Monitoring client is running
        </p>
        <p>
          <CheckCircle2 /> Screen-share permission is ready
        </p>
        <small>
          By continuing, you consent to monitoring for this assessment. Activity
          is encrypted and retained under university policy.
        </small>
      </div>
    );
  if (kind === "monitor")
    return (
      <>
        <div className="portal-banner">
          <MessageSquare /> 2 students have raised their hand{" "}
          <button>Open queue</button>
        </div>
        <div className="screen-grid">
          {rows.concat(rows, rows).map((r, i) => (
            <article key={i}>
              <div className="screen-preview">
                <MonitorPlay size={30} />
                <span className={`meter m${i % 3}`}>
                  {[82, 67, 23][i % 3]} · {["High", "Medium", "Low"][i % 3]}
                </span>
              </div>
              <strong>{r[0]}</strong>
              <small>Alt-tab · Idle</small>
              <footer>
                <button>Warn</button>
                <button>Flag</button>
              </footer>
            </article>
          ))}
        </div>
      </>
    );
  if (kind === "create")
    return (
      <div className="portal-split">
        <div className="portal-card">
          <h3>Create monitored session</h3>
          <label>
            Subject
            <input value="Data Structures & Algorithms" readOnly />
          </label>
          <label>
            Section
            <select>
              <option>BSCS 2-A</option>
            </select>
          </label>
          <label>
            Duration
            <select>
              <option>90 minutes</option>
            </select>
          </label>
          <button className="portal-primary">
            <Plus size={16} /> Create session
          </button>
        </div>
        <div className="portal-card">
          <h3>Upcoming sessions</h3>
          {rows.map((r) => (
            <p className="portal-line" key={r[0]}>
              <b>{r[1]} Midterm</b>
              <span>Aug 18 · 10:00 AM</span>
              <code>CS-4F2K</code>
            </p>
          ))}
        </div>
      </div>
    );
  if (kind === "playback")
    return (
      <div className="portal-split">
        <div className="portal-card playback">
          <div>
            <Video size={36} />
            <b>Recording preview</b>
          </div>
          <input type="range" />
          <p>
            10:24:16 · Suspicion score{" "}
            <span className="meter m0">82 · High</span>
          </p>
        </div>
        <div className="portal-card">
          <h3>Evidence timeline</h3>
          {rows.map((r) => (
            <p className="portal-line" key={r[0]}>
              <b>10:24:16 · Tab switch</b>
              <span>{r[0]}</span>
            </p>
          ))}
        </div>
      </div>
    );
  if (kind === "upload")
    return (
      <div className="portal-split">
        <div className="portal-card drop">
          <Upload size={27} />
          <h3>Upload exam scores CSV</h3>
          <p>Drag a CSV here or choose a file.</p>
          <button>Choose file</button>
        </div>
        <div className="portal-card">
          <h3>Correlation result</h3>
          <strong className="big-mono">−0.38</strong>
          <p>Moderate negative correlation</p>
          <div className="scatter">
            × · · ×<br /> · × · ·<br />× · · · ×
          </div>
        </div>
      </div>
    );
  if (kind === "messages")
    return (
      <div className="portal-card">
        {rows.map((r, i) => (
          <div className="message-row" key={r[0]}>
            <span>{i + 1}</span>
            <p>
              <b>{r[0]}</b>
              <small>
                Needs help connecting screen share · waiting {i + 2} min
              </small>
            </p>
            <button>Reply</button>
            <button>Resolve</button>
          </div>
        ))}
      </div>
    );
  if (["sessions", "incidents", "roster", "people", "audit"].includes(kind))
    return (
      <Table
        rows={rows}
        action={
          kind === "roster" || kind === "people" ? "Add person" : "Export"
        }
      />
    );
  if (kind === "notices")
    return (
      <div className="portal-card">
        {[
          "Monitoring reminder",
          "Session cleared",
          "System maintenance notice",
        ].map((x, i) => (
          <div className="notice" key={x}>
            <ShieldAlert />
            <p>
              <b>{x}</b>
              <small>
                {i === 0
                  ? "Please remain in the assessment window during your session."
                  : "Aug 14, 2026 · System notice"}
              </small>
            </p>
            <span>{i === 0 ? "Unread" : "Read"}</span>
          </div>
        ))}
      </div>
    );
  if (kind === "reports")
    return (
      <div className="portal-split">
        <div className="portal-card">
          <h3>Build a report</h3>
          <label>
            Date range
            <input value="Aug 01 – Aug 14, 2026" readOnly />
          </label>
          <label>
            Scope
            <select>
              <option>School of Computer Studies</option>
            </select>
          </label>
          <button className="portal-primary">
            <FileUp size={16} /> Generate preview
          </button>
        </div>
        <div className="portal-card">
          <h3>Recent exports</h3>
          <p className="portal-line">
            <b>Semester integrity summary</b>
            <span>Generated Aug 12</span>
            <Download size={16} />
          </p>
        </div>
      </div>
    );
  if (kind === "analytics")
    return (
      <>
        <div className="filter-row">
          <select>
            <option>First semester</option>
          </select>
          <select>
            <option>All programs</option>
          </select>
          <select>
            <option>All subjects</option>
          </select>
          <button>Apply filters</button>
        </div>
        <div className="portal-split">
          <div className="portal-card">
            <h3>Incidence by subject</h3>
            <div className="mini-bars">▇ ▆ ▃ ▇ ▅ ▂</div>
          </div>
          <div className="portal-card">
            <h3>Insight</h3>
            <p>
              BSCS 2-A exceeds the review threshold by 2.4 percentage points.
              Review the session conditions before action.
            </p>
          </div>
        </div>
      </>
    );
  if (kind === "security")
    return (
      <div className="portal-split">
        <div className="portal-card">
          <h3>Security posture</h3>
          <p>
            <CheckCircle2 /> AES-256 encrypted data at rest
          </p>
          <p>
            <CheckCircle2 /> TLS 1.3 connections enforced
          </p>
          <p>
            <CheckCircle2 /> Session policy enabled
          </p>
        </div>
        <div className="portal-card">
          <h3>Roles & permissions</h3>
          <Table
            rows={[
              ["Dean", "Full access", "", ""],
              ["Professor", "Classes & evidence", "", ""],
              ["Student", "Own sessions", "", ""],
            ]}
            action="Edit roles"
          />
        </div>
      </div>
    );
  return (
    <div className="portal-split">
      <div className="portal-card">
        <h3>Account details</h3>
        <label>
          Full name
          <input value="Alexandra Cruz" readOnly />
        </label>
        <label>
          Email
          <input value="student@arellano.edu.ph" readOnly />
        </label>
        <button className="portal-primary">Save changes</button>
      </div>
      <div className="portal-card">
        <h3>Device status</h3>
        <p>
          <CheckCircle2 /> Monitoring client connected
        </p>
        <p>
          <LockKeyhole /> Your session data is protected with encryption.
        </p>
      </div>
    </div>
  );
}
function Table({ rows, action }: { rows: string[][]; action: string }) {
  return (
    <div className="portal-card">
      <div className="table-head">
        <h3>Records</h3>
        <button className="portal-primary">
          <Plus size={15} />
          {action}
        </button>
      </div>
      <div className="portal-table">
        <div className="tr th">
          <span>Name</span>
          <span>Session / section</span>
          <span>Timestamp</span>
          <span>Status</span>
        </div>
        {rows.map((r) => (
          <div className="tr" key={r[0]}>
            {r.map((c, i) => (
              <span key={i}>{i === 3 ? <b className="status">{c}</b> : c}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
