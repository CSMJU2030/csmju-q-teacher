import {
  BookingRule,
  OfficeHourRule,
  addDays,
  buildDaySlots,
  formatTimeOfDay,
  localDateOf,
  localMidnight,
  parseTimeOfDay,
  weekDates,
  weekdayOf,
} from './schedule.util';

/** 2026-10-05 is a Monday. */
const MON = '2026-10-05';

/** `HH:mm` Bangkok time on a calendar date, as the UTC instant that is stored. */
const at = (date: string, time: string): Date =>
  new Date(localMidnight(date).getTime() + (parseTimeOfDay(time) as number) * 60_000);

const monday9to11: OfficeHourRule = {
  dayOfWeek: 'MON',
  startMinute: 9 * 60,
  endMinute: 11 * 60,
  slotMinutes: 30,
  isAvailable: true,
};

const times = (slots: { startsAt: Date }[]) =>
  slots.map((slot) => formatTimeOfDay(((slot.startsAt.getTime() - localMidnight(MON).getTime()) / 60_000)));

describe('Bangkok calendar dates', () => {
  it('starts a Bangkok day 7 hours before UTC midnight', () => {
    expect(localMidnight('2026-10-05').toISOString()).toBe('2026-10-04T17:00:00.000Z');
  });

  it('reads an instant back as its Bangkok date', () => {
    expect(localDateOf(new Date('2026-10-04T17:00:00.000Z'))).toBe('2026-10-05');
    expect(localDateOf(new Date('2026-10-05T16:59:59.000Z'))).toBe('2026-10-05');
    expect(localDateOf(new Date('2026-10-05T17:00:00.000Z'))).toBe('2026-10-06');
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('lists Monday to Friday of the week of any date, weekend included in the week before', () => {
    expect(weekDates('2026-10-07')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
    expect(weekDates('2026-10-11')[0]).toBe('2026-10-05'); // Sunday
    expect(weekDates('2026-10-10')[0]).toBe('2026-10-05'); // Saturday
  });

  it('has no weekday code for a weekend', () => {
    expect(weekdayOf('2026-10-05')).toBe('MON');
    expect(weekdayOf('2026-10-09')).toBe('FRI');
    expect(weekdayOf('2026-10-10')).toBeNull();
  });

  it('parses and formats a time of day', () => {
    expect(parseTimeOfDay('09:30')).toBe(570);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('9:30')).toBeNull();
    expect(formatTimeOfDay(570)).toBe('09:30');
  });
});

describe('buildDaySlots', () => {
  it('cuts the office hours of that weekday into slots', () => {
    const slots = buildDaySlots(MON, [monday9to11], [], []);

    expect(times(slots)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(slots.every((slot) => slot.status === 'AVAILABLE')).toBe(true);
  });

  it('gives no slot on another weekday, on a weekend or for hours that are switched off', () => {
    expect(buildDaySlots('2026-10-06', [monday9to11], [], [])).toEqual([]);
    expect(buildDaySlots('2026-10-10', [monday9to11], [], [])).toEqual([]);
    expect(buildDaySlots(MON, [{ ...monday9to11, isAvailable: false }], [], [])).toEqual([]);
  });

  it('drops a slot that would run past the end of the office hours', () => {
    const slots = buildDaySlots(MON, [{ ...monday9to11, endMinute: 10 * 60 + 45 }], [], []);

    expect(times(slots)).toEqual(['09:00', '09:30', '10:00']);
  });

  it('removes every slot an UNAVAILABLE exception overlaps', () => {
    const slots = buildDaySlots(
      MON,
      [monday9to11],
      [{ startsAt: at(MON, '09:30'), endsAt: at(MON, '10:30'), status: 'UNAVAILABLE' }],
      [],
    );

    expect(times(slots)).toEqual(['09:00', '10:30']);
  });

  it('adds an AVAILABLE exception on a busy hour', () => {
    const slots = buildDaySlots(
      MON,
      [monday9to11],
      [{ startsAt: at(MON, '13:00'), endsAt: at(MON, '14:00'), status: 'AVAILABLE' }],
      [],
    );

    expect(times(slots)).toEqual(['09:00', '09:30', '10:00', '10:30', '13:00']);
  });

  it('does not add an AVAILABLE exception on top of a slot that is already there', () => {
    const slots = buildDaySlots(
      MON,
      [monday9to11],
      [{ startsAt: at(MON, '09:00'), endsAt: at(MON, '10:00'), status: 'AVAILABLE' }],
      [],
    );

    expect(slots).toHaveLength(4);
  });

  it('lets the newest exception on the same time win (open, then close again)', () => {
    const opened = { startsAt: at(MON, '13:00'), endsAt: at(MON, '14:00'), status: 'AVAILABLE' as const };
    const closed = { ...opened, status: 'UNAVAILABLE' as const };

    expect(times(buildDaySlots(MON, [], [opened, closed], []))).toEqual([]);
    expect(times(buildDaySlots(MON, [], [closed, opened], []))).toEqual(['13:00']);
  });

  it('ignores an exception on another day', () => {
    const slots = buildDaySlots(
      MON,
      [monday9to11],
      [{ startsAt: at('2026-10-06', '09:00'), endsAt: at('2026-10-06', '12:00'), status: 'UNAVAILABLE' }],
      [],
    );

    expect(slots).toHaveLength(4);
  });

  it('marks a slot BOOKED when a booking overlaps it', () => {
    const booking: BookingRule = {
      startsAt: at(MON, '09:30'),
      endsAt: at(MON, '10:00'),
      status: 'CONFIRMED',
    };
    const slots = buildDaySlots(MON, [monday9to11], [], [booking]);

    expect(slots.map((slot) => slot.status)).toEqual(['AVAILABLE', 'BOOKED', 'AVAILABLE', 'AVAILABLE']);
    expect(slots[1].booking).toBe(booking);
  });

  it('frees the slot again when the booking is cancelled, but keeps a completed one booked', () => {
    const cancelled: BookingRule = { startsAt: at(MON, '09:00'), endsAt: at(MON, '09:30'), status: 'CANCELLED' };
    const completed: BookingRule = { startsAt: at(MON, '10:00'), endsAt: at(MON, '10:30'), status: 'COMPLETED' };
    const slots = buildDaySlots(MON, [monday9to11], [], [cancelled, completed]);

    expect(slots.map((slot) => slot.status)).toEqual(['AVAILABLE', 'AVAILABLE', 'BOOKED', 'AVAILABLE']);
  });
});
