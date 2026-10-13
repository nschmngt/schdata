import { useQuery } from "@tanstack/react-query";
import { brandingQueryOptions, DEFAULT_SCHOOL_NAME } from "@/lib/branding.functions";

export { DEFAULT_SCHOOL_NAME };

/** The one source for the school name on screen, cached under ["branding"]. */
export function useSchoolName() {
  const { data } = useQuery(brandingQueryOptions);
  return { name: data?.name || DEFAULT_SCHOOL_NAME, tagline: data?.tagline ?? "", logoUrl: data?.logoUrl ?? null };
}
