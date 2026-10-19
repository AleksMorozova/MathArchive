import { useQuery } from "@tanstack/react-query";
import { studentApi } from "../../api/studentApi";
export const studentSessionKey = ["student-session"] as const;
export function useStudentSession() {
  return useQuery({ queryKey: studentSessionKey, queryFn: ({ signal }) => studentApi.me(signal), retry: false, staleTime: 30_000 });
}
