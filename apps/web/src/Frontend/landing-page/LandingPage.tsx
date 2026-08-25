import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarCheck2,
  Check,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Menu,
  ScanEye,
  ShieldCheck,
  TrendingUp,
  Users,
  Video,
  X,
  ArrowUp,
} from 'lucide-react';
import { SignInModal } from '../../components/SignInModal';
import proctorXLogo from '../../assets/ProctorX-Logo.png';
import './LandingPage.css';

const nav = [
  ['Features', '#features'],
  ['How it works', '#workflow'],
  ['For institutions', '#institutions'],
  ['Roles', '#roles'],
] as const;
const steps: [string, string, LucideIcon][] = [
  [
    'Set up the institution',
    'Configure departments, faculty access, and institutional settings.',
    Building2,
  ],
  [
    'Create and schedule exams',
    'Professors set exam details, requirements, and monitoring rules.',
    CalendarCheck2,
  ],
  [
    'Students take their exams',
    'Students join assigned sessions with clear status and instructions.',
    GraduationCap,
  ],
  [
    'Monitor and review',
    'Review live sessions, detected events, timestamps, and evidence.',
    ScanEye,
  ],
  [
    'Understand the bigger picture',
    'Dean-level insights help institutions identify patterns over time.',
    TrendingUp,
  ],
];
const roles = {
  student: [
    'Student',
    GraduationCap,
    'A clear, focused exam experience',
    'Students always know what comes next—from requirements and schedules to in-session warnings.',
    [
      'Upcoming exams and schedules',
      'Clear device and session requirements',
      'Simple status, instructions, and warnings',
    ],
  ],
  professor: [
    'Professor',
    BookOpenCheck,
    'Manage every exam with confidence',
    'Create examinations, observe active sessions, and review organized evidence from one workspace.',
    [
      'Exam creation and scheduling',
      'Live student session monitoring',
      'Evidence and violation review',
    ],
  ],
  dean: [
    'Dean',
    Building2,
    'Institution-wide visibility',
    'See examination activity, faculty insights, and academic integrity trends across departments.',
    [
      'Centralized academic overview',
      'Department and faculty insights',
      'Institutional reports and trends',
    ],
  ],
} as const;
type RoleKey = keyof typeof roles;

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach((item) => item.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        }),
      { threshold: 0.1 }
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
}
function Logo() {
  return (
    <a className="lp-logo" href="#top" aria-label="ProctorX home">
      <img src={proctorXLogo} alt="ProctorX" />
    </a>
  );
}
function Button({
  children,
  secondary,
  onClick,
}: {
  children: React.ReactNode;
  secondary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`lp-btn ${secondary ? 'secondary' : 'primary'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Navbar({ openAccess }: { openAccess: () => void }) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 72);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <header className={`lp-nav-wrap ${scrolled ? 'scrolled' : 'at-top'}`}>
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
          <Button onClick={openAccess}>
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
          <Button onClick={openAccess}>
            Get started <ArrowRight size={15} />
          </Button>
        </div>
      )}
    </header>
  );
}

function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 520);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
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
function Chart() {
  return (
    <div className="lp-chart">
      {[38, 55, 45, 70, 61, 84, 72, 94].map((h, i) => (
        <span key={i} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
function DashboardPreview() {
  return (
    <div className="lp-preview-stage" data-reveal>
      <div className="lp-preview">
        <div className="lp-float left">
          <Video size={15} />
          <span>
            <b>24</b>
            <small>Active sessions</small>
          </span>
        </div>
        <div className="lp-float right">
          <Check size={15} />
          <span>
            <b>98%</b>
            <small>Sessions completed</small>
          </span>
        </div>
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
              {[LayoutDashboard, BarChart3, Building2, Users, FileCheck2].map(
                (Icon, i) => (
                  <span className={i === 0 ? 'active' : ''} key={i}>
                    <Icon size={14} />
                    {
                      [
                        'Dashboard',
                        'Analytics',
                        'Departments',
                        'Students',
                        'Reports',
                      ][i]
                    }
                  </span>
                )
              )}
            </aside>
            <main>
              <header>
                <div>
                  <small>Dean portal</small>
                  <h3>Academic integrity overview</h3>
                </div>
                <em>School of Computer Studies</em>
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
                  4.8%<small>Incident rate</small>
                </strong>
              </section>
              <div className="lp-kpis">
                {[
                  ['184', 'Monitored sessions'],
                  ['2,460', 'Students monitored'],
                  ['118', 'Flagged events'],
                  ['12', 'Active exams'],
                ].map(([n, l]) => (
                  <div key={l}>
                    <b>{n}</b>
                    <small>{l}</small>
                  </div>
                ))}
              </div>
              <div className="lp-dash-lower">
                <article>
                  <header>
                    <b>Weekly exam activity</b>
                    <small>Last 8 weeks</small>
                  </header>
                  <Chart />
                </article>
                <article>
                  <header>
                    <b>Recent activity</b>
                    <small>Today</small>
                  </header>
                  {['Calculus II', 'Data Structures', 'Research Methods'].map(
                    (x, i) => (
                      <p key={x}>
                        <i className={i === 2 ? 'warn' : ''} />
                        <span>
                          <b>{x}</b>
                          <small>
                            {i === 1
                              ? 'In progress'
                              : i === 2
                                ? 'Review'
                                : 'Completed'}
                          </small>
                        </span>
                        <ChevronRight size={12} />
                      </p>
                    )
                  )}
                </article>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="lp-heading" data-reveal>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}
function Hero({ openAccess }: { openAccess: () => void }) {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-container">
        <div className="lp-hero-copy">
          <span className="lp-pill">
            <ShieldCheck size={15} /> Trusted academic monitoring, in one
            platform
          </span>
          <h1>
            The Examination Platform
            <br />
            <span>Your Institution Needs</span>
          </h1>
          <p>
            ProctorX brings exam setup, live monitoring, structured evidence,
            and institution-wide insights into one clear academic workspace.
          </p>
          <div>
            <Button onClick={openAccess}>
              Get started <ArrowRight size={17} />
            </Button>
            <a className="lp-btn secondary" href="#workflow">
              See how it works <ChevronRight size={17} />
            </a>
          </div>
          <small>
            <Check size={14} /> Built for students, professors, and academic
            leaders
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
          eyebrow="Everything you need"
          title="One Platform. Every Tool Your Institution Needs."
          copy="Replace disconnected examination workflows with one focused platform for setup, monitoring, evidence, and oversight."
        />
        <div className="lp-bento">
          <article className="lp-card large" data-reveal>
            <Icon icon={ScanEye} />
            <h3>Real-time exam monitoring</h3>
            <p>
              Give professors an organized view of active examination sessions
              and student status.
            </p>
            <div className="lp-students">
              {[
                ['JR', 'J. Reyes', 'In session'],
                ['AM', 'A. Mendoza', 'In session'],
                ['CL', 'C. Lim', 'Attention needed'],
              ].map(([a, b, c], i) => (
                <div key={b}>
                  <i>{a}</i>
                  <b>{b}</b>
                  <small className={i === 2 ? 'warn' : ''}>{c}</small>
                </div>
              ))}
            </div>
          </article>
          <article className="lp-card" data-reveal>
            <Icon icon={Activity} />
            <h3>Intelligent event detection</h3>
            <p>
              Surface activity that may need review without taking the final
              decision away from educators.
            </p>
            <div className="lp-event">
              <Eye size={16} />
              <span>
                <b>Attention shift detected</b>
                <small>10:42:18 · Review requested</small>
              </span>
            </div>
          </article>
          <article className="lp-card" data-reveal>
            <Icon icon={FileCheck2} />
            <h3>Evidence-based review</h3>
            <p>
              Keep events, timestamps, and supporting records together in a
              structured timeline.
            </p>
            <div className="lp-timeline">
              <i />
              <i />
              <i />
            </div>
          </article>
          <article className="lp-card wide" data-reveal>
            <div>
              <Icon icon={LayoutDashboard} />
              <h3>Centralized exam management</h3>
              <p>
                Create, schedule, monitor, and review examinations from one
                interface.
              </p>
            </div>
            <div className="lp-schedule">
              <small>MONDAY · MAY 18</small>
              <p>
                <span>09:00</span>
                <b>Introduction to Computing</b>
              </p>
              <p>
                <span>13:30</span>
                <b>Data Structures</b>
              </p>
            </div>
          </article>
          <article className="lp-card" data-reveal>
            <Icon icon={BarChart3} />
            <h3>Institution-level insight</h3>
            <p>
              Help Deans understand examination activity and academic integrity
              trends across departments.
            </p>
            <Chart />
          </article>
        </div>
      </div>
    </section>
  );
}
function Icon({ icon: I }: { icon: LucideIcon }) {
  return (
    <span className="lp-icon">
      <I size={20} />
    </span>
  );
}
function Workflow() {
  return (
    <section className="lp-section muted" id="workflow">
      <div className="lp-container">
        <Heading
          eyebrow="How it works"
          title="A clear path from setup to insight"
          copy="ProctorX keeps the examination workflow connected for administrators, professors, and students."
        />
        <div className="lp-workflow">
          {steps.map(([title, copy, I], i) => (
            <article key={title} data-reveal>
              <em>{String(i + 1).padStart(2, '0')}</em>
              <Icon icon={I} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
function RolePreview({ role }: { role: RoleKey }) {
  const stats =
    role === 'student'
      ? [
          ['3', 'Upcoming'],
          ['12', 'Completed'],
          ['Ready', 'Status'],
        ]
      : role === 'professor'
        ? [
            ['6', 'Active exams'],
            ['128', 'Students'],
            ['9', 'For review'],
          ]
        : [
            ['184', 'Sessions'],
            ['2,460', 'Students'],
            ['4.8%', 'Incident rate'],
          ];
  return (
    <div className="lp-role-preview">
      <header>
        <span>{roles[role][0]} portal</span>
        <small>ProctorX</small>
      </header>
      <main>
        <div className="lp-role-banner">
          <small>
            {role === 'dean'
              ? 'INSTITUTION OVERVIEW'
              : role === 'professor'
                ? 'EXAM MANAGEMENT'
                : 'MY EXAMINATIONS'}
          </small>
          <b>{roles[role][2]}</b>
        </div>
        <div className="lp-role-stats">
          {stats.map(([n, l]) => (
            <div key={l}>
              <b>{n}</b>
              <small>{l}</small>
            </div>
          ))}
        </div>
        <div className="lp-lines">
          <i />
          <i />
          <i />
        </div>
      </main>
    </div>
  );
}
function Roles() {
  const [active, setActive] = useState<RoleKey>('dean');
  const [, I, title, copy, points] = roles[active];
  return (
    <section className="lp-section" id="roles">
      <div className="lp-container">
        <Heading
          eyebrow="One connected platform"
          title="Designed around every academic role"
          copy="Each workspace stays focused on the responsibilities and information that matter most."
        />
        <div className="lp-roles" data-reveal>
          <div className="lp-tabs">
            {(Object.keys(roles) as RoleKey[]).map((key) => {
              const R = roles[key][1];
              return (
                <button
                  key={key}
                  className={key === active ? 'active' : ''}
                  onClick={() => setActive(key)}
                >
                  <R size={17} />
                  {roles[key][0]}
                </button>
              );
            })}
          </div>
          <div className="lp-role-body">
            <div>
              <Icon icon={I} />
              <h3>{title}</h3>
              <p>{copy}</p>
              <ul>
                {points.map((p) => (
                  <li key={p}>
                    <Check size={15} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <RolePreview role={active} />
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
        <div data-reveal>
          <span className="lp-pill">For institutions</span>
          <h2>Designed for modern academic institutions</h2>
          <p>
            Bring examination monitoring, structured review, and
            institution-level visibility into one consistent system.
          </p>
          <div className="lp-checks">
            {[
              'Centralized administration',
              'Clear accountability',
              'Role-based access',
              'Structured evidence',
              'Institutional analytics',
              'Scalable exam management',
            ].map((x) => (
              <span key={x}>
                <Check size={15} />
                {x}
              </span>
            ))}
          </div>
        </div>
        <div className="lp-insight" data-reveal>
          <header>
            <span>
              <small>INSTITUTIONAL INSIGHT</small>
              <b>Monitoring overview</b>
            </span>
            <em>
              <TrendingUp size={14} />
              12.4%
            </em>
          </header>
          <Chart />
          <footer>
            {[
              ['Completed sessions', '184'],
              ['Active examinations', '12'],
              ['Review completion', '96%'],
            ].map(([a, b]) => (
              <span key={a}>
                {a}
                <b>{b}</b>
              </span>
            ))}
          </footer>
        </div>
      </div>
    </section>
  );
}
function Footer({ openAccess }: { openAccess: () => void }) {
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
            <button onClick={openAccess}>Sign in</button>
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
            <button onClick={openAccess}>Get started</button>
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
  const [signIn, setSignIn] = useState(false);
  const openAccess = () => setSignIn(true);
  return (
    <div className="landing-page">
      <Navbar openAccess={openAccess} />
      <main>
        <Hero openAccess={openAccess} />
        <div className="lp-values">
          <div className="lp-container">
            {[
              [Building2, 'Institution ready'],
              [Activity, 'Real-time monitoring'],
              [ClipboardCheck, 'Evidence-based review'],
              [Users, 'Role-based management'],
            ].map(([I, x]) => (
              <span key={x as string}>
                <I size={18} />
                {x as string}
              </span>
            ))}
          </div>
        </div>
        <Features />
        <Workflow />
        <Roles />
        <Institutions />
        <section className="lp-final">
          <div className="lp-container">
            <div data-reveal>
              <ShieldCheck size={25} />
              <h2>Build a more transparent examination environment.</h2>
              <p>
                Start setting up ProctorX for your institution and bring every
                part of exam monitoring into one clear platform.
              </p>
              <span>
                <Button onClick={openAccess}>
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
      <Footer openAccess={openAccess} />
      <BackToTop />
      <SignInModal open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}
