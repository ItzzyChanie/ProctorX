import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
  UserRoundCog,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { User } from '../../types';
import { useQueryClient } from '@tanstack/react-query';
import proctorXLogo from '../../assets/ProctorX-Logo.png';
import './GetStartedPage.css';

type FormData = {
  institutionName: string;
  collegeDepartmentName: string;
  schoolType: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  officialTitle: string;
  email: string;
  password: string;
  confirmPassword: string;
  authorityConfirmed: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
};

type InstitutionSuggestion = {
  name: string;
  country: string | null;
  domain: string | null;
};

type Application = {
  referenceNumber: string;
  email: string;
  institutionName: string;
  status: 'EMAIL_VERIFICATION_PENDING' | 'PENDING_REVIEW' | 'APPROVED';
};

const initialForm: FormData = {
  institutionName: '',
  collegeDepartmentName: '',
  schoolType: '',
  firstName: '',
  lastName: '',
  employeeId: '',
  officialTitle: '',
  email: '',
  password: '',
  confirmPassword: '',
  authorityConfirmed: false,
  termsAccepted: false,
  privacyAccepted: false,
};

const errorMessage = (error: unknown, fallback: string) =>
  axios.isAxiosError(error)
    ? !error.response
      ? 'ProctorX could not reach the server. Make sure the backend is running on port 4000, then try again.'
      : Array.isArray(error.response?.data?.message)
      ? error.response.data.message[0]
      : error.response?.data?.message || fallback
    : fallback;

