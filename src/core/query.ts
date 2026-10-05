import { QueryClient } from "@tanstack/react-query";
import { IpcError } from "./ipc";

const NO_RETRY = new Set(["github.unauthorized", "github.forbidden", "github.not_found", "auth.not_signed_in", "auth.token_missing"]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: true,
      retry: (count, e) => !(e instanceof IpcError && NO_RETRY.has(e.appError.code)) && count < 2,
    },
  },
});
