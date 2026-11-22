import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  BookOpenCheck,
  Building2,
  Check,
  ChevronRight,
  Eye,
  FileCheck2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Plus,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { SignInModal } from '../../components/SignInModal';
import proctorXLogo from '../../assets/ProctorX-Logo.png';
import './LandingPage.css';

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

type Tone = 'ok' | 'warn' | 'risk' | 'brand' | 'muted';

const nav = [
  ['Features', '#features'],
  ['How it works', '#workflow'],
  ['Roles', '#roles'],
  ['Institutions', '#institutions'],
  ['Privacy', '#privacy'],
  ['FAQ', '#faq'],
] as const;

const steps: [string, string][] = [
  [
    'The Dean sets up the department.',
    'Faculty, students and data-retention rules.',
  ],
  [
    'The professor builds the exam.',
    'Writes questions or generates drafts from lecture files, then schedules it.',
  ],
  [
    'Students take it on their own device.',
    'Answers autosave if the connection drops.',
  ],
  [
    'The professor reviews flagged moments.',
    'Each one has a timestamp, a suspicion score and a clip.',
  ],
  ['The Dean sees the trends.', 'Reports by department, faculty and term.'],
];

const roles = {
  student: [
    'Student',
    GraduationCap,
    'Know what’s next',
    'Upcoming exams, device requirements and in-exam warnings in one place.',
    [
      'Upcoming exams and schedules',
      'Clear device and session requirements',
      'Simple status, instructions and warnings',
    ],
  ],
  professor: [
    'Professor',
    BookOpenCheck,
    'Run exams without watching every screen',
    'Create and schedule exams, watch live sessions, and review flagged incidents with evidence.',
    [
      'Exam creation and scheduling',
      'Live student session monitoring',
      'Evidence and violation review',
    ],
  ],
  dean: [
    'Dean',
    Building2,
    'See the whole department',
    'Integrity trends, faculty activity and reports across every section.',
    [
      'Department overview',
      'Department and faculty insights',
      'Reports and trends by term',
    ],
  ],
} as const;
type RoleKey = keyof typeof roles;

type RoleRow = [string, string, string, Tone];
const rolePreview: Record<
  RoleKey,
  { banner: string; stats: [string, string][]; rows: RoleRow[] }
> = {
  student: {
    banner: 'MY EXAMINATIONS',
    stats: [
      ['3', 'Upcoming'],
      ['12', 'Completed'],
      ['Ready', 'Device check'],
    ],
    rows: [
      ['Calculus II', 'Tomorrow · 09:00', 'Ready', 'ok'],
      ['Data Structures', 'Friday · 13:30', 'Check camera', 'warn'],
      ['Research Methods', 'Submitted May 12', 'Graded', 'brand'],
    ],
  },
  professor: {
    banner: 'EXAM MANAGEMENT',
    stats: [
      ['6', 'Active exams'],
      ['128', 'Students'],
      ['9', 'For review'],
    ],
    rows: [
      ['Calculus II · Section A', '32 students in session', 'Live', 'ok'],
      ['Data Structures', '4 incidents to review', 'Review', 'warn'],
      ['Intro to Computing', 'Opens Monday · 09:00', 'Scheduled', 'brand'],
    ],
  },
  dean: {
    banner: 'INSTITUTION OVERVIEW',
    stats: [
      ['184', 'Sessions'],
      ['2,460', 'Students'],
      ['4.8%', 'Incident rate'],
    ],
    rows: [
      ['Computer Studies', '3.1% incident rate', 'On track', 'ok'],
      ['Engineering', '4.6% incident rate', 'On track', 'ok'],
      ['Business', '5.8% incident rate', 'Watch', 'warn'],
    ],
  },
};

const dashboardNav: [LucideIcon, string][] = [
  [LayoutDashboard, 'Dashboard'],
  [BarChart3, 'Analytics'],
  [Building2, 'Departments'],
  [Users, 'Students'],
  [FileCheck2, 'Reports'],
];

const kpis: [string, string, string, Tone][] = [
  ['184', 'Monitored sessions', '+8%', 'ok'],
  ['2,460', 'Students monitored', '+5%', 'ok'],
  ['118', 'Flagged events', '−12%', 'ok'],
  ['12', 'Active exams', '3 live', 'brand'],
];