export default function GetStartedPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [application, setApplication] = useState<Application | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [institutionSuggestions, setInstitutionSuggestions] = useState<InstitutionSuggestion[]>([]);
  const [institutionSearching, setInstitutionSearching] = useState(false);
  const [institutionSearchOpen, setInstitutionSearchOpen] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState('');

  useEffect(() => {
    if (!resendSeconds) return;
    const timer = window.setInterval(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    const query = form.institutionName.trim();
    if (step !== 1 || query.length < 2 || query === selectedInstitution) {
      setInstitutionSuggestions([]);
      setInstitutionSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setInstitutionSearching(true);
      try {
        const { data } = await api.get<InstitutionSuggestion[]>(
          '/auth/institutions/search',
          { params: { q: query }, signal: controller.signal },
        );
        setInstitutionSuggestions(data);
        setInstitutionSearchOpen(true);
      } catch (requestError) {
        if (!axios.isCancel(requestError)) setInstitutionSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setInstitutionSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.institutionName, selectedInstitution, step]);
  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const passwordChecks = useMemo(
    () => [
      form.password.length >= 8,
      /[A-Z]/.test(form.password),
      /[a-z]/.test(form.password),
      /\d/.test(form.password),
    ],
    [form.password]
  );

  const nextFromInstitution = () => {
    if (
      !form.institutionName.trim() ||
      !form.collegeDepartmentName.trim() ||
      !form.schoolType
    ) {
      setError('Complete all institution details before continuing.');
      return;
    }
    setError('');
    setStep(2);
    window.scrollTo(0, 0);
  };

  const nextFromAdministrator = () => {
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.employeeId.trim() ||
      !form.officialTitle.trim() ||
      !form.email.trim()
    ) {
      setError('Complete all required administrator details.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Enter a valid official institutional email address.');
      return;
    }
    if (!passwordChecks.every(Boolean)) {
      setError('Use a password that meets all security requirements.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setStep(3);
    window.scrollTo(0, 0);
  };

  const submit = async () => {
    if (
      !form.authorityConfirmed ||
      !form.termsAccepted ||
      !form.privacyAccepted
    ) {
      setError('Accept all confirmations and agreements before submitting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { confirmPassword: _confirmPassword, ...payload } = form;
      const { data } = await api.post<Application & { user: User }>(
        '/auth/institution-registration',
        payload
      );
      setApplication(data);
      setStep(4);
      setResendSeconds(60);
      window.scrollTo(0, 0);
    } catch (requestError) {
      setError(
        errorMessage(
          requestError,
          'We could not submit your application. Please try again.'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!application || !/^\d{6}$/.test(code)) {
      setError('Enter the complete six-digit verification code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<Application & { user: User }>(
        '/auth/institution-registration/verify',
        {
          referenceNumber: application.referenceNumber,
          code,
        }
      );
      setApplication(data);
      queryClient.clear();
      setAuth(data.user);
      navigate('/dean', { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, 'The code could not be verified.'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!application || resendSeconds) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/institution-registration/resend', {
        referenceNumber: application.referenceNumber,
      });
      setCode('');
      setResendSeconds(60);
    } catch (requestError) {
      setError(errorMessage(requestError, 'A new code could not be sent.'));
    } finally {
      setBusy(false);
    }
  };

  const labels = ['Institution', 'Administrator', 'Review', 'Verify'];

  return (
    <div className="gs-page">
      <header className="gs-header">
        <button
          className="gs-logo"
          onClick={() => navigate('/')}
          aria-label="ProctorX home"
        >
          <img src={proctorXLogo} alt="ProctorX" />
        </button>
        <div className="gs-header-actions">
          <span>Already have an account?</span>
          <button
            className="gs-text-button"
            onClick={() => navigate('/', { state: { signIn: true } })}
          >
            Sign in
          </button>
        </div>
      </header>

      <main className="gs-shell">
        <aside className="gs-aside">
          <div className="gs-aside-icon">
            <ShieldCheck size={23} />
          </div>
          <p className="gs-eyebrow">Institution onboarding</p>
          <h1>Bring trusted exam oversight to your institution.</h1>
          <p className="gs-aside-copy">
            This registration is for an authorized Dean or designated academic
            administrator. Faculty and student accounts can be created after
            email verification.
          </p>
          <div className="gs-assurance-list">
            <span>
              <CheckCircle2 size={17} /> Official email verification
            </span>
            <span>
              <CheckCircle2 size={17} /> Immediate access after verification
            </span>
            <span>
              <CheckCircle2 size={17} /> Role-based account management
            </span>
          </div>
          <div className="gs-role-note">
            <UserRoundCog size={19} />
            <div>
              <b>Institution Administrator</b>
              <small>Displayed as Dean in the ProctorX portal</small>
            </div>
          </div>
        </aside>

        <section className="gs-card">
          {step < 5 && (
            <div className="gs-progress" aria-label={`Step ${step} of 4`}>
              {labels.map((label, index) => {
                const number = index + 1;
                return (
                  <div
                    className={
                      number === step ? 'active' : number < step ? 'done' : ''
                    }
                    key={label}
                  >
                    <span>{number < step ? <Check size={14} /> : number}</span>
                    <small>{label}</small>
                  </div>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="gs-title">
                <Building2 size={21} />
                <div>
                  <p>Step 1 of 4</p>
                  <h2>Tell us about your institution</h2>
                  <span>
                    Use the official names your school uses in academic records.
                  </span>
                </div>
              </div>
              <div className="gs-form">
                <div className="gs-field full gs-institution-field">
                  <label htmlFor="institution-name">
                    Institution or university name <b>*</b>
                  </label>
                  <input
                    id="institution-name"
                    autoFocus
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={institutionSearchOpen}
                    aria-controls="institution-suggestions"
                    autoComplete="off"
                    value={form.institutionName}
                    onFocus={() => setInstitutionSearchOpen(true)}
                    onBlur={() =>
                      window.setTimeout(() => setInstitutionSearchOpen(false), 120)
                    }
                    onChange={(e) => {
                      setSelectedInstitution('');
                      setInstitutionSearchOpen(true);
                      set('institutionName', e.target.value);
                    }}
                    placeholder="Start typing your school name"
                    maxLength={160}
                  />
                  {institutionSearchOpen && form.institutionName.trim().length >= 2 && (
                    <div
                      id="institution-suggestions"
                      className="gs-institution-suggestions"
                      role="listbox"
                    >
                      {institutionSearching ? (
                        <div className="gs-institution-message">Searching institutions…</div>
                      ) : institutionSuggestions.length ? (
                        institutionSuggestions.map((institution) => (
                          <button
                            key={`${institution.name}-${institution.country ?? ''}`}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              set('institutionName', institution.name);
                              setSelectedInstitution(institution.name);
                              setInstitutionSearchOpen(false);
                              setInstitutionSuggestions([]);
                            }}
                          >
                            <b>{institution.name}</b>
                            {(institution.country || institution.domain) && (
                              <small>
                                {[institution.country, institution.domain]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="gs-institution-message">
                          No directory match. Keep your exact school name as entered.
                        </div>
                      )}
                    </div>
                  )}
                  <small>
                    Select a directory suggestion, or keep typing to use the school’s exact official name.
                  </small>
                </div>
                <label className="gs-field full">
                  <span>
                    College or department name <b>*</b>
                  </span>
                  <input
                    value={form.collegeDepartmentName}
                    onChange={(e) =>
                      set('collegeDepartmentName', e.target.value)
                    }
                    placeholder="e.g. College of Computer Studies"
                    maxLength={160}
                  />
                </label>
                <label className="gs-field full">
                  <span>
                    School type <b>*</b>
                  </span>
                  <select
                    value={form.schoolType}
                    onChange={(e) => set('schoolType', e.target.value)}
                  >
                    <option value="">Select school type</option>
                    <option value="UNIVERSITY">University</option>
                    <option value="COLLEGE">College</option>
                    <option value="STATE_UNIVERSITY">State University</option>
                  </select>
                </label>
              </div>
              {error && (
                <div className="gs-error" role="alert">
                  {error}
                </div>
              )}
              <div className="gs-actions right">
                <button className="gs-primary" onClick={nextFromInstitution}>
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="gs-title">
                <UserRoundCog size={21} />
                <div>
                  <p>Step 2 of 4</p>
                  <h2>Create the administrator profile</h2>
                  <span>
                    Use the authorized representative’s official institutional
                    details.
                  </span>
                </div>
              </div>
              <div className="gs-form">
                <label className="gs-field">
                  <span>
                    First name <b>*</b>
                  </span>
                  <input
                    autoFocus
                    value={form.firstName}
                    onChange={(e) => set('firstName', e.target.value)}
                    placeholder="First name"
                    maxLength={80}
                  />
                </label>
                <label className="gs-field">
                  <span>
                    Last name <b>*</b>
                  </span>
                  <input
                    value={form.lastName}
                    onChange={(e) => set('lastName', e.target.value)}
                    placeholder="Last name"
                    maxLength={80}
                  />
                </label>
                <label className="gs-field">
                  <span>
                    Employee ID <b>*</b>
                  </span>
                  <input
                    value={form.employeeId}
                    onChange={(e) => set('employeeId', e.target.value)}
                    placeholder="e.g. EMP-00124"
                    maxLength={80}
                  />
                  <small>
                    This becomes your primary username and appears in the topbar.
                  </small>
                </label>
                <label className="gs-field">
                  <span>
                    Official title or position <b>*</b>
                  </span>
                  <input
                    value={form.officialTitle}
                    onChange={(e) => set('officialTitle', e.target.value)}
                    placeholder="e.g. Dean, Professor"
                    maxLength={120}
                  />
                  <small>
                    This title appears below your name in the topbar.
                  </small>
                </label>
                <label className="gs-field full">
                  <span>
                    Department or official institutional email <b>*</b>
                  </span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="dean@university.edu"
                    maxLength={320}
                  />
                  <small>
                    You can use either this email or your Employee ID to sign in.
                  </small>
                </label>
                <label className="gs-field">
                  <span>
                    Password <b>*</b>
                  </span>
                  <div className="gs-password">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => set('password', e.target.value)}
                      placeholder="Create a secure password"
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((show) => !show)}
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
                <label className="gs-field">
                  <span>
                    Confirm password <b>*</b>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => set('confirmPassword', e.target.value)}
                    placeholder="Repeat your password"
                    maxLength={128}
                  />
                </label>
                <div className="gs-password-rules full">
                  {[
                    'At least 8 characters',
                    'One uppercase letter',
                    'One lowercase letter',
                    'One number',
                  ].map((label, index) => (
                    <span
                      className={passwordChecks[index] ? 'met' : ''}
                      key={label}
                    >
                      <Check size={12} /> {label}
                    </span>
                  ))}
                </div>
              </div>
              {error && (
                <div className="gs-error" role="alert">
                  {error}
                </div>
              )}
              <div className="gs-actions">
                <button className="gs-secondary" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button className="gs-primary" onClick={nextFromAdministrator}>
                  Review application <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="gs-title">
                <ShieldCheck size={21} />
                <div>
                  <p>Step 3 of 4</p>
                  <h2>Review and confirm</h2>
                  <span>
                    Confirm the application details and required security
                    agreements.
                  </span>
                </div>
              </div>
              <div className="gs-review">
                <div>
                  <small>Institution</small>
                  <b>{form.institutionName}</b>
                  <span>
                    {form.collegeDepartmentName} ·{' '}
                    {form.schoolType.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
                <div>
                  <small>Institution administrator</small>
                  <b>
                    {form.firstName} {form.lastName}
                  </b>
                  <span>
                    {form.officialTitle}
                    {form.employeeId ? ` · ${form.employeeId}` : ''}
                  </span>
                </div>
                <div>
                  <small>Verification email</small>
                  <b>{form.email}</b>
                  <span>A six-digit code will be sent to this address.</span>
                </div>
              </div>
              <div className="gs-consents">
                <label>
                  <input
                    type="checkbox"
                    checked={form.authorityConfirmed}
                    onChange={(e) =>
                      set('authorityConfirmed', e.target.checked)
                    }
                  />
                  <span>
                    <b>Authority confirmation</b>I confirm that I am authorized
                    to represent this institution and submit this application.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.termsAccepted}
                    onChange={(e) => set('termsAccepted', e.target.checked)}
                  />
                  <span>
                    <b>Terms of service</b>I agree to the ProctorX Terms of
                    Service for institutional use.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.privacyAccepted}
                    onChange={(e) => set('privacyAccepted', e.target.checked)}
                  />
                  <span>
                    <b>Privacy and verification</b>I accept the Privacy Policy
                    and understand that institutional information may be
                    verified.
                  </span>
                </label>
              </div>
              <div className="gs-security-note">
                <LockKeyhole size={18} />
                <span>
                  <b>Your information is protected.</b> Passwords and
                  verification codes are securely hashed. Your Dean workspace
                  becomes available after the institutional email is verified.
                </span>
              </div>
              {error && (
                <div className="gs-error" role="alert">
                  {error}
                </div>
              )}
              <div className="gs-actions">
                <button
                  className="gs-secondary"
                  disabled={busy}
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button className="gs-primary" disabled={busy} onClick={submit}>
                  {busy ? 'Sending code…' : 'Submit and verify email'}{' '}
                  {!busy && <ArrowRight size={16} />}
                </button>
              </div>
            </>
          )}

          {step === 4 && application && (
            <div className="gs-centered">
              <div className="gs-large-icon">
                <MailCheck size={30} />
              </div>
              <p className="gs-eyebrow">Step 4 of 4</p>
              <h2>Verify your institutional email</h2>
              <p>
                We sent a six-digit code to <b>{application.email}</b>. Enter it
                below within 10 minutes.
              </p>
              <label className="gs-code-label">
                <span>Verification code</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  placeholder="000000"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void verify();
                  }}
                />
              </label>
              {error && (
                <div className="gs-error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="gs-primary gs-wide"
                disabled={busy || code.length !== 6}
                onClick={verify}
              >
                {busy ? 'Verifying…' : 'Verify email'}{' '}
                {!busy && <ArrowRight size={16} />}
              </button>
              <button
                className="gs-resend"
                disabled={busy || resendSeconds > 0}
                onClick={resend}
              >
                {resendSeconds
                  ? `Resend code in ${resendSeconds}s`
                  : 'Resend verification code'}
              </button>
              <small className="gs-reference">
                Application reference: {application.referenceNumber}
              </small>
            </div>
          )}

          {step === 5 && application && (
            <div className="gs-centered gs-success">
              <div className="gs-large-icon success">
                <CheckCircle2 size={34} />
              </div>
              <p className="gs-eyebrow">Email verified</p>
              <h2>Your account is ready</h2>
              <p>
                The Dean account for <b>{application.institutionName}</b> is
                active and ready to use.
              </p>
              <div className="gs-reference-card">
                <span>Application reference</span>
                <strong>{application.referenceNumber}</strong>
                <small>Keep this number for future correspondence.</small>
              </div>
              <button
                className="gs-primary gs-wide"
                onClick={() => navigate('/dean')}
              >
                Enter Dean dashboard <ArrowRight size={16} />
              </button>
            </div>
          )}
        </section>
      </main>
      <footer className="gs-footer">
        <span>© {new Date().getFullYear()} ProctorX</span>
        <span>
          <KeyRound size={14} /> Secure institutional onboarding
        </span>
      </footer>
    </div>
  );
}
