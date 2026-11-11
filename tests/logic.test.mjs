// Tests for logic.js. Run them with:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../logic.js');

const S = L.DEFAULT_SETTINGS;

function pace(today, entries = [], overrides = {}) {
  return L.computePace({
    terms: S.terms,
    closedDays: S.closedDays,
    targetDays: S.targetDays,
    usualRatePence: S.usualRatePence,
    entries,
    today,
    ...overrides
  });
}

function days(n, startDate = '2026-09-07', half = false) {
  return Array.from({ length: n }, (_, i) => ({
    date: L.addDays(startDate, i),
    ratePence: 20000,
    half
  }));
}

// --- Dates -------------------------------------------------------------------

test('dates: parsing rejects impossible dates', () => {
  assert.equal(L.isValidISODate('2026-02-29'), false);
  assert.equal(L.isValidISODate('2028-02-29'), true);
  assert.equal(L.isValidISODate('2026-13-01'), false);
  assert.equal(L.isValidISODate('2026-1-01'), false);
  assert.equal(L.isValidISODate(''), false);
  assert.equal(L.isValidISODate(null), false);
});

test('dates: weekdays and formatting', () => {
  assert.equal(L.weekdayOf('2026-11-11'), 3); // Wednesday
  assert.equal(L.formatDate('2026-11-11'), 'Wed 11 Nov');
  assert.equal(L.formatDate('2027-07-21', { withYear: true }), 'Wed 21 Jul 2027');
  // Across the October clock change, day numbers still step by exactly one.
  assert.equal(L.toDayNumber('2026-10-26') - L.toDayNumber('2026-10-25'), 1);
  assert.equal(L.addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(L.addDays('2027-03-27', 2), '2027-03-29');
});

test('dates: todayISO uses the local calendar date', () => {
  // Local 00:30 on 1 Nov must be 1 Nov, whatever the time zone.
  assert.equal(L.todayISO(new Date(2026, 10, 1, 0, 30)), '2026-11-01');
  assert.equal(L.todayISO(new Date(2027, 2, 28, 23, 59)), '2027-03-28');
});

// --- Money -------------------------------------------------------------------

test('money: parsing to pence and formatting', () => {
  assert.equal(L.parseMoneyToPence('200'), 20000);
  assert.equal(L.parseMoneyToPence('£185.5'), 18550);
  assert.equal(L.parseMoneyToPence('1,200.05'), 120005);
  assert.equal(L.parseMoneyToPence('0'), 0);
  assert.equal(L.parseMoneyToPence('-5'), null);
  assert.equal(L.parseMoneyToPence('abc'), null);
  assert.equal(L.parseMoneyToPence('5000.01'), null); // above the £5,000 cap
  assert.equal(L.formatPence(140000), '£1,400');
  assert.equal(L.formatPence(140050), '£1,400.50');
  assert.equal(L.formatPence(0), '£0');
  assert.equal(L.penceToInput(18550), '185.50');
});

test('money: no floating-point drift when adding many rates', () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({
    date: L.addDays('2026-09-02', i),
    ratePence: L.parseMoneyToPence('0.10') + 19000
  }));
  const p = pace('2026-12-01', entries);
  assert.equal(p.earnedPence, 30 * 19010);
});

// --- Teaching days -----------------------------------------------------------

test('teaching days: default 2026–27 dates give 194 in total', () => {
  const td = L.teachingDays(S.terms, S.closedDays);
  assert.deepEqual(td.perTerm, [38, 35, 30, 24, 34, 33]);
  assert.equal(td.days.length, 194);
});

test('teaching days: without the bank holiday there are 195', () => {
  assert.equal(L.teachingDays(S.terms, []).days.length, 195);
});

test('teaching days: a closed day on a weekend changes nothing', () => {
  assert.equal(L.teachingDays(S.terms, ['2027-05-03', '2026-11-14']).days.length, 194);
});

// --- Expected pace -----------------------------------------------------------

test('pace: before the year starts nothing is expected', () => {
  const p = pace('2026-08-20');
  assert.equal(p.phase, 'before');
  assert.equal(p.elapsedTeachingDays, 0);
  assert.equal(p.expected, 0);
  assert.equal(p.verdict, 'on-track');
  assert.equal(L.describeToday(p), 'The school year starts Wed 2 Sep.');
});

test('pace: the first day counts itself', () => {
  const p = pace('2026-09-02');
  assert.equal(p.elapsedTeachingDays, 1);
  assert.ok(Math.abs(p.expected - 24 / 194) < 1e-9);
});

