import { readBranding } from "./branding.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRoles, logAudit } from "@/lib/admin.server";
import { resolveTenantContext } from "@/lib/school.server";
import {
  allowedStates,
  canExport,
  parseAccessRules,
  parseExportControls,
  watermarkText,
  type RecordState,
} from "@/lib/data-access";
import { loadCalendar } from "@/lib/academic-calendar.server";
import { defaultCalendar } from "@/lib/academic-calendar";
import {
  ARCHIVE_SOURCES,
  academicYearOf,
  archiveStateOf,
  getArchiveSource,
  retentionFor,
  valueAt,
} from "@/lib/archives";

const CHUNK = 1000;
const SCAN_CAP = 100_000;

async function scanAll(make: () => any): Promise<{ rows: Record<string, unknown>[]; capped: boolean; error: string | null }> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < SCAN_CAP; offset += CHUNK) {
    const { data, error } = await make().range(offset, offset + CHUNK - 1);
    if (error) return { rows, capped: false, error: error.message };
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data ?? []).length < CHUNK) return { rows, capped: false, error: null };
  }
  return { rows, capped: true, error: null };
}
const MAX_PAGE_SIZE = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function accessContext(supabase: any, userId: string) {
  const tenant = await resolveTenantContext(supabase, userId);
  const roles = await getRoles(supabase, userId);
  let rules: any[] = [];
  let exportPayload: Record<string, unknown> | null = null;
  if (tenant.schoolId) {
    const today = new Date().toISOString().slice(0, 10);
    const [r, e] = await Promise.all([
      supabase.from("finance_rules").select("name, active, conditions").eq("school_id", tenant.schoolId).eq("rule_key", "record-access-rules").eq("active", true),
      supabase.from("finance_config_sections").select("payload, effective_from").eq("school_id", tenant.schoolId).eq("section_key", "export-controls").eq("status", "active").order("version", { ascending: false }),
    ]);
    rules = r.data ?? [];
    exportPayload = ((e.data ?? []).find((x: any) => !x.effective_from || x.effective_from <= today)?.payload ?? null) as any;
  }
  const grants = parseAccessRules(rules);
  return {
    school: { id: tenant.schoolId, name: tenant.schoolName },
    roles,
    states: (source: string) => allowedStates(roles, grants, source),
    exportControls: parseExportControls(exportPayload),
  };
}

function assertAnyAccess(ctx: Awaited<ReturnType<typeof accessContext>>) {
  if (!ARCHIVE_SOURCES.some((s) => ctx.states(s.key).size > 0))
    throw new Error("Forbidden: no Data Access rule grants you archive records.");
}

async function retentionRules(supabase: any, schoolId?: string) {
  let q = supabase
    .from("finance_rules")
    .select("name, active, conditions, actions, priority")
    .eq("rule_key", "retention-policies");
  if (schoolId) q = q.eq("school_id", schoolId);
  const { data } = await q.order("priority");
  return (data ?? []) as Parameters<typeof retentionFor>[1];
}

export const getArchiveSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const access = await accessContext(supabase, context.userId);
    assertAnyAccess(access);
    const cal = (await loadCalendar(supabase)) ?? defaultCalendar();
    const rules = await retentionRules(supabase, access.school?.id);

    const sources = await Promise.all(
      ARCHIVE_SOURCES.filter((s) => access.states(s.key).size > 0).map(async (s) => {
        const visible = access.states(s.key);
        const { rows: data, error } = await scanAll(() => {
          let q = (supabase as any).from(s.table).select(s.dateColumn);
          if (access.school?.id) q = q.eq("school_id", access.school.id);
          return q.order(s.dateColumn, { ascending: false });
        });
        const retention = retentionFor(s, rules);
        const counts = { current: 0, archived: 0, "disposal-due": 0 };
        const years = new Set<string>();
        for (const r of data) {
          const d = r[s.dateColumn] as string | null;
          if (!d) continue;
          const st = archiveStateOf(d, cal, retention.years);
          if (!visible.has(st)) continue;
          counts[st] += 1;
          years.add(academicYearOf(d, cal));
        }
        return {
          key: s.key,
          label: s.label,
          module: s.module,
          total: counts.current + counts.archived + counts["disposal-due"],
          counts,
          years: [...years].sort().reverse(),
          retention,
          error,
        };
      }),
    );
    return {
      calendar: cal,
      sources,
      schoolName: (await readBranding(supabase)).name,
      canExport: canExport(access.roles, access.exportControls),
    };
  });

function yearRange(year: string, cal: ReturnType<typeof defaultCalendar>): [string, string] | null {
  const startYear = Number(year.split("/")[0]);
  if (!Number.isFinite(startYear)) return null;
  const startMonth = Number(cal.periods.map((p) => p.start).sort()[0]?.slice(5, 7) ?? 9) || 9;
  const from = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const end = `${startYear + 1}-${String(startMonth).padStart(2, "0")}-01`;
  return [from, end];
}

