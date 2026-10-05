import { useCallback, useEffect, useRef, useState } from "react";
import { commands, unwrap, type AppError, type DeviceCode } from "@/core/ipc";
import { toAppError } from "@/core/ipc";

export type DeviceState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "waiting"; code: DeviceCode }
  | { phase: "done" }
  | { phase: "error"; error: AppError };


export function useDeviceFlow(onComplete: () => void) {
  const [state, setState] = useState<DeviceState>({ phase: "idle" });
  const run = useRef(0);

  const cancel = useCallback(() => {
    run.current++;
    setState({ phase: "idle" });
  }, []);

  useEffect(() => () => void run.current++, []);

  const start = useCallback(
    async (clientId: string) => {
      const id = ++run.current;
      setState({ phase: "starting" });
      try {
        const code = await unwrap(commands.authDeviceStart(clientId));
        if (id !== run.current) return;
        setState({ phase: "waiting", code });

        let interval = code.interval;
        const deadline = Date.now() + code.expires_in * 1000;
        while (id === run.current && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, interval * 1000));
          if (id !== run.current) return;
          const res = await unwrap(commands.authDevicePoll(code.client_id, code.device_code));
          if (res.status === "slow_down") interval = res.interval;
          if (res.status === "complete") {
            setState({ phase: "done" });
            onComplete();
            return;
          }
        }
        if (id === run.current) setState({ phase: "error", error: { code: "auth.device_expired", detail: null, status: null } });
      } catch (e) {
        if (id === run.current) setState({ phase: "error", error: toAppError(e) });
      }
    },
    [onComplete],
  );

  return { state, start, cancel };
}
