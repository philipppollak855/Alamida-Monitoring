import { describe, expect, it } from 'vitest';
import { omitUndefinedDeep } from './personnelBookings';

describe('omitUndefinedDeep', () => {
  it('entfernt undefined aus verschachtelten Objekten', () => {
    const cleaned = omitUndefinedDeep({
      bookings: {
        '260153:ceremony:trauerfeier:2026-07-28': {
          id: '260153:ceremony:trauerfeier:2026-07-28',
          note: undefined,
          arrangeurId: null,
          traegerIds: ['a'],
          bestattungsMarker: undefined,
        },
      },
      absences: {},
    });

    expect(cleaned).toEqual({
      bookings: {
        '260153:ceremony:trauerfeier:2026-07-28': {
          id: '260153:ceremony:trauerfeier:2026-07-28',
          arrangeurId: null,
          traegerIds: ['a'],
        },
      },
      absences: {},
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        cleaned.bookings['260153:ceremony:trauerfeier:2026-07-28'],
        'note'
      )
    ).toBe(false);
  });
});