const recentActivity: [string, string, string, Tone][] = [
  ['Calculus II', 'Section A · 40 students', 'Completed', 'ok'],
  ['Data Structures', 'Section B · 36 students', 'Live', 'brand'],
  ['Research Methods', '3 incidents flagged', 'Review', 'warn'],
];

const liveStudents: [string, string, number, string, Tone][] = [
  ['JR', 'J. Reyes', 18, 'In session', 'ok'],
  ['AM', 'A. Mendoza', 22, 'In session', 'ok'],
  ['CL', 'C. Lim', 15, 'Looking away', 'warn'],
  ['DS', 'D. Santos', 27, 'In session', 'ok'],
  ['KT', 'K. Tan', 40, 'Submitted', 'brand'],
];

const departments: [string, number][] = [
  ['Computer Studies', 3.1],
  ['Engineering', 4.6],
  ['Business', 5.8],
  ['Education', 2.4],
  ['Nursing', 3.7],
];

/* [month, clean, reviewed, flagged] — totals add up to 184 sessions */
const outcomes: [string, number, number, number][] = [
  ['Jun', 20, 3, 1],
  ['Jul', 23, 4, 1],
  ['Aug', 27, 4, 2],
  ['Sep', 25, 3, 2],
  ['Oct', 31, 4, 2],
  ['Nov', 27, 4, 1],
];

const kept = [
  'Short screen clips around incidents, deleted after 180 days by default',
  'The result of each check (for example, “face not visible”)',
  'Timestamps, suspicion scores, and an audit log of who did what',
];
const neverKept = [
  'Live video of the screen or camera',
  'Camera snapshots and audio samples, which are analysed in memory and then discarded',
];

const faqs: [string, string][] = [
  [
    'Does ProctorX decide whether a student cheated?',
    'No. It flags behaviour that lasts, scores it, and attaches evidence. A professor reviews every incident and makes the final decision.',
  ],
  [
    'What do students need to take an exam?',
    'A laptop with a camera, using Chrome or Edge, works best. Phones and tablets work in camera-only mode. Answers autosave, so a refresh or a dropped connection doesn’t lose work.',
  ],
  [
    'Can we keep using our Google Forms?',
    'Yes. Link a Google Form to an exam and the exam room still monitors the student. Opening the form in its own tab is expected, so it isn’t flagged.',
  ],
  [
    'What happens to recordings and snapshots?',
    'Live video and snapshots are never stored. Short clips around incidents are kept for review and deleted automatically after the retention period your Dean sets.',
  ],
  [
    'Who can see exam evidence?',
    'Access depends on role, and the Dean manages faculty permissions. Sensitive actions are recorded in an audit log that can’t be edited.',
  ],
  [
    'How do we get started?',
    'Select Get started to set up your department. The Dean then adds faculty and students, and professors can schedule their first exam.',
  ],
];

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Animation timing lives in CSS. Components only pass indexes:
 *   --i  order of a block within its section (cards appear one by one)
 *   --j  order of an item inside a block (rows, bars, columns)
 *   --c  character position inside a typed heading
 */
function vars(values: Record<string, number>): CSSProperties {
  return values as CSSProperties;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Adds `.visible` to every [data-reveal] block as it scrolls into view. */
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]');
    if (prefersReducedMotion()) {
      items.forEach((item) => item.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }),
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
}

/** Heading text that types itself out once its block is revealed. */
function TypeText({ text }: { text: string }) {
  const words = text.split(' ');
  let position = 0;
  return (
    <>
      <span className="lp-sr">{text}</span>
      <span className="lp-type" aria-hidden="true" style={vars({ '--n': text.length })}>
        {words.map((word, w) => {
          const letters = [...word].map((letter, l) => (
            <span key={l} style={vars({ '--c': position + l })}>
              {letter}
            </span>
          ));
          position += word.length + 1;
          return (
            <Fragment key={w}>
              <span className="lp-word">{letters}</span>
              {w < words.length - 1 ? ' ' : null}
            </Fragment>
          );
        })}
        <i className="lp-caret" />
      </span>
    </>
  );
}