const recordsInput = z.object({
  source: z.string().min(1).max(40),
  year: z.string().max(20).optional(),
  period: z.string().max(60).optional(),
  state: z.enum(["all", "current", "archived", "disposal-due"]).default("all"),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(MAX_PAGE_SIZE).default(50),
});
type RecordsInput = z.infer<typeof recordsInput>;

async function loadRecords(supabase: any, access: Awaited<ReturnType<typeof accessContext>>, data: RecordsInput, everything: boolean) {
  const source = getArchiveSource(data.source);
  if (!source) throw new Error("Unknown archive source.");
  const visible = access.states(source.key);
  if (visible.size === 0) throw new Error(`Forbidden: no Data Access rule grants you ${source.label} records.`);
  if (data.state !== "all" && !visible.has(data.state)) throw new Error("Forbidden: that record state is not visible to you.");
  const cal = (await loadCalendar(supabase)) ?? defaultCalendar();
  const retention = retentionFor(source, await retentionRules(supabase, access.school?.id));

  let from = data.dateFrom ?? null;
  let to = data.dateTo ?? null;
  const period = data.period ? cal.periods.find((p) => p.name === data.period) : null;
  if (period) {
    from = from && from > period.start ? from : period.start;
    to = to && to < period.end ? to : period.end;
  }
  if (data.year) {
    const yr = yearRange(data.year, cal);
    if (yr) {
      from = from && from > yr[0] ? from : yr[0];
      to = to && to < yr[1] ? to : yr[1];
    }
  }
  if (from && to && from > to) throw new Error("The From date must be on or before the To date.");

  const toRecord = (r: Record<string, unknown>) => {
    const date = String(r[source.dateColumn] ?? "").slice(0, 10);
    const cells: Record<string, string | number | null> = {};
    for (const c of source.columns) {
      const v = valueAt(r, c.path);
      cells[c.key] = v === null || v === undefined ? null : typeof v === "number" ? v : String(v);
    }
    return { id: String(r["id"] ?? ""), cells, date, year: academicYearOf(date, cal), state: archiveStateOf(date, cal, retention.years) as RecordState };
  };

  const base = (withCount = false) => {
    let q = supabase.from(source.table).select(source.select, withCount ? { count: "exact" } : undefined);
    if (access.school?.id) q = q.eq("school_id", access.school.id);
    if (from) q = q.gte(source.dateColumn, from);
    if (to) q = q.lte(source.dateColumn, `${to}T23:59:59.999Z`);
    return q.order(source.dateColumn, { ascending: false });
  };

  const unrestricted = visible.size === 3 && data.state === "all";
  let records: ReturnType<typeof toRecord>[];
  let total: number;
  let truncated = false;
  if (unrestricted && !everything) {
    const offset = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await base(true).range(offset, offset + data.pageSize - 1);
    if (error) throw new Error(error.message);
    records = ((rows ?? []) as Record<string, unknown>[]).map(toRecord).filter((r) => r.date);
    total = count ?? records.length;
  } else {
    const { rows, capped, error } = await scanAll(() => base());
    if (error) throw new Error(error);
    const filtered = rows
      .map(toRecord)
      .filter((r) => r.date && visible.has(r.state))
      .filter((r) => data.state === "all" || r.state === data.state);
    total = filtered.length;
    truncated = capped;
    records = everything ? filtered : filtered.slice((data.page - 1) * data.pageSize, data.page * data.pageSize);
  }
  return { source, retention, records, total, truncated };
}

export const getArchiveRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const access = await accessContext(supabase, context.userId);
    const r = await loadRecords(supabase, access, data, false);
    await logAudit(supabase, context.userId, {
      action: "archive_viewed",
      description: `Viewed ${r.source.label} archive (page ${data.page}, ${r.records.length} of ${r.total} records)`,
      schoolId: access.school?.id,
    });
    return {
      retention: r.retention,
      truncated: r.truncated,
      records: r.records,
      total: r.total,
      page: data.page,
      pageSize: data.pageSize,
      pageCount: Math.max(1, Math.ceil(r.total / data.pageSize)),
    };
  });

export const exportArchiveRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const access = await accessContext(supabase, context.userId);
    if (!canExport(access.roles, access.exportControls))
      throw new Error("Forbidden: Export Controls do not allow your role to export records.");
    const r = await loadRecords(supabase, access, data, true);
    const { data: me } = await supabase.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    const watermark = access.exportControls.watermark
      ? watermarkText((await readBranding(supabase)).name, (me as any)?.email ?? "", new Date().toISOString())
      : null;
    await logAudit(supabase, context.userId, {
      action: "archive_exported",
      description: `Exported ${r.records.length} ${r.source.label} archive records`,
      details: { source: r.source.key, state: data.state, count: r.records.length, watermark: !!watermark },
      schoolId: access.school?.id,
    });
    return {
      watermark,
      truncated: r.truncated,
      rows: r.records.map((x) => ({ date: x.date, year: x.year, state: x.state, cells: x.cells })),
    };
  });
