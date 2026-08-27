import type { LucideIcon } from "lucide-react";

/** Match this to your Prisma `Role` enum (rename if yours differs, e.g. ADMIN vs teacher). */
export type Role = "student" | "teacher" | "dean";

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Route path this nav item links to, e.g. "/dean/analytics". Fill in when wiring your router. */
  path: string;
  children?: NavItem[];
};

export type RiskLevel = "Low" | "Medium" | "High";

export type SuspicionSample = { t: string; score: number };
export type SectionSuspicion = { section: string; avg: number };
export type IncidentType = { name: string; value: number };
export type LiveStudent = {
  id: string;
  name: string;
  score: number;
  alerts: number;
};
export type CorrelationPoint = { suspicion: number; performance: number };
