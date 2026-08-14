import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Lock } from 'lucide-react'
import ProctorXLogo from '../../assets/ProctorX-Logo.png'
import { SignInModal } from '../../components/SignInModal'

// ── Scroll-reveal hook ──────────────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.12 }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

// ── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, suffix: string, inView: boolean, decimals = 0) {
  const [display, setDisplay] = useState('0')
  useEffect(() => {
    if (!inView) return
    let start = 0
    const duration = 1800
    const step = (timestamp: number, startTime: number) => {
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      const current = start + ease * (target - start)
      setDisplay(current.toFixed(decimals))
      if (progress < 1) requestAnimationFrame((t) => step(t, startTime))
      else setDisplay(target.toFixed(decimals) + suffix)
    }
    requestAnimationFrame((t) => step(t, t))
  }, [inView, target, suffix, decimals])
  return display
}

// ── Nav ──────────────────────────────────────────────────────────────────────
function Nav({ onSignIn }: { onSignIn: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = ['Home', 'Features', 'How It Works', 'FAQ']

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled
          ? 'rgba(10, 10, 10, 0.88)'
          : 'rgba(10, 10, 10, 0.0)',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(59,130,246,0.12)' : 'none',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 relative h-18 flex items-center justify-center">
        <div className="absolute inset-y-0 left-0 flex items-center px-4">
          <img src={ProctorXLogo} alt="ProctorX logo" className="h-11 w-auto object-contain" />
        </div>

        <div
          className="hidden md:flex items-center justify-center gap-11"
          style={{ transform: 'translateX(-5px)' }}
        >
          {navLinks.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
              className="text-slate-300 hover:text-blue-300 transition-colors duration-200 text-sm font-medium"
            >
              {link}
            </a>
          ))}
        </div>

        <div className="absolute inset-y-0 right-0 flex items-center gap-3">
          <button
            onClick={onSignIn}
            className="btn-ghost hidden sm:block px-4 py-2 rounded-xl text-sm font-medium text-blue-300 border"
            style={{ borderColor: 'rgba(59,130,246,0.3)' }}
          >
            Sign In
          </button>
          <button className="btn-primary px-5 py-2 rounded-xl text-sm font-semibold text-white">
            Get Started
          </button>
        </div>
      </div>
    </nav>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section
      id="home"
      className="relative min-h-screen flex flex-col items-center overflow-hidden scanline-bg circuit-bg"
      style={{
        background:
          'radial-gradient(circle at bottom center, rgba(59, 130, 246, 0.18) 0%, transparent 45%), #0a0a0a',
      }}
    >
      <div
        className="glow-orb orb-1"
        style={{ width: 500, height: 500, top: '-80px', left: '-100px', background: 'rgba(30, 58, 138, 0.35)' }}
      />
      <div
        className="glow-orb orb-2"
        style={{ width: 400, height: 400, top: '100px', right: '-60px', background: 'rgba(59, 130, 246, 0.2)' }}
      />
      <div
        className="glow-orb orb-3"
        style={{ width: 600, height: 600, bottom: '100px', left: '30%', background: 'rgba(99, 102, 241, 0.12)' }}
      />

      <div className="relative z-10 flex flex-col items-center text-center pt-40 pb-16 px-6 max-w-3xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 reveal"
          style={{
            background: 'rgba(30, 58, 138, 0.4)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            letterSpacing: '0.12em',
            color: '#93C5FD',
          }}
        >
          <Lock size={16} className="text-blue-200" />
          <span>AI-POWERED REMOTE PROCTORING</span>
        </div>

        <h1
          className="reveal reveal-delay-1 mb-6"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 'clamp(2.4rem, 6vw, 4rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            color: '#F8FAFC',
          }}
        >
          Secure Exams,{' '}
          <span className="gradient-text">Anywhere.</span>
          <br />
          Trusted Everywhere.
        </h1>

        <p
          className="reveal reveal-delay-2 mb-10 max-w-xl"
          style={{
            color: '#CBD5E1',
            fontSize: '1.05rem',
            lineHeight: 1.7,
            fontWeight: 400,
          }}
        >
          ProctorX uses real-time AI monitoring, facial recognition, and behavior analytics to deliver secure, scalable online proctoring for institutions and enterprises.
        </p>

        <div className="reveal reveal-delay-3 flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={onSignIn}
            className="btn-primary px-8 py-3.5 rounded-2xl font-semibold text-white flex items-center gap-2"
            style={{ fontSize: '0.95rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Sign In
          </button>
          <button
            className="btn-ghost px-8 py-3.5 rounded-2xl font-semibold text-blue-300 border flex items-center gap-2"
            style={{ borderColor: 'rgba(59,130,246,0.35)', fontSize: '0.95rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
            </svg>
            View Demo
          </button>
        </div>

        <div
          className="reveal reveal-delay-4 mt-8 flex items-center gap-2"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: '#4ADE80',
            letterSpacing: '0.1em',
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: '#4ADE80', boxShadow: '0 0 6px #4ADE80' }}
          />
          {'> SYSTEM SECURE · STATUS: ACTIVE'}
        </div>
      </div>

      <div className="relative z-10 w-full flex justify-center px-6 pb-0">
        <div className="reveal float-anim" style={{ maxWidth: 860, width: '100%' }}>
          <LaptopMockup />
        </div>
      </div>
    </section>
  )
}