test('pace: on Wed 11 Nov 2026, 46 teaching days have gone', () => {
  const p = pace('2026-11-11');
  assert.equal(p.elapsedTeachingDays, 46);
  assert.equal(p.remainingTeachingDays, 148);
  assert.ok(Math.abs(p.expected - (24 * 46) / 194) < 1e-9); // about 5.69
});

test('pace: half-term holiday does not move the expected figure', () => {
  const lastDay = pace('2026-10-23');
  const holiday = pace('2026-10-28');
  const backAgain = pace('2026-11-01'); // the Sunday before term
  assert.equal(lastDay.elapsedTeachingDays, 38);
  assert.equal(holiday.elapsedTeachingDays, 38);
  assert.equal(backAgain.elapsedTeachingDays, 38);
  assert.equal(holiday.expected, lastDay.expected);
  assert.equal(holiday.offToday, 'holiday');
  assert.equal(holiday.nextTeachingDay, '2026-11-02');
  assert.equal(L.describeToday(holiday), 'School holiday. Back Mon 2 Nov.');
});

test('pace: Christmas holiday reports the next teaching day in January', () => {
  const p = pace('2026-12-25');
  assert.equal(p.offToday, 'holiday');
  assert.equal(p.nextTeachingDay, '2027-01-04');
});

test('pace: an extra closed day in term is not a teaching day', () => {
  const p = pace('2027-05-03');
  assert.equal(p.offToday, 'closed');
  assert.equal(p.nextTeachingDay, '2027-05-04');
  assert.equal(pace('2027-04-30').elapsedTeachingDays, p.elapsedTeachingDays);
});

test('pace: a weekend in term is not called a holiday', () => {
  const p = pace('2026-11-14');
  assert.equal(p.offToday, 'weekend');
  assert.equal(L.describeToday(p), null);
});

test('pace: after the year ends the full target is expected', () => {
  const p = pace('2027-08-10', days(20));
  assert.equal(p.phase, 'after');
  assert.equal(p.elapsedTeachingDays, 194);
  assert.equal(p.expected, 24);
  assert.equal(p.verdict, 'short');
  assert.equal(L.describeVerdict(p).detail, 'Short by 4 days');
  assert.equal(L.describePaceNeeded(p.remaining, p.remainingTeachingDays), null);
});

test('pace: after the year with the target met says so', () => {
  const p = pace('2027-08-10', days(24));
  assert.equal(p.verdict, 'reached');
  assert.equal(L.describeVerdict(p).headline, 'Target reached');
});

// --- Verdict thresholds ------------------------------------------------------

// Use a target equal to the teaching days, so "expected" is a whole number.
function exact(today, doneCount) {
  return pace(today, days(doneCount, '2026-09-02', false).map((e) => ({ ...e, half: false })), {
    targetDays: 194
  });
}

test('verdict: exactly 1 day ahead is Ahead', () => {
  // 10 Sep 2026: 7 teaching days gone, so 7 expected with a target of 194.
  const p = exact('2026-09-10', 8);
  assert.equal(p.expected, 7);
  assert.equal(p.verdict, 'ahead');
  assert.equal(L.describeVerdict(p).detail, '1 day ahead');
});

test('verdict: half a day either side is On track', () => {
  const ahead = pace('2026-09-10', [...days(7, '2026-09-02'), { date: '2026-09-10', ratePence: 0, half: true }], { targetDays: 194 });
  assert.equal(ahead.verdict, 'on-track');
  assert.equal(L.describeVerdict(ahead).detail, 'half a day ahead');
  const level = exact('2026-09-10', 7);
  assert.equal(level.verdict, 'on-track');
  assert.equal(L.describeVerdict(level).detail, 'Right on pace');
});

test('verdict: exactly 1 day behind is Behind', () => {
  const p = exact('2026-09-10', 6);
  assert.equal(p.verdict, 'behind');
  assert.equal(L.describeVerdict(p).detail, '1 day behind');
});

test('verdict: 0.96 days ahead stays On track and never reads as "1 day"', () => {
  const p = pace('2026-11-11', days(7));
  // 7 - 5.69 = 1.31 -> Ahead
  assert.equal(p.verdict, 'ahead');
  assert.equal(L.describeVerdict(p).detail, '1.3 days ahead');
  const q = { ...p, verdict: 'on-track', difference: 0.96 };
  assert.equal(L.describeVerdict(q).detail, '0.9 days ahead');
});

