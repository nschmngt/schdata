-- Enterprise performance indexes for high-volume database query optimization and multi-tenant isolation.

-- Multi-tenant school_id indexes
CREATE INDEX IF NOT EXISTS library_books_school_idx ON public.library_books (school_id);
CREATE INDEX IF NOT EXISTS library_loans_school_idx ON public.library_loans (school_id);
CREATE INDEX IF NOT EXISTS library_reservations_school_idx ON public.library_reservations (school_id);
CREATE INDEX IF NOT EXISTS publicity_articles_school_idx ON public.publicity_articles (school_id);
CREATE INDEX IF NOT EXISTS publicity_banners_school_idx ON public.publicity_banners (school_id);
CREATE INDEX IF NOT EXISTS publicity_circulars_school_idx ON public.publicity_circulars (school_id);
CREATE INDEX IF NOT EXISTS publicity_media_gallery_school_idx ON public.publicity_media_gallery (school_id);
CREATE INDEX IF NOT EXISTS publicity_notices_school_idx ON public.publicity_notices (school_id);
CREATE INDEX IF NOT EXISTS subjects_school_idx ON public.subjects (school_id);
CREATE INDEX IF NOT EXISTS school_branding_school_idx ON public.school_branding (school_id);
CREATE INDEX IF NOT EXISTS tenant_settings_school_idx ON public.tenant_settings (school_id);
CREATE INDEX IF NOT EXISTS numbering_settings_school_idx ON public.numbering_settings (school_id);
CREATE INDEX IF NOT EXISTS numbering_counters_school_idx ON public.numbering_counters (school_id);
CREATE INDEX IF NOT EXISTS timetable_slots_school_idx ON public.timetable_slots (school_id);

-- Core FK and composite query performance indexes
CREATE INDEX IF NOT EXISTS student_fees_admission_idx ON public.student_fees (admission_id);
CREATE INDEX IF NOT EXISTS student_attendance_admission_idx ON public.student_attendance (admission_id);
CREATE INDEX IF NOT EXISTS student_performance_admission_idx ON public.student_performance (admission_id);
CREATE INDEX IF NOT EXISTS finance_payroll_staff_idx ON public.finance_payroll (staff_id);
CREATE INDEX IF NOT EXISTS interventions_created_by_idx ON public.interventions (created_by);
CREATE INDEX IF NOT EXISTS interventions_responsible_staff_idx ON public.interventions (responsible_staff_id);
CREATE INDEX IF NOT EXISTS lessons_created_by_idx ON public.lessons (created_by);
CREATE INDEX IF NOT EXISTS lesson_completions_admission_idx ON public.lesson_completions (admission_id);
CREATE INDEX IF NOT EXISTS lesson_completions_quiz_sub_idx ON public.lesson_completions (quiz_submission_id);
CREATE INDEX IF NOT EXISTS messaging_announcements_created_by_idx ON public.messaging_announcements (created_by);
CREATE INDEX IF NOT EXISTS messaging_announcements_target_class_idx ON public.messaging_announcements (target_class_id);
CREATE INDEX IF NOT EXISTS messaging_conversations_created_by_idx ON public.messaging_conversations (created_by);
CREATE INDEX IF NOT EXISTS messaging_direct_messages_sender_idx ON public.messaging_direct_messages (sender_id);
CREATE INDEX IF NOT EXISTS publicity_articles_created_by_idx ON public.publicity_articles (created_by);
CREATE INDEX IF NOT EXISTS publicity_banners_created_by_idx ON public.publicity_banners (created_by);
CREATE INDEX IF NOT EXISTS publicity_circulars_created_by_idx ON public.publicity_circulars (created_by);
CREATE INDEX IF NOT EXISTS publicity_media_gallery_created_by_idx ON public.publicity_media_gallery (created_by);
CREATE INDEX IF NOT EXISTS publicity_notices_created_by_idx ON public.publicity_notices (created_by);
CREATE INDEX IF NOT EXISTS result_publications_published_by_idx ON public.result_publications (published_by);
CREATE INDEX IF NOT EXISTS staff_performance_staff_idx ON public.staff_performance (staff_id);
CREATE INDEX IF NOT EXISTS staff_schedules_staff_idx ON public.staff_schedules (staff_id);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS password_reset_requests_handled_by_idx ON public.password_reset_requests (handled_by);
CREATE INDEX IF NOT EXISTS library_loans_issued_by_idx ON public.library_loans (issued_by);
CREATE INDEX IF NOT EXISTS library_reservations_borrower_admission_idx ON public.library_reservations (borrower_admission_id);
CREATE INDEX IF NOT EXISTS library_reservations_borrower_profile_idx ON public.library_reservations (borrower_profile_id);
