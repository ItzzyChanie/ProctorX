CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

INSERT INTO "permissions" ("id", "key", "description") VALUES
  ('dean-view-analytics', 'VIEW_DEAN_ANALYTICS', 'View institution-wide dean analytics'),
  ('dean-manage-periods', 'MANAGE_ACADEMIC_PERIODS', 'Create, close, and reopen academic periods'),
  ('dean-manage-faculty', 'MANAGE_FACULTY', 'Create and manage faculty accounts'),
  ('dean-manage-students', 'MANAGE_STUDENTS', 'Create and manage student accounts and sections'),
  ('view-student-rosters', 'VIEW_STUDENT_ROSTERS', 'View student rosters'),
  ('dean-generate-reports', 'GENERATE_DEAN_REPORTS', 'Generate and download institution reports'),
  ('dean-view-audit', 'VIEW_AUDIT_LOGS', 'View institution audit logs')
ON CONFLICT ("key") DO UPDATE
SET "description" = EXCLUDED."description";