test('verdict: target reached wins over everything', () => {
  const p = pace('2026-09-10', days(24));
  assert.equal(p.verdict, 'reached');
  assert.equal(L.describeVerdict(p).detail, 'Every day you needed, done');
  const more = pace('2026-09-10', days(26));
  assert.equal(L.describeVerdict(more).detail, '2 days more than you needed');
});

test('verdict: a target of 0 is already reached, with no division by zero', () => {
  const p = pace('2026-11-11', [], { targetDays: 0 });
  assert.equal(p.verdict, 'reached');
  assert.equal(p.expected, 0);
  assert.equal(p.doneFraction, 1);
  assert.equal(L.describePaceNeeded(p.remaining, p.remainingTeachingDays), null);
});

test('verdict: no entries mid-year', () => {
  const p = pace('2026-11-11', []);
  assert.equal(p.done, 0);
  assert.equal(p.verdict, 'behind');
  assert.equal(p.earnedPence, 0);
  assert.equal(p.doneFraction, 0);
});

// --- Half days and money -----------------------------------------------------

test('half days count 0.5 and earn half the rate', () => {
  const p = pace('2026-11-11', [
    { date: '2026-09-07', ratePence: 20000, half: true },
    { date: '2026-09-08', ratePence: 20001, half: true },
    { date: '2026-09-09', ratePence: 18000, half: false }
  ]);
  assert.equal(p.done, 2);
  assert.equal(p.earnedPence, 10000 + 10001 + 18000);
  assert.equal(p.targetIncomePence, 24 * 20000);
});

// --- Entries outside the year ------------------------------------------------

test('entries outside the school year are kept but not counted', () => {
  const entries = [
    { date: '2026-07-15', ratePence: 20000 }, // last school year
    { date: '2026-09-01', ratePence: 20000 }, // day before term
    { date: '2026-09-02', ratePence: 20000 }, // first day: counts
    { date: '2026-10-28', ratePence: 20000 }, // half-term: inside the year, counts
    { date: '2027-07-22', ratePence: 20000 } // day after the year
  ];
  const p = pace('2026-11-11', entries);
  assert.equal(p.done, 2);
  assert.equal(p.countedEntries, 2);
  assert.equal(p.outsideEntries, 3);
  assert.equal(p.earnedPence, 40000);
  assert.equal(L.isInYear('2026-09-01', S.terms), false);
  assert.equal(L.isInYear('2027-07-21', S.terms), true);
});

// --- Pace needed wording -----------------------------------------------------

test('pace needed: one every few weeks', () => {
  assert.equal(L.describePaceNeeded(9, 105), '9 more days in the 21 teaching weeks left: about one every 2 weeks');
  assert.equal(L.describePaceNeeded(1, 50), '1 more day in the 10 teaching weeks left: about one every 10 weeks');
});

test('pace needed: about one a week, and more than one a week', () => {
  assert.equal(L.describePaceNeeded(10, 50), '10 more days in the 10 teaching weeks left: about one a week');
  assert.equal(L.describePaceNeeded(15, 50), '15 more days in the 10 teaching weeks left: about 1.5 a week');
  assert.equal(L.describePaceNeeded(20, 50), '20 more days in the 10 teaching weeks left: about 2 a week');
});

test('pace needed: half days and the last few days of the year', () => {
  assert.equal(L.describePaceNeeded(2.5, 3), '2.5 more days in the 3 teaching days left');
  assert.equal(L.describePaceNeeded(0.5, 100), 'Half a day more in the 20 teaching weeks left');
  assert.equal(L.describePaceNeeded(3, 3), '3 more days in the 3 teaching days left: every teaching day');
  assert.equal(L.describePaceNeeded(4, 3), '4 more days in the 3 teaching days left: more than there are teaching days');
  assert.equal(L.describePaceNeeded(1, 1), '1 more day in the 1 teaching day left: every teaching day');
});

test('pace needed: nothing to say when done or out of time', () => {
  assert.equal(L.describePaceNeeded(0, 50), null);
  assert.equal(L.describePaceNeeded(3, 0), null);
});

test('pace needed: real figures for 11 Nov 2026 with 7 days done', () => {
  const p = pace('2026-11-11', days(7));
  assert.equal(p.remaining, 17);
  assert.equal(
    L.describePaceNeeded(p.remaining, p.remainingTeachingDays),
    '17 more days in the 30 teaching weeks left: about one every 2 weeks'
  );
});

// --- Invalid term dates ------------------------------------------------------

