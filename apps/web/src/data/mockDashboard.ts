import type {
  CorrelationPoint,
  IncidentType,
  LiveStudent,
  SectionSuspicion,
  SuspicionSample,
} from "../types/dashboard";

/**
 * All data here is mock/demo data for previewing the UI. Replace each export with a
 * real API call (React Query / your fetch layer) once the corresponding backend
 * endpoint exists — the shapes are already typed to make that swap mechanical.
 */

const seedRand = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};
const rnd = seedRand(42);

export const scoreHistory = [
  { term: "Prelim", score: 85 },
  { term: "Midterm", score: 78 },
  { term: "Pre-final", score: 91 },
  { term: "Final", score: 88 },
];

export const sessionTime = [
  { session: "CS101-Q1", mins: 42 },
  { session: "CS101-Q2", mins: 38 },
  { session: "IT210-Mid", mins: 55 },
  { session: "CS330-Lab", mins: 47 },
];

export const sectionSuspicion: SectionSuspicion[] = [
  { section: "BSCS-3A", avg: 24 },
  { section: "BSCS-3B", avg: 41 },
  { section: "BSIT-2A", avg: 18 },
  { section: "BSCS-4A", avg: 63 },
  { section: "BSIT-3C", avg: 32 },
];

export const incidentTypes: IncidentType[] = [
  { name: "Tab switch", value: 44 },
  { name: "Blacklisted app", value: 26 },
  { name: "Idle time", value: 18 },
  { name: "USB device", value: 12 },
];

export const suspicionTrend: SuspicionSample[] = Array.from({ length: 12 }).map(
  (_, i) => ({
    t: `${(i + 1) * 5}m`,
    score: Math.round(15 + 55 * Math.abs(Math.sin(i / 2.3)) + rnd() * 10),
  }),
);

export const liveStudents: LiveStudent[] = [
  "Palceso, J.",
  "Eglea, N.",
  "Reyes, M.",
  "Santos, A.",
  "Dela Cruz, R.",
  "Bautista, K.",
  "Garcia, L.",
  "Mendoza, P.",
  "Torres, C.",
  "Ramos, S.",
].map((name, i) => ({
  id: String(i),
  name,
  score: Math.round(rnd() * 100),
  alerts: Math.round(rnd() * 3),
}));

export const correlationData: CorrelationPoint[] = Array.from({
  length: 24,
}).map(() => {
  const s = Math.round(rnd() * 100);
  const perf = Math.max(
    20,
    Math.min(100, Math.round(96 - s * 0.55 + (rnd() - 0.5) * 25)),
  );
  return { suspicion: s, performance: perf };
});

export function linearRegression(
  points: CorrelationPoint[],
): CorrelationPoint[] {
  const n = points.length;
  const sx = points.reduce((a, d) => a + d.suspicion, 0);
  const sy = points.reduce((a, d) => a + d.performance, 0);
  const sxy = points.reduce((a, d) => a + d.suspicion * d.performance, 0);
  const sxx = points.reduce((a, d) => a + d.suspicion * d.suspicion, 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  return [
    { suspicion: 0, performance: a },
    { suspicion: 100, performance: a + b * 100 },
  ];
}

export const incidenceTrend = [
  "Wk1",
  "Wk2",
  "Wk3",
  "Wk4",
  "Wk5",
  "Wk6",
  "Wk7",
  "Wk8",
].map((w, i) => ({
  week: w,
  rate: Math.round(8 + 6 * Math.sin(i / 1.6) + rnd() * 4),
}));

export const subjectIncidence = [
  { subject: "Data Structures", rate: 19 },
  { subject: "Networking", rate: 11 },
  { subject: "Databases", rate: 27 },
  { subject: "OS Concepts", rate: 15 },
  { subject: "Capstone Lab", rate: 8 },
];
