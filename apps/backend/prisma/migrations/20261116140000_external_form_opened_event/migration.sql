-- A student opened the exam's own Google Form in a new tab. Recorded as a note
-- for the teacher; it is not a violation and is not used in suspicion scoring.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'EXTERNAL_FORM_OPENED';
