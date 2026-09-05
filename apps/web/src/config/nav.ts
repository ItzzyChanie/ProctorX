import {
  LayoutDashboard,
  LogIn,
  History,
  User,
  Video,
  FolderKanban,
  PlayCircle,
  FileWarning,
  Upload,
  Users,
  MessageSquare,
  Settings,
  Shield,
  FileText,
  ClipboardList,
  Clock,
  GraduationCap,
  CalendarRange,
  TrendingUp,
  BookOpen,
  Layers3,
  Library,
} from "lucide-react";
import type { NavItem, Role } from "../types/dashboard";

/**
 * `path` values assume routes are namespaced by role, e.g. /student/*, /teacher/*, /dean/*.
 * Adjust to match your actual router (React Router / file-based) when wiring this in.
 */
export const NAV: Record<Role, NavItem[]> = {
  student: [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/student",
    },
    { key: "join", label: "Join Session", icon: LogIn, path: "/student/join" },
    { key: "calendar", label: "Assessment Calendar", icon: CalendarRange, path: "/student/calendar" },
    { key: "progress", label: "Progress Analytics", icon: TrendingUp, path: "/student/progress" },
    {
      key: "sessions",
      label: "My Sessions",
      icon: History,
      path: "/student/sessions",
    },
    {
      key: "profile",
      label: "Profile & Device",
      icon: User,
      path: "/student/profile",
    },
  ],
  teacher: [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/teacher",
    },
    {
      key: "monitoring",
      label: "Live Monitoring",
      icon: Video,
      path: "/teacher/monitoring",
    },
    {
      key: "sessions",
      label: "Sessions",
      icon: FolderKanban,
      path: "/teacher/sessions",
    },
    {
      key: "recordings",
      label: "Recordings & Playback",
      icon: PlayCircle,
      path: "/teacher/recordings",
    },
    {
      key: "incidents",
      label: "Incident Reports",
      icon: FileWarning,
      path: "/teacher/incidents",
    },
    {
      key: "correlation",
      label: "Score Upload & Correlation",
      icon: Upload,
      path: "/teacher/correlation",
    },
    {
      key: "subjects",
      label: "Subjects & Exams",
      icon: GraduationCap,
      path: "/teacher/classes",
      children: [
        { key: "subjects-overview", label: "My Subjects & Exams", icon: BookOpen, path: "/teacher/classes" },
        { key: "class-sections", label: "Class Sections", icon: Layers3, path: "/teacher/class-sections" },
        { key: "student-rosters", label: "Student Rosters", icon: Users, path: "/teacher/rosters" },
        { key: "submitted-exams", label: "Submitted Exams", icon: ClipboardList, path: "/teacher/submitted-exams" },
        { key: "question-bank", label: "Question Bank", icon: Library, path: "/teacher/question-bank" },
      ],
    },
    {
      key: "messages",
      label: "Raise-Hand Queue",
      icon: MessageSquare,
      path: "/teacher/messages",
    },
    {
      key: "profile",
      label: "Profile & Settings",
      icon: Settings,
      path: "/teacher/profile",
    },
  ],
  dean: [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/dean",
    },
    {
      key: "analytics",
      label: "Analytics",
      icon: FileText,
      path: "/dean/analytics",
    },
    { key: "academic-semesters", label: "Academic Semesters", icon: CalendarRange, path: "/dean/academic-semesters" },
    {
      key: "departments",
      label: "Departments & Professors",
      icon: GraduationCap,
      path: "/dean/departments",
    },
    { key: "students", label: "Student Lists", icon: Users, path: "/dean/students" },
    {
      key: "reports",
      label: "Reports",
      icon: ClipboardList,
      path: "/dean/reports",
    },
    { key: "audit", label: "Audit Logs", icon: Clock, path: "/dean/audit" },
    {
      key: "security",
      label: "Security & Access",
      icon: Shield,
      path: "/dean/security",
    },
    {
      key: "profile",
      label: "Profile & Settings",
      icon: Settings,
      path: "/dean/profile",
    },
  ],
};
