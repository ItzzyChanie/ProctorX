import { useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorPlay,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UsersRound,
  Video,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";

type Role = "teacher" | "dean";
const data = {
  teacher: {
    portal: "Professor portal",
    title: "Professor dashboard",
    greeting: "Good morning",
    description:
      "Keep a close watch on your classes and active monitoring sessions.",
    stats: [
      ["Active sessions now", "02", "Live monitoring"],
      ["Students monitored today", "64", "↑ 12% vs. yesterday"],
      ["Average suspicion score", "23.8", "Low · 0–39"],
      ["Flagged incidents", "07", "This week"],
    ],
    nav: [
      ["Dashboard", LayoutDashboard],
      ["Live Monitoring", MonitorPlay],
      ["Sessions", BookOpen],
      ["Recordings", Video],
      ["Incident Reports", ShieldAlert],
      ["Classes & Students", UsersRound],
      ["Score Correlation", BarChart3],
      ["Raise-hand Queue", Bell],
      ["Profile & Settings", UsersRound],
    ],
    sections: [
      "Average suspicion by section",
      "Incident type breakdown",
      "Suspicion trend · CS-204",
    ],
  },
  dean: {
    portal: "Dean portal",
    title: "College overview",
    greeting: "Good morning",
    description: "A clear, department-wide view of academic-integrity signals.",
    stats: [
      ["Monitored sessions", "186", "This semester"],
      ["College avg. suspicion", "21.4", "Low · 0–39"],
      ["Incident rate", "4.8%", "↓ 1.2% vs. last term"],
      ["Sections above threshold", "06", "Requires review"],
    ],
    nav: [
      ["Dashboard", LayoutDashboard],
      ["Analytics", BarChart3],
      ["Departments & Professors", UsersRound],
      ["Reports", FileBarChart],
      ["Audit Logs", Activity],
      ["Security & Access", ShieldCheck],
      ["Profile & Settings", UsersRound],
    ],
    sections: [
      "Incidence rate by section",
      "Incident type breakdown",
      "College suspicion trend",
    ],
  },
} as const;

export function AnalyticsDashboard({ role }: { role: Role }) {
  const config = data[role];
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const name =
    user?.fullName?.split(" ")[0] ||
    (role === "teacher" ? "Professor" : "Dean");
  return (
    <div className={`analytics-app ${dark ? "analytics-app--dark" : ""}`}>
      <aside
        className={`analytics-sidebar ${menu ? "analytics-sidebar--open" : ""}`}
      >
        <div className="analytics-brand">
          <span>
            <ShieldCheck size={19} />
          </span>
          Proctor<b>X</b>
        </div>
        <nav>
          {config.nav.map(([label, Icon], index) => (
            <Link
              className={index === 0 ? "active" : ""}
              to={navHref(role, label)}
              key={label}
            >
              <Icon size={18} />
              {label}
              {label === "Live Monitoring" && <i>2</i>}
            </Link>
          ))}
        </nav>
        <div className="analytics-account">
          <div>{name.charAt(0)}</div>
          <p>
            <strong>{user?.fullName || name}</strong>
            <small>{role === "teacher" ? "Professor" : "Dean · SCS"}</small>
          </p>
          <button
            onClick={async () => {
              await api.post("/auth/logout").catch(() => undefined);
              signOut();
              navigate("/");
            }}
            aria-label="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="analytics-scrim"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <main className="analytics-main" id="dashboard">
        <header>
          <button
            className="analytics-menu"
            onClick={() => setMenu(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div>
            <p>
              {config.portal} <ChevronRight size={13} /> Dashboard
            </p>
            <h1>{config.title}</h1>
          </div>
          <div className="analytics-actions">
            <button className="analytics-bell" aria-label="Notifications">
              <Bell size={19} />
              <b />
            </button>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span>{name.charAt(0)}</span>
            <ChevronDown size={16} />
          </div>
        </header>
        <div className="analytics-content">
          <section className="analytics-intro">
            <div>
              <em>
                {role === "teacher"
                  ? "WEDNESDAY, AUGUST 14"
                  : "ACADEMIC YEAR 2026–2027 · FIRST SEMESTER"}
              </em>
              <h2>
                {config.greeting}, {name}.
              </h2>
              <p>{config.description}</p>
            </div>
            {role === "teacher" ? (
              <div className="analytics-live">
                <span>
                  <Activity size={17} />
                </span>
                <p>
                  <strong>2 live sessions in progress</strong>
                  <small>64 students connected</small>
                </p>
                <button>
                  Open monitoring <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <button className="analytics-report">
                Generate report <FileBarChart size={16} />
              </button>
            )}
          </section>
          <section className="analytics-kpis">
            {config.stats.map((stat, index) => (
              <article key={stat[0]}>
                <p>{stat[0]}</p>
                <strong className={index === 2 ? "mono" : ""}>{stat[1]}</strong>
                <small className={index === 2 ? "risk" : ""}>{stat[2]}</small>
                <svg viewBox="0 0 100 25" preserveAspectRatio="none">
                  <path
                    d={`M0 ${20 - index} L18 ${15 + index} L35 ${18 - index} L52 ${7 + index} L70 ${12 - index} L100 ${3 + index}`}
                  />
                </svg>
              </article>
            ))}
          </section>
          <section className="analytics-charts">
            <Chart title={config.sections[0]} type="bars" />
            <Chart title={config.sections[1]} type="donut" />
          </section>
          <section className="analytics-bottom">
            <Chart title={config.sections[2]} type="line" />
            <article className="analytics-queue">
              <div className="analytics-card-title">
                <div>
                  <h3>
                    {role === "teacher" ? "Needs review" : "Priority insights"}
                  </h3>
                  <p>
                    {role === "teacher"
                      ? "Recent monitoring events"
                      : "Signals worth attention"}
                  </p>
                </div>
                <a href="#">
                  View all <ChevronRight size={15} />
                </a>
              </div>
              {(role === "teacher"
                ? [
                    ["M. Santos", "CS-204 · Tab switching", "82"],
                    ["J. Villanueva", "CS-204 · Extended idle", "67"],
                    ["A. Reyes", "CS-201 · USB device", "58"],
                  ]
                : [
                    ["BSCS 2-A", "Incident rate 8.2% · ↑ 2.4%", "High"],
                    ["Web Systems", "Highest rate by subject", "Review"],
                    ["CS Department", "Avg. score 24.1 · Low", "Stable"],
                  ]
              ).map((row, i) => (
                <div className="analytics-queue-row" key={row[0]}>
                  <span className={`analytics-risk analytics-risk--${i}`}>
                    {role === "teacher" ? (
                      row[0].charAt(0)
                    ) : (
                      <ShieldAlert size={16} />
                    )}
                  </span>
                  <p>
                    <strong>{row[0]}</strong>
                    <small>{row[1]}</small>
                  </p>
                  <b>{row[2]}</b>
                </div>
              ))}
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}
function navHref(role: Role, label: string) {
  const paths: Record<string, string> = {
    Dashboard: "",
    "Live Monitoring": "monitoring",
    Sessions: "sessions",
    Recordings: "recordings",
    "Incident Reports": "incidents",
    "Classes & Students": "classes",
    "Score Correlation": "correlation",
    "Raise-hand Queue": "messages",
    Analytics: "analytics",
    "Departments & Professors": "departments",
    Reports: "reports",
    "Audit Logs": "audit",
    "Security & Access": "security",
    "Profile & Settings": "profile",
  };
  return `/${role}${paths[label] ? `/${paths[label]}` : ""}`;
}
function Chart({
  title,
  type,
}: {
  title: string;
  type: "bars" | "donut" | "line";
}) {
  return (
    <article className={`analytics-chart analytics-chart--${type}`}>
      <div className="analytics-card-title">
        <div>
          <h3>{title}</h3>
          <p>
            {type === "bars"
              ? "Based on completed monitored sessions"
              : type === "donut"
                ? "All logged events · this term"
                : "Last 8 monitored sessions"}
          </p>
        </div>
        <button>
          This term <ChevronDown size={14} />
        </button>
      </div>
      {type === "bars" && (
        <div className="bar-visual">
          {[44, 69, 33, 58, 76, 40].map((height, i) => (
            <span key={i}>
              <i style={{ height: `${height}%` }} />
              <small>
                {
                  ["CS-201", "CS-202", "CS-203", "CS-204", "CS-205", "CS-206"][
                    i
                  ]
                }
              </small>
            </span>
          ))}
        </div>
      )}
      {type === "donut" && (
        <div className="donut-visual">
          <div>
            <b>47</b>
            <small>events</small>
          </div>
          <ul>
            <li>
              <i />
              Tab switch <strong>42%</strong>
            </li>
            <li>
              <i />
              Idle time <strong>28%</strong>
            </li>
            <li>
              <i />
              Blacklisted app <strong>19%</strong>
            </li>
            <li>
              <i />
              USB event <strong>11%</strong>
            </li>
          </ul>
        </div>
      )}
      {type === "line" && (
        <div className="line-visual">
          <svg viewBox="0 0 580 180" preserveAspectRatio="none">
            <path className="grid" d="M0 30H580M0 85H580M0 140H580" />
            <path
              className="area"
              d="M0 150 L0 120 L72 101 L145 116 L218 55 L290 83 L363 38 L435 91 L508 64 L580 26 L580 150Z"
            />
            <path
              className="curve"
              d="M0 120 L72 101 L145 116 L218 55 L290 83 L363 38 L435 91 L508 64 L580 26"
            />
          </svg>
          <p>
            <span>09:00</span>
            <span>09:30</span>
            <span>10:00</span>
            <span>10:30</span>
            <span>11:00</span>
          </p>
        </div>
      )}
    </article>
  );
}
