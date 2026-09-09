import { describeMissMeMoment, formatMomentTimestamp } from '../missMeActivity';
import type { MissMeInteractionDto } from '../../types/api';

const nathaniel = 'user-nathaniel';
const partner = 'user-partner';

function interaction(overrides: Partial<MissMeInteractionDto>): MissMeInteractionDto {
  return {
    id: 'interaction-1',
    senderUserId: nathaniel,
    senderDisplayName: 'Nathaniel',
    receiverUserId: partner,
    type: 'MissMe',
    inResponseToId: null,
    createdAt: '2026-09-03T20:42:00.000Z',
    ...overrides,
  };
}

describe('describeMissMeMoment', () => {
  it("reads as the sender's gesture when the viewer received it", () => {
    const item = interaction({ type: 'MissMe' });
    expect(describeMissMeMoment(item, partner, 'Nathaniel')).toBe('Nathaniel missed you');
  });

  it('reads as "You missed X" when the viewer was the sender', () => {
    const item = interaction({ type: 'MissMe', senderUserId: partner, senderDisplayName: 'Partner' });
    expect(describeMissMeMoment(item, partner, 'Nathaniel')).toBe('You missed Nathaniel');
  });

  it('adds "too" for a MissYouToo reply, from either side', () => {
    const received = interaction({ type: 'MissYouToo' });
    expect(describeMissMeMoment(received, partner, 'Nathaniel')).toBe('Nathaniel missed you too');

    const sent = interaction({ type: 'MissYouToo', senderUserId: partner, senderDisplayName: 'Partner' });
    expect(describeMissMeMoment(sent, partner, 'Nathaniel')).toBe('You missed Nathaniel too');
  });
});

describe('formatMomentTimestamp', () => {
  it('reads "Today" for a moment on the same local day', () => {
    const createdAt = new Date(2026, 8, 3, 20, 42).toISOString();
    const now = new Date(2026, 8, 3, 21, 0);
    expect(formatMomentTimestamp(createdAt, now)).toMatch(/^Today · /);
  });

  it('uses a short date for an earlier day', () => {
    const createdAt = new Date(2026, 8, 1, 9, 0).toISOString();
    const now = new Date(2026, 8, 3, 21, 0);
    expect(formatMomentTimestamp(createdAt, now)).not.toMatch(/^Today/);
  });
});
