import { describe, expect, it } from "vitest";
import { resolveTenantContext } from "@/lib/school.server";

describe("Multi-Tenancy Tenant Context Resolution & Security", () => {
  it("resolves active school for standard user based on profile school_id", async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "staff", school_id: "school-1111" },
                }),
              }),
            }),
          };
        }
        if (table === "schools") {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: {
                    id: val,
                    name: "School Alpha",
                    currency: "USD",
                    locale: "en-US",
                  },
                }),
                limit: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: val,
                      name: "School Alpha",
                      currency: "USD",
                      locale: "en-US",
                    },
                  }),
                }),
              }),
              order: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "school-1111",
                        name: "School Alpha",
                        currency: "USD",
                        locale: "en-US",
                      },
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    };

    const ctx = await resolveTenantContext(mockSupabase, "user-staff-1");
    expect(ctx.schoolId).toBe("school-1111");
    expect(ctx.schoolName).toBe("School Alpha");
    expect(ctx.isSuperAdmin).toBe(false);
  });

  it("prevents standard user or school manager from accessing another school even if requested", async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "school_manager", school_id: "school-1111" },
                }),
              }),
            }),
          };
        }
        if (table === "schools") {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: {
                    id: "school-1111",
                    name: "School Alpha",
                    currency: "USD",
                    locale: "en-US",
                  },
                }),
                limit: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "school-1111",
                      name: "School Alpha",
                      currency: "USD",
                      locale: "en-US",
                    },
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    };

    // School manager attempts to request school-2222
    const ctx = await resolveTenantContext(mockSupabase, "user-manager-1", "school-2222");
    // Must be locked strictly to assigned school-1111
    expect(ctx.schoolId).toBe("school-1111");
    expect(ctx.isSuperAdmin).toBe(false);
  });

  it("allows Super Admin to switch active school context cleanly when valid requestedSchoolId is passed", async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "super_admin", school_id: "school-1111" },
                }),
              }),
            }),
          };
        }
        if (table === "schools") {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: { id: val, name: val === "school-2222" ? "School Beta" : "School Alpha", currency: "EUR", locale: "de-DE" },
                }),
                limit: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: val,
                      name: val === "school-2222" ? "School Beta" : "School Alpha",
                      currency: "EUR",
                      locale: "de-DE",
                    },
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    };

    const ctx = await resolveTenantContext(mockSupabase, "user-superadmin-1", "school-2222");
    expect(ctx.schoolId).toBe("school-2222");
    expect(ctx.schoolName).toBe("School Beta");
    expect(ctx.isSuperAdmin).toBe(true);
  });

  it("denies context resolution if user has no assigned school and is not Super Admin (deny by default)", async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "staff", school_id: null },
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        };
      },
    };

    await expect(resolveTenantContext(mockSupabase, "unassigned-user")).rejects.toThrow(
      "Tenant Context Error",
    );
  });
});
