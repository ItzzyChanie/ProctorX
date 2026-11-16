import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock3, Trophy } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { api } from '../../lib/api';

type Option = { id: string; label: string; isCorrect?: boolean };
type Result = {
  sessionId: string;
  submittedAt: string | null;
  totalScore: number | null;
  maxScore: number;
  gradeStatus: string;
  teacherFeedback: string | null;
  showCorrectAnswers: boolean;
  exam: {
    title: string;
    assessmentType: string;
    term: string;
    academicPeriod: { academicYear: string; semester: string };
    subject: { code: string; name: string };
  };
  answers: {
    id: string;
    responseText: string | null;
    selectedOptionIds: string[];
    awardedPoints: number | null;
    gradeStatus: string;
    question: {
      order: number;
      prompt: string;
      type: string;
      points: number;
      correctAnswer: unknown;
      options: Option[];
    };
  }[];
};
const answerValues = (value: unknown) =>
  Array.isArray(value)
    ? value.map(String)
    : value == null
      ? []
      : [String(value)];
export default function ExamResult() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-result', sessionId],
    enabled: !!sessionId,
    queryFn: async () =>
      (await api.get<Result>(`/students/me/sessions/${sessionId}/result`)).data,
    refetchInterval: 10_000,
  });
  if (isLoading)
    return (
      <DashboardLayout role="student" pageTitle="Exam Result">
        <Card>Loading result…</Card>
      </DashboardLayout>
    );
  if (isError || !data)
    return (
      <DashboardLayout role="student" pageTitle="Exam Result">
        <Card>
          <span className="text-risk-high">
            This result could not be loaded.
          </span>
        </Card>
      </DashboardLayout>
    );
  const released = data.gradeStatus === 'TEACHER_CONFIRMED';
  const percentage =
    released && data.totalScore !== null && data.maxScore
      ? Math.round((data.totalScore / data.maxScore) * 100)
      : null;
  const passed = percentage !== null && percentage >= 50;
  return (
    <DashboardLayout role="student" pageTitle="Exam Result">
      <div className="space-y-5">
        <Button
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => navigate('/student/sessions')}
        >
          Back to sessions
        </Button>
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardHeader
                title={data.exam.title}
                subtitle={`${data.exam.subject.code} · ${data.exam.subject.name}`}
              />
              <div className="mt-2 text-xs text-text-3">
                {data.exam.academicPeriod.academicYear} ·{' '}
                {data.exam.term.replace('_', ' ')}
              </div>
            </div>
            {released ? (
              <div
                className={`rounded-xl px-5 py-3 text-center ${passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
              >
                <Trophy className="mx-auto" size={20} />
                <div className="mt-1 text-2xl font-black">
                  {data.totalScore} / {data.maxScore}
                </div>
                <div className="text-xs font-bold">
                  {percentage}% · {passed ? 'Passed' : 'Failed'}
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-100 px-4 py-3 text-amber-800">
                <Clock3 className="inline mr-2" size={17} />
                {data.gradeStatus === 'PENDING_RELEASE'
                  ? 'Results are released after the exam closes'
                  : 'Pending teacher grading'}
              </div>
            )}
          </div>
          {released && data.teacherFeedback && (
            <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft p-4">
              <div className="text-xs font-bold uppercase text-brand">
                Teacher feedback
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {data.teacherFeedback}
              </p>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          {data.answers.map((answer) => (
            <Card key={answer.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-text-3">
                    Question {answer.question.order} ·{' '}
                    {answer.question.type.replace('_', ' ')}
                  </div>
                  <h3 className="mt-1 font-semibold">
                    {answer.question.prompt}
                  </h3>
                </div>
                <div className="shrink-0 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
                  {released
                    ? `${answer.awardedPoints ?? 0} / ${answer.question.points}`
                    : `— / ${answer.question.points}`}
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-border bg-canvas/50 p-3">
                <div className="text-xs font-bold text-text-3">Your answer</div>
                {answer.question.type === 'MULTIPLE_CHOICE' ? (
                  <div className="mt-2 space-y-2">
                    {answer.question.options
                      .filter((option) =>
                        answer.selectedOptionIds.includes(option.id)
                      )
                      .map((option) => (
                        <div key={option.id}>{option.label}</div>
                      ))}
                    {!answer.selectedOptionIds.length && (
                      <span className="text-text-3">No answer</span>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap">
                    {answer.responseText || 'No answer'}
                  </p>
                )}
              </div>
              {data.showCorrectAnswers && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                  <div className="flex items-center gap-1 text-xs font-bold">
                    <CheckCircle2 size={14} />
                    Correct answer
                  </div>
                  {answer.question.type === 'MULTIPLE_CHOICE' ? (
                    <div className="mt-1">
                      {answer.question.options
                        .filter((option) => option.isCorrect)
                        .map((option) => option.label)
                        .join(', ')}
                    </div>
                  ) : (
                    <div className="mt-1 whitespace-pre-wrap">
                      {answerValues(answer.question.correctAnswer).join(', ') ||
                        'Teacher-reviewed response'}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
        {released && !data.showCorrectAnswers && (
          <Card>
            <p className="text-sm text-text-2">
              Your teacher has not enabled correct-answer visibility for this
              assessment.
            </p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