function LaptopMockup() {
  return (
    <div className="relative" style={{ perspective: '1200px' }}>
      <div className="mockup-accent accent-a" />
      <div className="mockup-accent accent-b" />
      <div
        style={{
          position: 'absolute',
          bottom: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '70%',
          height: '120px',
          background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.35) 0%, transparent 70%)',
          filter: 'blur(20px)',
          zIndex: 0,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            background: '#0F172A',
            borderRadius: '16px 16px 0 0',
            border: '2px solid #1E293B',
            borderBottom: 'none',
            padding: '10px',
            boxShadow: '0 -4px 60px rgba(59,130,246,0.2), 0 0 80px rgba(59,130,246,0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#334155' }} />
          </div>
          <div
            style={{
              background: '#080D1A',
              borderRadius: '10px',
              overflow: 'hidden',
              aspectRatio: '16/10',
              position: 'relative',
            }}
          >
            <DashboardPreview />
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(180deg, #1E293B, #0F172A)',
            height: '12px',
            borderRadius: '0 0 4px 4px',
            border: '2px solid #1E293B',
            borderTop: 'none',
          }}
        />

        <div
          style={{
            background: 'linear-gradient(180deg, #1a2540, #0F172A)',
            height: '18px',
            borderRadius: '0 0 8px 8px',
            border: '1px solid #1E293B',
            marginTop: '-1px',
          }}
        />
      </div>
    </div>
  )
}

