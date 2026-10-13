import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSubjectOptions } from "@/lib/config.functions";

/**
 * Subject names configured under System Configuration → Subjects. Single
 * source of truth for every module that needs to pick a subject.
 */
export function useSubjectOptions(): { subjects: string[]; loading: boolean } {
  const load = useServerFn(getSubjectOptions);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void load()
      .then((rows) => {
        if (active) setSubjects(rows as string[]);
      })
      .catch(() => setSubjects([]))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { subjects, loading };
}