/** Counts a number like "2,460" or "4.8%" up from zero when it scrolls into view. */
function CountUp({ value, delay = 300 }: { value: string; delay?: number }) {
  const match = value.match(/^(\D*)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  const ref = useRef<HTMLSpanElement>(null);

  const format = (n: number) => {
    if (!match) return value;
    const [, prefix, raw, suffix] = match;
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const text = raw.includes(',')
      ? n.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : n.toFixed(decimals);
    return `${prefix}${text}${suffix}`;
  };

  const [shown, setShown] = useState(() =>
    match && !prefersReducedMotion() ? format(0) : value
  );

  useEffect(() => {
    if (!match || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const target = parseFloat(match[2].replace(/,/g, ''));
    let frame = 0;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / 1400);
            setShown(format(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        }, delay);
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, delay]);

  return <span ref={ref}>{shown}</span>;
}

function useScrolledPast(offset: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const update = () => setPast(window.scrollY > offset);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [offset]);
  return past;
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Logo() {
  return (
    <a className="lp-logo" href="#top" aria-label="ProctorX home">
      <img src={proctorXLogo} alt="ProctorX" />
    </a>
  );
}

function Button({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button className="lp-btn primary" onClick={onClick}>
      {children}
    </button>
  );
}

function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`lp-tag ${tone}`}>{children}</span>;
}