function DashboardPreview() {
  const cams = [
    { name: 'Candidate 01', status: 'ACTIVE', color: '#4ADE80' },
    { name: 'Candidate 02', status: 'ACTIVE', color: '#4ADE80' },
    { name: 'Candidate 03', status: 'ALERT', color: '#FBBF24' },
    { name: 'Candidate 04', status: 'ACTIVE', color: '#4ADE80' },
    { name: 'Candidate 05', status: 'ACTIVE', color: '#4ADE80' },
    { name: 'Candidate 06', status: 'OFFLINE', color: '#EF4444' },
  ]

  return (
    <div style={{ height: '100%', background: '#080D1A', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ color: '#60A5FA', fontWeight: 600, letterSpacing: '0.08em' }}>ProctorX DASHBOARD</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['EXAM: CS-401', 'CANDIDATES: 6', '02:14:33'].map((t, i) => (
            <span
              key={i}
              style={{
                background: 'rgba(30,58,138,0.5)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 4,
                padding: '2px 6px',
                color: '#93C5FD',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {cams.map((cam, i) => (
          <div
            key={i}
            style={{
              background: '#0F172A',
              borderRadius: 6,
              border: `1px solid ${cam.status === 'ALERT' ? 'rgba(251,191,36,0.4)' : 'rgba(30,58,138,0.4)'}`,
              overflow: 'hidden',
              aspectRatio: '4/3',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  cam.status === 'OFFLINE'
                    ? '#0F172A'
                    : `radial-gradient(ellipse at 50% 40%, rgba(${i % 2 === 0 ? '40,80,140' : '30,60,120'},0.8) 0%, #0a0a0a 100%)`,
              }}
            />
            {cam.status !== 'OFFLINE' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(100,140,200,0.5)', marginBottom: 3 }} />
                <div style={{ width: 20, height: 10, borderRadius: '50% 50% 0 0', background: 'rgba(100,140,200,0.3)' }} />
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                bottom: 4,
                left: 4,
                right: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#94A3B8', fontSize: '6px' }}>{cam.name}</span>
              <span style={{ color: cam.color, fontSize: '6px', display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: cam.color, display: 'inline-block' }} />
                {cam.status}
              </span>
            </div>
            {cam.status === 'ALERT' && (
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: 'rgba(251,191,36,0.2)',
                  border: '1px solid rgba(251,191,36,0.5)',
                  borderRadius: 3,
                  padding: '1px 4px',
                  color: '#FBBF24',
                  fontSize: '5px',
                }}
              >
                ANOMALY
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 8,
          padding: '6px 8px',
          background: 'rgba(15,23,42,0.8)',
          borderRadius: 6,
          border: '1px solid rgba(30,58,138,0.3)',
        }}
      >
        {['AI CONFIDENCE: 98.2%', 'FLAGS: 1', 'INTEGRITY SCORE: A+', 'ENCRYPTION: AES-256'].map((item, i) => (
          <span key={i} style={{ color: '#60A5FA', flex: 1, textAlign: 'center' }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Features ─────────────────────────────────────────────────────────────────
function Features() {
  const features = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      ),
      title: 'Real-Time AI Monitoring',
      desc: 'Continuous video and audio analysis powered by deep learning models. Detect suspicious behavior, unusual sounds, and unauthorized materials the moment they occur.',
      gradient: 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M3 20c0-4 3.6-7 9-7s9 3 9 7" />
          <path d="M17 11l1.5 1.5L21 10" />
        </svg>
      ),
      title: 'Facial Recognition',
      desc: 'Multi-point biometric identity verification ensures candidates are who they claim to be. Continuous re-verification throughout the entire exam session.',
      gradient: 'linear-gradient(135deg, #312E81, #6366F1)',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3h7v7H3z" />
          <path d="M14 3h7v7h-7z" />
          <path d="M14 14h7v7h-7z" />
          <path d="M3 14h7v7H3z" />
        </svg>
      ),
      title: 'Behavior Analytics',
      desc: 'Track gaze patterns, keystroke dynamics, mouse movements, and eye-tracking data to build a comprehensive behavioral fingerprint for each candidate.',
      gradient: 'linear-gradient(135deg, #0C4A6E, #0EA5E9)',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      title: 'Secure Data Encryption',
      desc: 'End-to-end AES-256 encryption for all recordings, reports, and candidate data. SOC 2 Type II certified infrastructure with zero-trust architecture.',
      gradient: 'linear-gradient(135deg, #14532D, #22C55E)',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      title: 'Automated Flagging',
      desc: 'AI instantly flags suspicious events with timestamped clips and confidence scores. Reviewers see only what matters — no scrubbing through hours of footage.',
      gradient: 'linear-gradient(135deg, #7C2D12, #F97316)',
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      ),
      title: 'Live Audit Dashboard',
      desc: 'Supervisors monitor all candidates simultaneously on a centralized dashboard. Intervene in real time via live chat or audio channel when required.',
      gradient: 'linear-gradient(135deg, #1E3A8A, #8B5CF6)',
    },
  ]

  return (
    <section id="features" className="relative py-28 px-6 overflow-hidden" style={{ background: '#0a0a0a' }}>
      <div
        className="glow-orb"
        style={{ width: 600, height: 600, top: '0', right: '-100px', background: 'rgba(30,58,138,0.12)', filter: 'blur(100px)' }}
      />
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <div
            className="reveal inline-block mb-4"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              letterSpacing: '0.14em',
              color: '#60A5FA',
            }}
          >
            {'// CORE FEATURES'}
          </div>
          <h2
            className="reveal reveal-delay-1"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              color: '#F8FAFC',
              letterSpacing: '-0.01em',
            }}
          >
            Everything You Need to{' '}
            <span className="gradient-text">Proctor at Scale</span>
          </h2>
          <p
            className="reveal reveal-delay-2 mt-4 max-w-2xl mx-auto"
            style={{ color: '#94A3B8', fontSize: '1rem', lineHeight: 1.7 }}
          >
            Purpose-built AI capabilities designed for the highest-stakes testing environments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className={`feature-card glass-card reveal reveal-delay-${(i % 3) + 1} rounded-2xl p-6`}>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 text-white"
                style={{ background: f.gradient }}
              >
                {f.icon}
              </div>
              <h3
                className="mb-3"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  color: '#E2E8F0',
                  letterSpacing: '0.01em',
                }}
              >
                {f.title}
              </h3>
              <p style={{ color: '#94A3B8', fontSize: '0.88rem', lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      num: '01',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      title: 'Set Up Exam',
      desc: 'Configure your exam parameters, AI sensitivity levels, permitted materials, and time limits in minutes using our intuitive admin dashboard.',
    },
    {
      num: '02',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M3 20c0-4 3.6-7 9-7s9 3 9 7" />
          <polyline points="17 11 19 13 23 9" />
        </svg>
      ),
      title: 'Candidate Verification',
      desc: 'Candidates complete a guided onboarding: ID check, facial biometric enrollment, environment scan, and browser lockdown — all in under 3 minutes.',
    },
    {
      num: '03',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      title: 'AI Monitors in Real Time',
      desc: 'Our AI engine watches every second — detecting gaze deviations, secondary devices, unauthorized persons, and anomalous behavior. Humans review, not micromanage.',
    },
  ]

  return (
    <section
      id="how-it-works"
      className="relative py-28 px-6 overflow-hidden scanline-bg"
      style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #0d1b3e 50%, #0a0a0a 100%)' }}
    >
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <div
            className="reveal inline-block mb-4"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              letterSpacing: '0.14em',
              color: '#60A5FA',
            }}
          >
            {'// PROCESS'}
          </div>
          <h2
            className="reveal reveal-delay-1"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              color: '#F8FAFC',
            }}
          >
            Up and Running in{' '}
            <span className="gradient-text">Three Steps</span>
          </h2>
        </div>

        <div className="relative">
          <div
            className="hidden lg:block absolute top-16 left-0 right-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 10%, rgba(59,130,246,0.3) 30%, rgba(59,130,246,0.3) 70%, transparent 90%)',
              zIndex: 0,
            }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 relative z-10">
            {steps.map((step, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 1} flex flex-col items-center text-center`}>
                <div className="relative mb-6">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
                      boxShadow: '0 0 32px rgba(59,130,246,0.3)',
                    }}
                  >
                    <div className="text-white">{step.icon}</div>
                  </div>
                  <div
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{
                      background: '#0a0a0a',
                      border: '2px solid #3B82F6',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6rem',
                      color: '#60A5FA',
                      fontWeight: 600,
                    }}
                  >
                    {step.num}
                  </div>
                </div>
                <h3
                  className="mb-3"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    color: '#E2E8F0',
                  }}
                >
                  {step.title}
                </h3>
                <p style={{ color: '#94A3B8', fontSize: '0.9rem', lineHeight: 1.7, maxWidth: 280 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Stats ────────────────────────────────────────────────────────────────────
function StatItem({ value, suffix, label, decimals = 0 }: { value: number; suffix: string; label: string; decimals?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const display = useCountUp(value, suffix, inView, decimals)

  return (
    <div ref={ref} className="flex flex-col items-center text-center">
      <div
        className="gradient-text"
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          lineHeight: 1,
          marginBottom: '8px',
        }}
      >
        {inView ? display : `0${suffix}`}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          letterSpacing: '0.18em',
          color: '#94A3B8',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function Stats() {
  return (
    <section className="relative py-20 px-6 overflow-hidden" style={{ background: '#0a0a0a' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), transparent)',
        }}
      />

      <div className="max-w-5xl mx-auto">
        <div className="reveal glass-card rounded-3xl p-12 grid grid-cols-2 lg:grid-cols-4 gap-10" style={{ boxShadow: '0 0 80px rgba(59,130,246,0.08)' }}>
          <StatItem value={99.9} suffix="%" label="UPTIME" decimals={1} />
          <StatItem value={500} suffix="K+" label="EXAMS PROCTORED" />
          <StatItem value={150} suffix="+" label="COUNTRIES" />
          <StatItem value={24} suffix="/7" label="SUPPORT" />
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQ() {
  const faqItems = [
    {
      question: 'How does ProctorX ensure exam integrity?',
      answer:
        'Our platform combines AI monitoring, biometric verification, and randomized checkpoints to identify anomalies while preserving candidate privacy.',
    },
    {
      question: 'Can I use ProctorX with my existing LMS?',
      answer:
        'Yes. ProctorX supports integrations with major LMS platforms via secure APIs and single sign-on workflows.',
    },
    {
      question: 'What kind of data protection standards do you follow?',
      answer:
        'We use encrypted storage, AES-256 data transport, SOC 2 Type II controls, and GDPR-ready processes for sensitive candidate information.',
    },
    {
      question: 'Can candidates take exams on mobile devices?',
      answer:
        'ProctorX is optimized for desktop environments, while mobile devices can be supported with custom configurations for approved use cases.',
    },
    {
      question: 'How quickly can I deploy a new exam?',
      answer:
        'Most customers launch within a day using our guided setup wizards, AI tuning presets, and automated candidate onboarding flows.',
    },
  ]

  const [openIndex, setOpenIndex] = useState(0)
  const toggleItem = (index: number) => setOpenIndex(openIndex === index ? -1 : index)

  return (
    <section id="faq" className="relative py-28 px-6 overflow-hidden" style={{ background: '#0a0a0a' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              letterSpacing: '0.14em',
              color: '#60A5FA',
            }}
          >
            {'// FAQ'}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              color: '#F8FAFC',
            }}
          >
            Frequently Asked Questions
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '1rem', lineHeight: 1.7, marginTop: '1rem' }}>
            Answers to the most common questions about deployment, security, and exam delivery.
          </p>
        </div>

        <div className="space-y-4">
          {faqItems.map((item, index) => {
            const isOpen = openIndex === index
            return (
              <div
                key={item.question}
                className="rounded-3xl border border-slate-800 bg-slate-950/70 backdrop-blur-xl"
              >
                <button
                  id={`faq-button-${index}`}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                  className="w-full flex items-center justify-between gap-4 p-6 text-left"
                  onClick={() => toggleItem(index)}
                >
                  <span style={{ fontFamily: 'var(--font-heading)', color: '#F8FAFC', fontSize: '1.05rem', fontWeight: 600 }}>
                    {item.question}
                  </span>
                  <span
                    className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                    aria-hidden="true"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>
                <div
                  id={`faq-panel-${index}`}
                  role="region"
                  aria-labelledby={`faq-button-${index}`}
                  className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}
                >
                  <div className="px-6 pb-6" style={{ color: '#94A3B8', lineHeight: 1.8 }}>
                    {item.answer}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── CTA Banner ────────────────────────────────────────────────────────────────
function CTABanner() {
  return (
    <section className="relative py-24 px-6 overflow-hidden" style={{ background: '#0a0a0a' }}>
      <div
        className="max-w-4xl mx-auto rounded-3xl reveal overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0d1b3e 0%, #1e3a8a 50%, #1e40af 100%)',
          border: '1px solid rgba(59,130,246,0.3)',
          boxShadow: '0 0 80px rgba(59,130,246,0.2)',
          padding: 'clamp(40px, 6vw, 72px)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(99,102,241,0.2)',
            filter: 'blur(60px)',
          }}
        />
        <div className="relative z-10 text-center">
          <div
            className="inline-block mb-4"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              letterSpacing: '0.14em',
              color: '#93C5FD',
            }}
          >
            {'> READY TO DEPLOY'}
          </div>
          <h2
            className="mb-4"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
              color: 'white',
            }}
          >
            Start Proctoring With Confidence
          </h2>
          <p className="mb-10 max-w-xl mx-auto" style={{ color: '#93C5FD', fontSize: '0.95rem', lineHeight: 1.7 }}>
            Join 1,200+ institutions delivering tamper-proof exams at scale.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              className="btn-primary px-8 py-3.5 rounded-2xl font-semibold text-white"
              style={{ background: 'white', color: '#1E3A8A', fontSize: '0.95rem' }}
            >
              Request a Demo
            </button>
            <button
              className="btn-ghost px-8 py-3.5 rounded-2xl font-semibold text-white border"
              style={{ borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.95rem' }}
            >
              Learn More
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  const productLinks = ['Features', 'Integrations', 'API Docs', 'Security', 'Status']
  const companyLinks = ['About', 'Blog', 'Careers', 'Press', 'Partners', 'Contact']
  const legalLinks = ['Privacy Policy', 'Terms of Service', 'GDPR', 'Cookie Policy']

  return (
    <footer
      className="relative pt-16 pb-8 px-6 overflow-hidden"
      style={{
        background: '#080D1A',
        borderTop: '1px solid rgba(30,58,138,0.25)',
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12" style={{ borderBottom: '1px solid rgba(30,58,138,0.2)' }}>
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)' }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1.5L14.5 4.5V9C14.5 12.3 12 15.3 9 16.5C6 15.3 3.5 12.3 3.5 9V4.5L9 1.5Z" stroke="white" strokeWidth="1.5" fill="none" />
                  <circle cx="9" cy="9" r="2" fill="white" />
                </svg>
              </div>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#F8FAFC' }}>ProctorX</span>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: '20px' }}>
              The world&apos;s most trusted AI-powered exam proctoring platform. Secure. Scalable. Impartial.
            </p>
            <div className="flex gap-3">
              {['twitter', 'linkedin', 'github', 'youtube'].map((s) => (
                <a
                  key={s}
                  href="#"
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110"
                  style={{ background: 'rgba(30,58,138,0.3)', border: '1px solid rgba(59,130,246,0.2)', color: '#60A5FA' }}
                >
                  <SocialIcon name={s} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4
              className="mb-5"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.14em', color: '#60A5FA', textTransform: 'uppercase' }}
            >
              Product
            </h4>
            <ul className="space-y-3">
              {productLinks.map((l) => (
                <li key={l}>
                  <a href="#" style={{ color: '#94A3B8', fontSize: '0.88rem' }} className="hover:text-blue-300 transition-colors">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4
              className="mb-5"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.14em', color: '#60A5FA', textTransform: 'uppercase' }}
            >
              Company
            </h4>
            <ul className="space-y-3">
              {companyLinks.map((l) => (
                <li key={l}>
                  <a href="#" style={{ color: '#94A3B8', fontSize: '0.88rem' }} className="hover:text-blue-300 transition-colors">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4
              className="mb-5"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.14em', color: '#60A5FA', textTransform: 'uppercase' }}
            >
              Legal
            </h4>
            <ul className="space-y-3">
              {legalLinks.map((l) => (
                <li key={l}>
                  <a href="#" style={{ color: '#94A3B8', fontSize: '0.88rem' }} className="hover:text-blue-300 transition-colors">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex gap-2 flex-wrap">
              {['SOC 2', 'ISO 27001', 'GDPR'].map((badge) => (
                <span
                  key={badge}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.58rem',
                    padding: '3px 7px',
                    borderRadius: 4,
                    background: 'rgba(30,58,138,0.3)',
                    border: '1px solid rgba(59,130,246,0.25)',
                    color: '#60A5FA',
                    letterSpacing: '0.06em',
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: '#94A3B8',
              letterSpacing: '0.06em',
            }}
          >
            © 2025 ProctorX, Inc. — ALL RIGHTS RESERVED
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: '#94A3B8',
              letterSpacing: '0.04em',
            }}
          >
            BUILT WITH AES-256 · ZERO-TRUST · SOC 2 TYPE II
          </div>
        </div>
      </div>
    </footer>
  )
}

function SocialIcon({ name }: { name: string }) {
  const icons: Record<string, ReactElement> = {
    twitter: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    linkedin: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
    github: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
    youtube: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  }
  return icons[name] || null
}

export default function LandingPage() {
  useReveal()
  const [signInOpen, setSignInOpen] = useState(false)

  return (
    <div className="bg-[var(--color-space-black)] min-h-screen text-white">
      <Nav onSignIn={() => setSignInOpen(true)} />
      <Hero onSignIn={() => setSignInOpen(true)} />
      <Features />
      <HowItWorks />
      <Stats />
      <FAQ />
      <CTABanner />
      <Footer />
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  )
}
