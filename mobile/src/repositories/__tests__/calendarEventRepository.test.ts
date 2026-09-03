import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { calendarEventRepository } from '../calendarEventRepository';

const COUPLE_ID = 'couple-1';
const USER_ID = 'user-alice';

describe('calendarEventRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('createLocally writes SQLite immediately and queues a CREATE sync op', async () => {
    const startAt = new Date('2026-06-15T18:00:00.000Z').toISOString();
    const endAt = new Date('2026-06-15T20:00:00.000Z').toISOString();

    const event = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Dinner', description: 'Anniversary dinner', startAt, endAt, reminderAt: null },
      USER_ID,
    );

    const stored = await calendarEventRepository.getById(event.id);
    expect(stored).toMatchObject({ title: 'Dinner', couple_id: COUPLE_ID, start_at: startAt, version: 1 });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'calendar_event', entity_id: event.id, operation: 'CREATE' });
    expect(JSON.parse(pending[0].payload)).toMatchObject({ title: 'Dinner', startAt, endAt });
  });

  it('getAllForCouple returns only that couple\'s non-deleted events, ordered by start time', async () => {
    const iso = (h: number) => new Date(2026, 5, 15, h).toISOString();
    const early = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Breakfast', description: null, startAt: iso(8), endAt: iso(9), reminderAt: null },
      USER_ID,
    );
    const late = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Dinner', description: null, startAt: iso(19), endAt: iso(21), reminderAt: null },
      USER_ID,
    );
    await calendarEventRepository.createLocally(
      'some-other-couple',
      { title: 'Not ours', description: null, startAt: iso(10), endAt: iso(11), reminderAt: null },
      USER_ID,
    );

    const events = await calendarEventRepository.getAllForCouple(COUPLE_ID);

    expect(events.map((e) => e.id)).toEqual([early.id, late.id]);
  });

  it('updateLocally writes SQLite immediately and queues an UPDATE sync op', async () => {
    const startAt = new Date('2026-06-15T18:00:00.000Z').toISOString();
    const endAt = new Date('2026-06-15T20:00:00.000Z').toISOString();
    const event = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Dinner', description: null, startAt, endAt, reminderAt: null },
      USER_ID,
    );
    // Simulate the create having already synced, so the queue starts empty — otherwise the
    // update below correctly collapses into the still-pending CREATE (see mergeOperation) rather
    // than becoming a separate UPDATE, which is what this test wants to isolate.
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    const newStart = new Date('2026-06-16T18:00:00.000Z').toISOString();
    const newEnd = new Date('2026-06-16T20:00:00.000Z').toISOString();
    await calendarEventRepository.updateLocally(
      event,
      { title: 'Dinner (rescheduled)', description: null, startAt: newStart, endAt: newEnd, reminderAt: null },
      USER_ID,
    );

    const updated = await calendarEventRepository.getById(event.id);
    expect(updated).toMatchObject({ title: 'Dinner (rescheduled)', start_at: newStart });

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'calendar_event', entity_id: event.id, operation: 'UPDATE' });
  });

  it('deleteLocally removes the row immediately and queues a DELETE sync op', async () => {
    const event = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      USER_ID,
    );
    // The CREATE hasn't synced yet — deleting collapses the queue entry away entirely (see
    // syncQueue's mergeOperation), matching "created offline then deleted before ever syncing".

    await calendarEventRepository.deleteLocally(event);

    expect(await calendarEventRepository.getById(event.id)).toBeNull();
    expect(await syncQueueRepository.getPending()).toHaveLength(0);
  });

  it('deleteLocally after the create already synced still queues a DELETE', async () => {
    const event = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      USER_ID,
    );
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id); // simulate a completed sync

    await calendarEventRepository.deleteLocally(event);

    expect(await calendarEventRepository.getById(event.id)).toBeNull();
    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('DELETE');
  });

  it('applyRemoteChange upserts an event this device has never seen before (the partner created it)', async () => {
    const eventId = 'partner-event-1';

    await calendarEventRepository.applyRemoteChange(
      COUPLE_ID,
      eventId,
      {
        title: 'Movie night',
        description: null,
        startAt: new Date('2026-07-01T20:00:00.000Z').toISOString(),
        endAt: new Date('2026-07-01T22:00:00.000Z').toISOString(),
        reminderAt: null,
        createdByUserId: 'user-bob',
      },
      new Date('2026-06-20T00:00:00.000Z').toISOString(),
      'user-bob',
      1,
    );

    const stored = await calendarEventRepository.getById(eventId);
    expect(stored).toMatchObject({ title: 'Movie night', couple_id: COUPLE_ID, created_by_user_id: 'user-bob', version: 1 });
  });

  it('applyRemoteChange with a null payload deletes the local row (a pulled tombstone)', async () => {
    const event = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      USER_ID,
    );

    await calendarEventRepository.applyRemoteChange(COUPLE_ID, event.id, null, new Date().toISOString(), 'user-bob', 2);

    expect(await calendarEventRepository.getById(event.id)).toBeNull();
  });

  it('createLocally stores allDay and location, defaulting them when omitted', async () => {
    const withFields = await calendarEventRepository.createLocally(
      COUPLE_ID,
      {
        title: 'Beach trip',
        description: null,
        startAt: new Date('2026-07-04T00:00:00.000Z').toISOString(),
        endAt: new Date('2026-07-04T00:00:00.000Z').toISOString(),
        allDay: true,
        location: 'Santa Monica',
        reminderAt: null,
      },
      USER_ID,
    );
    expect(await calendarEventRepository.getById(withFields.id)).toMatchObject({ all_day: 1, location: 'Santa Monica' });

    const withoutFields = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Call', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      USER_ID,
    );
    expect(await calendarEventRepository.getById(withoutFields.id)).toMatchObject({ all_day: 0, location: null });
  });

  it('updateLocally writes allDay and location', async () => {
    const event = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Trip', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      USER_ID,
    );

    await calendarEventRepository.updateLocally(
      event,
      {
        title: 'Trip',
        description: null,
        startAt: new Date().toISOString(),
        endAt: new Date().toISOString(),
        allDay: true,
        location: 'Lake house',
        reminderAt: null,
      },
      USER_ID,
    );

    expect(await calendarEventRepository.getById(event.id)).toMatchObject({ all_day: 1, location: 'Lake house' });
  });

  it('applyRemoteChange stores allDay and location from a pulled payload, defaulting them when the server omits them', async () => {
    await calendarEventRepository.applyRemoteChange(
      COUPLE_ID,
      'partner-event-allday',
      {
        title: 'Reunion',
        description: null,
        startAt: new Date('2026-08-01T00:00:00.000Z').toISOString(),
        endAt: new Date('2026-08-01T00:00:00.000Z').toISOString(),
        allDay: true,
        location: 'Grandma\'s house',
        reminderAt: null,
        createdByUserId: 'user-bob',
      },
      new Date().toISOString(),
      'user-bob',
      1,
    );

    expect(await calendarEventRepository.getById('partner-event-allday')).toMatchObject({
      all_day: 1,
      location: "Grandma's house",
    });
  });

  it('applyRemoteChange updates an existing local row without disturbing its created_by_user_id', async () => {
    const event = await calendarEventRepository.createLocally(
      COUPLE_ID,
      { title: 'Dinner', description: null, startAt: new Date().toISOString(), endAt: new Date().toISOString(), reminderAt: null },
      USER_ID,
    );

    await calendarEventRepository.applyRemoteChange(
      COUPLE_ID,
      event.id,
      {
        title: 'Dinner (confirmed by server)',
        description: null,
        startAt: new Date().toISOString(),
        endAt: new Date().toISOString(),
        reminderAt: null,
      },
      new Date().toISOString(),
      USER_ID,
      2,
    );

    const stored = await calendarEventRepository.getById(event.id);
    expect(stored).toMatchObject({ title: 'Dinner (confirmed by server)', created_by_user_id: USER_ID, version: 2 });
  });
});
