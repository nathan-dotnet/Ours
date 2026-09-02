import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { calendarEventRepository, type CalendarEventInput } from '../repositories/calendarEventRepository';
import { useSyncStore } from '../stores/syncStore';
import { triggerSync } from '../sync';
import type { CalendarEvent } from '../types/entities';

/**
 * Same pattern as useCouple.ts: read straight from SQLite (never from an API response), with
 * `lastSyncedAt` folded into the query key so a completed sync — which may change SQLite outside
 * of React's knowledge — triggers a refetch.
 */
export function useCalendarEvents(coupleId: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', coupleId, lastSyncedAt],
    queryFn: () => (coupleId ? calendarEventRepository.getAllForCouple(coupleId) : Promise.resolve([])),
    enabled: Boolean(coupleId),
  });
}

export function useCalendarEvent(id: string | undefined) {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  return useQuery<CalendarEvent | null>({
    queryKey: ['calendar-event', id, lastSyncedAt],
    queryFn: () => (id ? calendarEventRepository.getById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

/** Offline-first create: writes SQLite + queues the sync op immediately, then nudges the engine to flush if online. */
export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useCallback(
    async (coupleId: string, input: CalendarEventInput, createdByUserId: string) => {
      const event = await calendarEventRepository.createLocally(coupleId, input, createdByUserId);
      await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      triggerSync();
      return event;
    },
    [queryClient],
  );
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useCallback(
    async (event: CalendarEvent, input: CalendarEventInput, updatedByUserId: string) => {
      await calendarEventRepository.updateLocally(event, input, updatedByUserId);
      await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      await queryClient.invalidateQueries({ queryKey: ['calendar-event'] });
      triggerSync();
    },
    [queryClient],
  );
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useCallback(
    async (event: CalendarEvent) => {
      await calendarEventRepository.deleteLocally(event);
      await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      triggerSync();
    },
    [queryClient],
  );
}
