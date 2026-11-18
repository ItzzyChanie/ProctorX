import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

type Props = {
  url: string;
  title: string;
  submitting: boolean;
  /** Called just before the form opens in a new tab, so it is not flagged. */
  onOpenInNewTab: () => void;
  onFinish: () => void;
};

/**
 * A teacher's Google Form inside the monitored exam room. Google's Submit
 * sends the answers to Google; ProctorX cannot see inside the form, so the
 * student finishes the monitored session as a separate, confirmed step.
 */
export function GoogleFormPanel({ url, title, submitting, onOpenInNewTab, onFinish }: Props) {
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirming) return;
    dialogRef.current?.querySelector<HTMLButtonElement>('button[data-autofocus]')?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setConfirming(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  return (
    <div className="mx-auto max-w-5xl">
      <ol className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
        <li className="rounded-xl border border-brand/30 bg-white/90 p-3">
          <span className="font-black text-brand">Step 1.</span> Answer the form below and press
          Google’s <b>Submit</b> button inside it. Wait for “Your response has been recorded”.
        </li>
        <li className="rounded-xl border border-border bg-white/90 p-3">
          <span className="font-black text-brand">Step 2.</span> Then press <b>Finish my ProctorX
          session</b> at the bottom to end monitoring.
        </li>
      </ol>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <iframe
          title={title}
          src={url}
          className="h-[calc(100dvh-260px)] min-h-[480px] w-full"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <a
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline"
          href={url.replace(/([?&])embedded=true&?/, '$1').replace(/[?&]$/, '')}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpenInNewTab}
        >
          <ExternalLink size={14} aria-hidden="true" />
          Form not loading or asks you to sign in? Open it in a new tab
        </a>
        <Button disabled={submitting} onClick={() => setConfirming(true)} className="w-full sm:w-auto">
          Step 2: Finish my ProctorX session
        </Button>
      </div>
      <p className="mt-2 text-xs text-text-2">
        Opening the form in a new tab is allowed and is not counted as a tab switch. Come back
        to this page afterwards to finish your session.
      </p>

      {confirming && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-form-finish-title"
            ref={dialogRef}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 id="google-form-finish-title" className="text-xl font-black text-slate-900">
              Did you press Submit in the Google Form?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              ProctorX cannot see your Google Form answers. If you finish now without submitting
              in Google Forms, your answers are <b>not</b> recorded and you cannot come back to
              this exam.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" data-autofocus onClick={() => setConfirming(false)}>
                Not yet, go back
              </Button>
              <Button
                disabled={submitting}
                onClick={() => {
                  setConfirming(false);
                  onFinish();
                }}
              >
                {submitting ? 'Finishing…' : 'Yes, I submitted. Finish'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
