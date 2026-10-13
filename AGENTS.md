<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Academic calendar (terms vs semesters, dates, auto lifecycle) lives in tenant_settings.features.__academic_calendar via src/lib/academic-calendar.ts; every date/term field uses PeriodDateInput/PeriodSelect (src/components/portal/PeriodFields.tsx) and every dated server write calls assertPeriodOpen — one central calendar, no per-module date logic.
- Financial list items never store their own dates/lifecycle: they carry a coverage scope (+ optional period) resolved by resolveCoverage in src/lib/academic-calendar.ts; each Financial Configuration area renders all its sections on one page — keeps the calendar the only lifecycle source.
- Archives derive record state from the academic calendar + retention-policies rules via the ARCHIVE_SOURCES registry in src/lib/archives.ts; records are never copied or auto-deleted — one registry entry per source, no new tables.
- Appointment letters are derived from saved onboarding profiles or offer rows through a shared authenticated read and preview; school, signer and employment type are explicitly selected when ambiguous, avoiding fabricated appointment details or schema changes.
- Appointment-letter printing uses an isolated same-origin frame of the preview, so portal navigation and dialog controls never appear on the printed letter.
- Configuration is split into six domains registered in src/lib/config-domains.ts; each operational module is governed by exactly one domain (enforced by src/test/config-domains.test.ts) and reads settings from it, so no module keeps its own configuration logic.
- Grading bands and assessment/attendance/timetable/report-card rules live in tenant_settings.features.__academic_rules via src/lib/academic-rules.ts, edited only in Academic Configuration; every rule has a default and may be deleted (deleted = not applied) — modules and server guards read them, never their own copies.
- People rules (staff lifecycle incl. appointment-letter terms, employment types, student lifecycle, guardian relationships, identity) live in tenant_settings.features.__people_rules via src/lib/people-rules.ts, versioned with an optimistic check on save; positions/departments/schedule types are edited only in People Configuration — one source, no per-module copies.
- Versioned settings in tenant_settings.features (academic calendar, academic rules, people rules) are saved only through writeVersionedFeature in src/lib/config.functions.ts — stale copies are rejected and other domains' keys are preserved, preventing lost updates.
- Operations rules (admissions process, library policies, messaging channels) live in tenant_settings.features.__operations_rules via src/lib/operations-rules.ts, saved through writeVersionedFeature; admission numbering is edited only in Operations Configuration and employee numbering + school code only in System Configuration, each save writing only its own numbering_settings columns — one owner per setting.
- Configuration list/rule editors are shared from src/components/portal/RuleEditors.tsx — no per-domain copies.
- Currency is owned only by Financial Configuration (currency section); schools.currency is just the starting value set at provisioning, and every amount on screen is formatted through useFinanceConfig().money — no hardcoded currency formatters.
- Versioned configuration areas in src/lib/finance-config.ts carry an owner page (areasOwnedBy); Financial and Reporting & Records render the same workspace filtered by owner — one storage, lifecycle and audit path, no duplicate editors.
- Archive viewing/export authorization is evaluated only in src/lib/data-access.ts (pure) and enforced server-side in archives.functions.ts; deny by default except Super Admin — one rule engine, UI only mirrors it.
- The provisioned school is resolved only via resolveProvisionedSchool in src/lib/school.server.ts — modules never pick their own school row.
- Assessment types (name + class/exam category) live in the academic rules and are edited only in Academic Configuration; Assessment validates against them and Termly Reports weights by category — no hardcoded type lists.
- Teacher subject/class scope comes only from teaching_assignments via loadTeachingScope in src/lib/teaching.server.ts (distinct from class_teachers); modules filter reads and assert writes with it.
- Learner attendance/score summaries are computed only by src/lib/student-summary.ts, grouped by academic-calendar periods; long lists use the shared usePaged/Pager in src/components/portal/Paged.tsx.
- School name/tagline/logo are read only via get_public_branding() (src/lib/branding.*, useSchoolName, router context for titles); tables stay admin-only — exposes the name without widening table access.