test('invalid terms: an end before a start', () => {
  const terms = S.terms.map((t) => ({ ...t }));
  terms[2] = { start: '2027-02-12', end: '2027-01-04' };
  const p = pace('2026-11-11', [], { terms });
  assert.equal(p.valid, false);
  assert.equal(p.message, 'Spring 1 ends before it starts.');
});

test('invalid terms: overlapping or out of order', () => {
  const terms = S.terms.map((t) => ({ ...t }));
  terms[1] = { start: '2026-10-20', end: '2026-12-18' };
  assert.match(L.validateTerms(terms).message, /Autumn 2 starts before Autumn 1 ends/);
  const swapped = [S.terms[1], S.terms[0], ...S.terms.slice(2)];
  assert.equal(L.validateTerms(swapped).ok, false);
});

test('invalid terms: missing, empty, garbled or too long', () => {
  assert.equal(L.validateTerms([]).ok, false);
  assert.equal(L.validateTerms(null).ok, false);
  assert.equal(L.validateTerms([{ start: '2026-09-02', end: 'soon' }]).ok, false);
  assert.equal(L.validateTerms([{ start: '2026-09-02', end: '2028-07-01' }]).ok, false);
});

test('invalid terms: a term with no teaching days at all', () => {
  const p = pace('2026-11-11', [], { terms: [{ start: '2026-11-14', end: '2026-11-15' }] });
  assert.equal(p.valid, false);
  assert.match(p.message, /no teaching days/);
});

test('no NaN or Infinity anywhere, whatever the input', () => {
  const odd = [
    pace('2026-11-11', [], { targetDays: 'abc' }),
    pace('2026-11-11', [], { targetDays: -3 }),
    pace('2026-11-11', [{ date: 'nope', ratePence: 5 }], { usualRatePence: undefined }),
    pace('2026-08-01', [], { targetDays: 0 })
  ];
  for (const p of odd) {
    for (const [key, value] of Object.entries(p)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ' is ' + value);
    }
  }
});

// --- Saved data and imports --------------------------------------------------

test('import: rejects things that are not On Track data', () => {
  for (const bad of [null, 42, 'text', [], {}, { version: 2 }, { version: 1 }, { version: 1, settings: { terms: 'x' } }]) {
    const r = L.normaliseData(bad);
    assert.equal(r.ok, false);
    assert.equal(typeof r.message, 'string');
  }
});

test('import: cleans entries and skips broken ones', () => {
  const r = L.normaliseData({
    version: 1,
    settings: { targetDays: 24.3, usualRatePence: 20000, terms: S.terms, closedDays: ['2027-05-03', 'bad', '2027-05-03'] },
    entries: [
      { id: 'a', date: '2026-09-07', ratePence: 20000, half: false, note: '  Example   school\n' },
      { id: 'a', date: '2026-09-08', ratePence: 18000, half: 'yes', note: 'x'.repeat(500) },
      { date: '2026-02-30', ratePence: 1 },
      { date: '2026-09-09', ratePence: -1 },
      { date: '2026-09-09', ratePence: 99999999 },
      'not an entry'
    ]
  });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 4);
  assert.equal(r.data.entries.length, 2);
  assert.equal(r.data.entries[0].note, 'Example school');
  assert.equal(r.data.entries[1].half, false);
  assert.equal(r.data.entries[1].note.length, L.LIMITS.maxNoteLength);
  assert.notEqual(r.data.entries[0].id, r.data.entries[1].id);
  assert.equal(r.data.settings.targetDays, 24.5);
  assert.deepEqual(r.data.settings.closedDays, ['2027-05-03']);
});

test('import: the default data survives a round trip', () => {
  const data = L.defaultData();
  const r = L.normaliseData(JSON.parse(JSON.stringify(data)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, data);
});

// --- Example days ------------------------------------------------------------

test('example days land about a day ahead of pace on 11 Nov 2026', () => {
  const entries = L.makeExampleEntries(S, '2026-11-11');
  const p = pace('2026-11-11', entries);
  assert.ok(p.difference >= 0.5 && p.difference <= 1.6, 'difference was ' + p.difference);
  assert.ok(entries.every((e) => e.example && e.date <= '2026-11-11'));
  assert.equal(new Set(entries.map((e) => e.date)).size, entries.length);
  assert.ok(entries.every((e) => L.isWeekday(e.date)));
});

test('example days: none before the year starts, fine on the last day', () => {
  assert.deepEqual(L.makeExampleEntries(S, '2026-08-01'), []);
  const late = L.makeExampleEntries(S, '2027-07-21');
  assert.ok(late.length > 0);
  assert.equal(pace('2027-07-21', late).verdict, 'reached');
});
