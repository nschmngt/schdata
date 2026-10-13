export type Branding = { name: string; tagline: string; logoUrl: string | null };
export const FALLBACK_BRANDING: Branding = { name: "School Management Portal", tagline: "", logoUrl: null };

/** Reads the public branding through the narrow get_public_branding() database function. */
export async function readBranding(client: any): Promise<Branding> {
  const { data, error } = await client.rpc("get_public_branding");
  if (error) { console.error("get_public_branding failed", error.message); return FALLBACK_BRANDING; }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    name: row?.name?.trim() || FALLBACK_BRANDING.name,
    tagline: row?.tagline ?? "",
    logoUrl: row?.logo_url ?? null,
  };
}