function Heading({ title, copy }: { title: string; copy?: string }) {
  return (
    <div className="lp-heading" data-reveal>
      <h2>
        <TypeText text={title} />
      </h2>
      {copy && <p>{copy}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

/** Line + area trend of weekly monitored sessions (hero dashboard). */
function TrendChart() {
  const gid = `lp-trend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const data = [14, 19, 17, 24, 21, 30, 27, 32];
  const W = 400;
  const H = 172;
  const L = 26;
  const R = 10;
  const T = 12;
  const B = 24;
  const max = 40;
  const last = data.length - 1;
  const x = (i: number) => L + (i * (W - L - R)) / last;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = data
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(last)},${H - B} L${x(0)},${H - B} Z`;
  return (
    <svg
      className="lp-trend"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Weekly monitored sessions over the last 8 weeks, rising from 14 to 32"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.3" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 20, 40].map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
          <text x={L - 8} y={y(t) + 3.5} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      <path className="area" d={area} fill={`url(#${gid})`} />
      <path className="line" d={line} pathLength={1} />
      {data.map((_, i) => (
        <text
          key={i}
          className={i === last ? 'now' : ''}
          x={x(i)}
          y={H - 6}
          textAnchor="middle"
        >
          W{i + 1}
        </text>
      ))}
      <g
        className="marker"
        transform={`translate(${x(last)},${y(data[last])})`}
      >
        <rect className="flag" x={-46} y={-9} width={34} height={18} rx={5} />
        <text className="flag-text" x={-29} y={4} textAnchor="middle">
          {data[last]}
        </text>
        <circle className="point" r={4.5} />
      </g>
    </svg>
  );
}

/** Horizontal bars: incident rate per department (features card). */
function DepartmentBars() {
  const max = 8;
  return (
    <div className="lp-deptbars">
      <small>Incident rate by department · this semester</small>
      <ul>
        {departments.map(([name, rate], j) => (
          <li key={name} style={vars({ '--j': j })}>
            <span>{name}</span>
            <i className="lp-track">
              <i
                className={rate >= 5 ? 'warn' : ''}
                style={{ width: `${(rate / max) * 100}%` }}
              />
            </i>
            <b>{rate.toFixed(1)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacked columns: session outcomes per month (institutions card). */
function OutcomeChart() {
  const max = 44; // headroom above the tallest column for its total label
  return (
    <div className="lp-outcomes">
      <div
        className="lp-stack"
        role="img"
        aria-label="Sessions by outcome per month from June to November: mostly clean, with a small share reviewed or flagged"
      >
        {outcomes.map(([m, clean, reviewed, flagged], j) => (
          <div key={m} className="lp-stack-col" style={vars({ '--j': j })}>
            <em>
              <CountUp value={String(clean + reviewed + flagged)} delay={400 + j * 110} />
            </em>
            <span
              className="flagged"
              style={{ height: `${(flagged / max) * 100}%` }}
            />
            <span
              className="reviewed"
              style={{ height: `${(reviewed / max) * 100}%` }}
            />
            <span
              className="clean"
              style={{ height: `${(clean / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="lp-stack-x">
        {outcomes.map(([m], i) => (
          <span key={m} className={i === outcomes.length - 1 ? 'now' : ''}>
            {m}
          </span>
        ))}
      </div>
      <div className="lp-legend">
        {(['clean', 'reviewed', 'flagged'] as const).map((kind, j) => (
          <span key={kind} style={vars({ '--j': j })}>
            <i className={kind} />
            {kind[0].toUpperCase() + kind.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Navbar({
  openAccess,
  getStarted,
}: {
  openAccess: () => void;
  getStarted: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const scrolled = useScrolledPast(72);
  return (
    <header
      className={`lp-nav-wrap ${scrolled || menu ? 'scrolled' : 'at-top'}`}
    >
      <nav className="lp-nav">
        <Logo />
        <div className="lp-links">
          {nav.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </div>
        <div className="lp-actions">
          <button onClick={openAccess}>Sign in</button>
          <Button onClick={getStarted}>
            Get started <ArrowRight size={15} />
          </Button>
        </div>
        <button
          className="lp-menu"
          aria-label="Toggle menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </nav>
      {menu && (
        <div className="lp-mobile">
          {nav.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </a>
          ))}
          <button onClick={openAccess}>Sign in</button>
          <Button onClick={getStarted}>
            Get started <ArrowRight size={15} />
          </Button>
        </div>
      )}
    </header>
  );
}

function BackToTop() {
  const visible = useScrolledPast(520);
  return (
    <button
      className={`lp-back-top ${visible ? 'visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
    >
      <ArrowUp size={18} />
    </button>
  );
}

function DashboardPreview() {
  return (
    <div className="lp-preview-stage" data-reveal style={vars({ '--i': 3 })}>
      <div className="lp-preview">
        <div className="lp-laptop-screen">
          <i className="lp-laptop-cam" aria-hidden="true" />
          <div className="lp-window">
            <div className="lp-windowbar">
              <i />
              <i />
              <i />
              <small>Dean dashboard</small>
            </div>
            <div className="lp-dashboard">
              <aside>
                <Logo />
                {dashboardNav.map(([NavIcon, label], j) => (
                  <span
                    className={j === 0 ? 'active' : ''}
                    key={label}
                    style={vars({ '--j': j })}
                  >
                    <NavIcon size={15} />
                    {label}
                  </span>
                ))}
              </aside>
              <main>
                <header className="lp-dash-head">
                  <div>
                    <small>Dean portal</small>
                    <h3>Academic integrity overview</h3>
                  </div>
                </header>
                <section className="lp-dash-hero">
                  <div>
                    <small>THIS SEMESTER</small>
                    <b>Department-wide monitoring at a glance</b>
                    <p>
                      Structured insights from completed examination sessions.
                    </p>
                  </div>
                  <strong>
                    <CountUp value="4.8%" delay={900} />
                    <small>Incident rate</small>
                  </strong>
                </section>
                <div className="lp-kpis">
                  {kpis.map(([n, l, delta, tone], j) => (
                    <div key={l} style={vars({ '--j': j })}>
                      <small>{l}</small>
                      <b>
                        <CountUp value={n} delay={900 + j * 80} />
                      </b>
                      <em className={tone}>{delta}</em>
                    </div>
                  ))}
                </div>
                <div className="lp-dash-lower">
                  <article style={vars({ '--j': 0 })}>
                    <header className="lp-panel-head">
                      <b>Monitored sessions per week</b>
                      <small>Last 8 weeks</small>
                    </header>
                    <TrendChart />
                  </article>
                  <article style={vars({ '--j': 1 })}>
                    <header className="lp-panel-head">
                      <b>Recent activity</b>
                      <small>Today</small>
                    </header>
                    <ul className="lp-activity">
                      {recentActivity.map(([exam, meta, status, tone], j) => (
                        <li key={exam} style={vars({ '--j': j })}>
                          <i className={`lp-dot ${tone}`} />
                          <span>
                            <b>{exam}</b>
                            <small>{meta}</small>
                          </span>
                          <Tag tone={tone}>{status}</Tag>
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>
              </main>
            </div>
          </div>
        </div>
        <div className="lp-laptop-base" aria-hidden="true">
          <i />
        </div>
      </div>
    </div>
  );
}

function Hero({ getStarted }: { getStarted: () => void }) {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-container">
        <div className="lp-hero-copy">
          <h1>
            The Examination Platform
            <br />
            <span>Your Institution Needs</span>
          </h1>
          <p>
            ProctorX watches the screens you can’t. It flags behaviour that
            lasts, saves a short clip as evidence, and leaves the decision to
            the professor.
          </p>
          <div className="lp-hero-cta">
            <Button onClick={getStarted}>
              Get started <ArrowRight size={17} />
            </Button>
            <a className="lp-textlink" href="#workflow">
              See how it works <ChevronRight size={16} />
            </a>
          </div>
          <small className="lp-hero-note">
            Works in Chrome and Edge on laptops, and on phones and tablets in
            camera-only mode.
          </small>
        </div>
        <DashboardPreview />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="lp-section" id="features">
      <div className="lp-container">
        <Heading
          title="What professors see during an exam"
          copy="A live view of every student, with the moments that need a second look pulled to the top."
        />
        <div className="lp-bento">
          <article className="lp-card large" data-reveal style={vars({ '--i': 0 })}>
            <h3>Live monitoring wall</h3>
            <p>
              Screen and camera tiles for the whole class, with each
              student’s progress and status.
            </p>
            <div className="lp-monitor">
              <header>
                <b>Calculus II · Section A</b>
                <Tag tone="ok">
                  <i className="lp-live" /> Live · 24 students
                </Tag>
              </header>
              <ul>
                {liveStudents.map(([initials, name, q, status, tone], j) => (
                  <li key={name} style={vars({ '--j': j })}>
                    <i className="lp-avatar">{initials}</i>
                    <span>
                      <b>{name}</b>
                      <small>Question {q} of 40</small>
                    </span>
                    <i className="lp-progress" aria-hidden="true">
                      <i style={{ width: `${(q / 40) * 100}%` }} />
                    </i>
                    <Tag tone={tone}>{status}</Tag>
                  </li>
                ))}
              </ul>
              <footer>
                <span>1 student needs attention</span>
                <span>Updated every 10 seconds</span>
              </footer>
            </div>
          </article>
          <article className="lp-card" data-reveal style={vars({ '--i': 1 })}>
            <h3>Flags that wait before firing</h3>
            <p>
              A glance or a cough is ignored. Looking away, a missing face or a
              second face is flagged only after it lasts about 9 seconds.
            </p>
            <div className="lp-events">
              <div className="lp-event warn" style={vars({ '--j': 0 })}>
                <i>
                  <Eye size={15} />
                </i>
                <span>
                  <b>Looking away for 9 seconds</b>
                  <small>10:42:18 · C. Lim</small>
                </span>
                <Tag tone="warn">Review</Tag>
              </div>
              <div className="lp-event" style={vars({ '--j': 1 })}>
                <i>
                  <FileText size={15} />
                </i>
                <span>
                  <b>Google Form opened</b>
                  <small>10:31:04 · Expected action</small>
                </span>
                <Tag tone="muted">Not penalized</Tag>
              </div>
            </div>
          </article>
          <article className="lp-card" data-reveal style={vars({ '--i': 2 })}>
            <h3>Evidence with every incident</h3>
            <p>
              Tab switches and fullscreen exits save a short screen clip, so a
              review takes seconds instead of guesswork.
            </p>
            <ol className="lp-timeline">
              {(
                [
                  ['10:02', 'Exam started', 'brand'],
                  ['10:42', 'Tab switch', 'warn'],
                  ['10:42', 'Clip saved', 'sky'],
                  ['11:30', 'Submitted', 'ok'],
                ] as const
              ).map(([time, label, tone], j) => (
                <li key={j} style={vars({ '--j': j })}>
                  <i className={tone} />
                  <time>{time}</time>
                  <b>{label}</b>
                </li>
              ))}
            </ol>
          </article>
          <article className="lp-card wide" data-reveal style={vars({ '--i': 3 })}>
            <div>
              <h3>Exams in one place</h3>
              <p>
                Write questions, link a Google Form, schedule sections and
                release results without switching tools.
              </p>
            </div>
            <div className="lp-schedule">
              <small>MONDAY · MAY 18</small>
              {(
                [
                  [
                    '09:00',
                    'Introduction to Computing',
                    'Room 204 · 40 students',
                    'Live',
                    'ok',
                  ],
                  [
                    '13:30',
                    'Data Structures',
                    'Online · 36 students',
                    'Scheduled',
                    'brand',
                  ],
                  [
                    '16:00',
                    'Research Methods',
                    'Hybrid · 28 students',
                    'Draft',
                    'muted',
                  ],
                ] as const
              ).map(([time, title, meta, status, tone], j) => (
                <p key={title} style={vars({ '--j': j })}>
                  <span>{time}</span>
                  <span>
                    <b>{title}</b>
                    <small>{meta}</small>
                  </span>
                  <Tag tone={tone}>{status}</Tag>
                </p>
              ))}
            </div>
          </article>
          <article className="lp-card dept" data-reveal style={vars({ '--i': 4 })}>
            <h3>A department view for Deans</h3>
            <p>
              Incident rates by department and term, so patterns show up
              early.
            </p>
            <DepartmentBars />
          </article>
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className="lp-section muted" id="workflow">
      <div className="lp-container">
        <Heading title="From setup to results" />
        <ol className="lp-steps" data-reveal>
          {steps.map(([title, copy], j) => (
            <li key={title} style={vars({ '--j': j })}>
              <span>{j + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RolePreview({ role }: { role: RoleKey }) {
  const { banner, stats, rows } = rolePreview[role];
  return (
    <div className="lp-role-preview">
      <header>
        <span>{roles[role][0]} portal</span>
        <small>ProctorX</small>
      </header>
      <main>
        <div className="lp-role-banner">
          <small>{banner}</small>
          <b>{roles[role][2]}</b>
        </div>
        <div className="lp-role-stats">
          {stats.map(([n, l], j) => (
            <div key={l} style={vars({ '--j': j })}>
              <b>
                <CountUp value={n} delay={150 + j * 80} />
              </b>
              <small>{l}</small>
            </div>
          ))}
        </div>
        <ul className="lp-role-list">
          {rows.map(([title, meta, status, tone], j) => (
            <li key={title} style={vars({ '--j': j })}>
              <span>
                <b>{title}</b>
                <small>{meta}</small>
              </span>
              <Tag tone={tone}>{status}</Tag>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Roles() {
  const [active, setActive] = useState<RoleKey>('dean');
  const [, , title, copy, points] = roles[active];
  return (
    <section className="lp-section" id="roles">
      <div className="lp-container">
        <Heading
          title="Three portals, one system"
          copy="Students, professors and Deans each get a workspace that shows only what they need."
        />
        <div className="lp-roles" data-reveal>
          <div className="lp-tabs" role="tablist" aria-label="Roles">
            {(Object.keys(roles) as RoleKey[]).map((key) => {
              const R = roles[key][1];
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={key === active}
                  className={key === active ? 'active' : ''}
                  onClick={() => setActive(key)}
                >
                  <R size={17} />
                  {roles[key][0]}
                </button>
              );
            })}
          </div>
          <div className="lp-role-body" role="tabpanel">
            {/* keyed by role so the content re-animates on every tab switch */}
            <div className="lp-role-copy" key={`copy-${active}`}>
              <h3>{title}</h3>
              <p>{copy}</p>
              <ul>
                {points.map((p, j) => (
                  <li key={p} style={vars({ '--j': j })}>
                    <Check size={15} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <RolePreview role={active} key={`preview-${active}`} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Institutions() {
  return (
    <section className="lp-section institutions" id="institutions">
      <div className="lp-container lp-institution-grid">
        <Heading
          title="Numbers a Dean can act on"
          copy="See how many sessions ran clean, how many needed review, and which departments need attention. Reports break it down by department and faculty."
        />
        <div className="lp-insight" data-reveal style={vars({ '--i': 1 })}>
          <header>
            <span>
              <small>INSTITUTIONAL INSIGHT</small>
              <b>Sessions by outcome</b>
            </span>
            <em>
              <TrendingUp size={14} />
              12.4% vs last term
            </em>
          </header>
          <OutcomeChart />
          <footer>
            {[
              ['Completed sessions', '184'],
              ['Active examinations', '12'],
              ['Review completion', '96%'],
            ].map(([a, b], j) => (
              <span key={a} style={vars({ '--j': j })}>
                {a}
                <b>
                  <CountUp value={b} delay={700 + j * 100} />
                </b>
              </span>
            ))}
          </footer>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="lp-section muted" id="privacy">
      <div className="lp-container">
        <Heading
          title="What we keep, and what we don’t"
          copy="ProctorX follows the Data Privacy Act of 2012 (RA 10173). It keeps only what a professor needs to review an incident."
        />
        <div className="lp-keep">
          <div data-reveal style={vars({ '--i': 0 })}>
            <h3>Kept</h3>
            <ul>
              {kept.map((item, j) => (
                <li key={item} style={vars({ '--j': j })}>
                  <Check size={16} className="yes" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal style={vars({ '--i': 1 })}>
            <h3>Never kept</h3>
            <ul>
              {neverKept.map((item, j) => (
                <li key={item} style={vars({ '--j': j })}>
                  <X size={16} className="no" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="lp-privacy-note" data-reveal style={vars({ '--i': 2 })}>
          A professor makes every final decision. ProctorX never fails a
          student on its own.
        </p>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="lp-section" id="faq">
      <div className="lp-container lp-faq">
        <Heading title="Common questions" />
        <div className="lp-faq-list" data-reveal>
          {faqs.map(([q, a], j) => (
            <details key={q} style={vars({ '--j': j })}>
              <summary>
                {q}
                <Plus size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({
  openAccess,
  getStarted,
}: {
  openAccess: () => void;
  getStarted: () => void;
}) {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div>
            <Logo />
            <p>
              Modern examination monitoring built for academic integrity,
              clarity, and institutional confidence.
            </p>
          </div>
          <div>
            <b>Product</b>
            <a href="#features">Features</a>
            <a href="#workflow">How it works</a>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <b>Platform</b>
            <a href="#roles">Student</a>
            <a href="#roles">Professor</a>
            <a href="#roles">Dean</a>
          </div>
          <div>
            <b>Institutions</b>
            <a href="#institutions">Overview</a>
            <a href="#privacy">Privacy</a>
            <button onClick={openAccess}>Sign in</button>
            <button onClick={getStarted}>Get started</button>
          </div>
        </div>
        <div className="lp-copyright">
          © {new Date().getFullYear()} ProctorX. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  useReveal();
  const navigate = useNavigate();
  const location = useLocation();
  const [signIn, setSignIn] = useState(false);
  const openAccess = () => setSignIn(true);
  const getStarted = () => navigate('/get-started');
  useEffect(() => {
    if ((location.state as { signIn?: boolean } | null)?.signIn) {
      setSignIn(true);
      navigate('/', { replace: true, state: null });
    }
  }, [location.state, navigate]);
  return (
    <div className="landing-page">
      <Navbar openAccess={openAccess} getStarted={getStarted} />
      <main>
        <Hero getStarted={getStarted} />
        <Features />
        <Workflow />
        <Roles />
        <Institutions />
        <Privacy />
        <Faq />
        <section className="lp-final">
          <div className="lp-container">
            <div data-reveal>
              <h2>
                <TypeText text="Ready to try it with your department?" />
              </h2>
              <p>
                Create an account, add your faculty and students, and schedule
                a practice exam.
              </p>
              <span className="lp-final-cta">
                <Button onClick={getStarted}>
                  Get started <ArrowRight size={17} />
                </Button>
                <button className="lp-btn outline" onClick={openAccess}>
                  Sign in
                </button>
              </span>
            </div>
          </div>
        </section>
      </main>
      <Footer openAccess={openAccess} getStarted={getStarted} />
      <BackToTop />
      <SignInModal open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}
