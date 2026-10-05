import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { commands, events } from "@/core/ipc";
import { queryClient } from "@/core/query";

const KEY = ["scheduler", "list"] as const;


export function useSchedules() {
  useEffect(() => {
    const un = events.schedulesChanged.listen((e) => queryClient.setQueryData(KEY, e.payload.schedules));
    return () => void un.then((f) => f());
  }, []);
  return useQuery({ queryKey: KEY, queryFn: () => commands.schedulesList(), staleTime: Infinity });
}
