import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DueRun, NewQueueItem } from "@/core/ipc";
import { persistStorage } from "@/core/store/persist";


export interface Review {
  scheduleId: string;
  name: string;
  items: NewQueueItem[];
  at: string;
}

interface SchedulerState {
  reviews: Review[];

  manual: DueRun | null;
  addReview: (r: Review) => void;
  dropReview: (scheduleId: string) => void;
}

export const useScheduler = create<SchedulerState>()(
  persist(
    (set) => ({
      reviews: [],
      manual: null,
      addReview: (r) =>
        set((s) => ({ reviews: [r, ...s.reviews.filter((x) => x.scheduleId !== r.scheduleId)] })),
      dropReview: (id) => set((s) => ({ reviews: s.reviews.filter((x) => x.scheduleId !== id) })),
    }),
    { name: "scheduler", version: 1, storage: persistStorage, partialize: ({ reviews }) => ({ reviews }) },
  ),
);
