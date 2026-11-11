/*
  On Track: the sums.

  Everything in this file is a "pure" function: it takes some values and
  returns an answer, and never touches the page or the saved data. That makes
  it easy to test (see tests/logic.test.mjs) and easy to change safely.

  Dates are always plain text in the form "YYYY-MM-DD" (for example
  "2026-11-11"). We never use new Date("2026-11-11"), because browsers read
  that as midnight in London-winter time (UTC) and it can slip to the day
  before. Instead we turn each date into a "day number" (days since
  1 January 1970) and do the maths on whole numbers, so clock changes and
  time zones can never move a day.

  Money is always whole pence (20000 = £200), so adding up never drifts.
*/
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Default settings. Every figure here is an example for you to change.
  // ---------------------------------------------------------------------------

  var DEFAULT_SETTINGS = {
    targetDays: 24,
    usualRatePence: 20000, // £200: an example day rate
    // Typical England dates for 2026–27. Check your council's.
    terms: [
      { start: '2026-09-02', end: '2026-10-23' },
      { start: '2026-11-02', end: '2026-12-18' },
      { start: '2027-01-04', end: '2027-02-12' },
      { start: '2027-02-22', end: '2027-03-25' },
      { start: '2027-04-12', end: '2027-05-28' },
      { start: '2027-06-07', end: '2027-07-21' }
    ],
    closedDays: ['2027-05-03'] // bank holiday
  };

  var TERM_NAMES = ['Autumn 1', 'Autumn 2', 'Spring 1', 'Spring 2', 'Summer 1', 'Summer 2'];

  var LIMITS = {
    maxRatePence: 500000, // £5,000 a day is the most we accept
    maxTargetDays: 366,
    maxNoteLength: 60,
    maxTerms: 12,
    maxClosedDays: 100,
    maxEntries: 5000,
    maxYearSpanDays: 400
  };

  // ---------------------------------------------------------------------------
  // Dates
  // ---------------------------------------------------------------------------

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // "2026-11-11" -> { year: 2026, month: 11, day: 11 }, or null if not a real date.
  function parseISODate(text) {
    if (typeof text !== 'string') return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
    var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > daysInMonth) return null;
    return { year: year, month: month, day: day };
  }

  function isValidISODate(text) {
    return parseISODate(text) !== null;
  }

  // "2026-11-11" -> a whole number of days since 1 Jan 1970.
  function toDayNumber(text) {
    var d = parseISODate(text);
    if (!d) return NaN;
    return Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86400000);
  }

  // A day number back to "YYYY-MM-DD".
  function fromDayNumber(n) {
    var date = new Date(n * 86400000);
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }

  function addDays(text, days) {
    return fromDayNumber(toDayNumber(text) + days);
  }

  // 0 = Sunday, 1 = Monday ... 6 = Saturday. 1 Jan 1970 was a Thursday (4).
  function weekdayOf(text) {
    var n = toDayNumber(text);
    return (((n + 4) % 7) + 7) % 7;
  }

  function isWeekday(text) {
    var w = weekdayOf(text);
    return w >= 1 && w <= 5;
  }

  // Today's date on this device's own calendar (not UTC).
  function todayISO(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // "2026-11-11" -> "Wed 11 Nov" (add the year with { withYear: true }).
  function formatDate(text, options) {
    var d = parseISODate(text);
    if (!d) return '';
    var label = DAY_NAMES[weekdayOf(text)] + ' ' + d.day + ' ' + MONTH_NAMES[d.month - 1];
    if (options && options.withYear) label += ' ' + d.year;
    return label;
  }

  function monthShort(text) {
    var d = parseISODate(text);
    return d ? MONTH_NAMES[d.month - 1] : '';
  }

  // ---------------------------------------------------------------------------
  // Money and numbers
  // ---------------------------------------------------------------------------

  // 140050 -> "£1,400.50"; 140000 -> "£1,400" (pence shown only when there are some).
  function formatPence(pence) {
    var p = Math.round(Number(pence) || 0);
    var negative = p < 0;
    p = Math.abs(p);
    var pounds = Math.floor(p / 100);
    var rest = p % 100;
    var text = '£' + String(pounds).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (rest) text += '.' + pad2(rest);
    return (negative ? '−' : '') + text;
  }

  // What someone typed ("200", "£185.50", "1,200") -> whole pence, or null.
  function parseMoneyToPence(text) {
    if (typeof text === 'number') text = String(text);
    if (typeof text !== 'string') return null;
    var cleaned = text.replace(/[£,\s]/g, '');
    var match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(cleaned);
    if (!match) return null;
    var pence = Number(match[1]) * 100 + (match[2] ? Number((match[2] + '0').slice(0, 2)) : 0);
    if (pence > LIMITS.maxRatePence) return null;
    return pence;
  }

  // Pence -> the text to show inside a money box ("200" or "185.50").
  function penceToInput(pence) {
    var p = Math.round(Number(pence) || 0);
    var rest = p % 100;
    return String(Math.floor(p / 100)) + (rest ? '.' + pad2(rest) : '');
  }

  // Round to one decimal place, towards zero, without floating-point fuzz.
  function trunc1(n) {
    var tenths = Math.round(n * 1000) / 100; // e.g. 1.2999999 -> 13.0
    return Math.trunc(tenths) / 10;
  }

  // 1 -> "1 day", 0.5 -> "half a day", 2.5 -> "2.5 days" (with a non-breaking space).
  function formatDays(n) {
    var v = Math.round(Math.abs(n) * 10) / 10;
    if (v === 0.5) return 'half a day';
    return v + ' ' + (v === 1 ? 'day' : 'days');
  }

  // ---------------------------------------------------------------------------
  // Term dates
  // ---------------------------------------------------------------------------

  function termName(index, count) {
    return count === 6 ? TERM_NAMES[index] : 'Term ' + (index + 1);
  }

  // Checks term dates. Returns { ok: true } or { ok: false, message: '...' }.
  function validateTerms(terms) {
    if (!Array.isArray(terms) || terms.length === 0) {
      return { ok: false, message: 'Add the term dates to get started.' };
    }
    if (terms.length > LIMITS.maxTerms) {
      return { ok: false, message: 'There are more than ' + LIMITS.maxTerms + ' terms. Remove some.' };
    }
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i] || {};
      var name = termName(i, terms.length);
      if (!isValidISODate(t.start) || !isValidISODate(t.end)) {
        return { ok: false, message: name + ' needs a start and an end date.', termIndex: i };
      }
      if (toDayNumber(t.end) < toDayNumber(t.start)) {
        return { ok: false, message: name + ' ends before it starts.', termIndex: i };
      }
      if (i > 0 && toDayNumber(t.start) <= toDayNumber(terms[i - 1].end)) {
        return {
          ok: false,
          message: name + ' starts before ' + termName(i - 1, terms.length) + ' ends. Put the terms in order, with no overlaps.',
          termIndex: i
        };
      }
    }
    var span = toDayNumber(terms[terms.length - 1].end) - toDayNumber(terms[0].start);
    if (span > LIMITS.maxYearSpanDays) {
      return { ok: false, message: 'These dates cover more than one school year. Use one year’s terms.' };
    }
    return { ok: true };
  }

  // Every teaching day, as day numbers, plus how many fall in each term.
  // Teaching day = Monday to Friday, inside a term, not an extra closed day.
  function teachingDays(terms, closedDays) {
    var closed = {};
    (closedDays || []).forEach(function (d) {
      if (isValidISODate(d)) closed[toDayNumber(d)] = true;
    });
    var all = [];
    var perTerm = [];
    terms.forEach(function (t) {
      var count = 0;
      for (var n = toDayNumber(t.start); n <= toDayNumber(t.end); n++) {
        var weekday = (((n + 4) % 7) + 7) % 7;
        if (weekday >= 1 && weekday <= 5 && !closed[n]) {
          all.push(n);
          count++;
        }
      }
      perTerm.push(count);
    });
    return { days: all, perTerm: perTerm };
  }

  // ---------------------------------------------------------------------------
  // Logged days
  // ---------------------------------------------------------------------------

  // How much of a day an entry counts for: 1, or 0.5 for a half day.
  function entryAmount(entry) {
    return entry && entry.half ? 0.5 : 1;
  }

  // What an entry earned, in pence. A half day earns half the day rate.
  function entryEarnedPence(entry) {
    var rate = Math.round(Number(entry && entry.ratePence) || 0);
    return entry && entry.half ? Math.round(rate / 2) : rate;
  }

  // Is this date inside the school year (first term start to last term end)?
  function isInYear(date, terms) {
    var n = toDayNumber(date);
    return n >= toDayNumber(terms[0].start) && n <= toDayNumber(terms[terms.length - 1].end);
  }

  // Newest first; if two are on the same day, the one added last comes first.
  function sortEntries(entries) {
    return entries.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  // ---------------------------------------------------------------------------
  // The pace calculation: the heart of the app
  // ---------------------------------------------------------------------------

  /*
    Works out where you are for the school year.

    input: {
      terms, closedDays,   // settings
      targetDays,          // e.g. 24
      usualRatePence,      // e.g. 20000
      entries,             // [{ date, ratePence, half }]
      today                // "YYYY-MM-DD"
    }

    Returns { valid: false, message } if the term dates can't be used,
    otherwise an object full of plain numbers and words (see the bottom).
  */
  function computePace(input) {
    var terms = input.terms;
    var check = validateTerms(terms);
    if (!check.ok) return { valid: false, message: check.message };

    var td = teachingDays(terms, input.closedDays);
    var total = td.days.length;
    if (total === 0) {
      return { valid: false, message: 'These dates have no teaching days. Check the terms and closed days.' };
    }

    var target = Number(input.targetDays);
    if (!isFinite(target) || target < 0) target = 0;
    var todayN = toDayNumber(input.today);
    var firstN = toDayNumber(terms[0].start);
    var lastN = toDayNumber(terms[terms.length - 1].end);

    // Teaching days gone, counting today if today is one.
    var elapsed = 0;
    for (var i = 0; i < total; i++) {
      if (td.days[i] <= todayN) elapsed++;
      else break;
    }
    var remainingTeachingDays = total - elapsed; // the ones after today
    var nextTeachingDay = elapsed < total ? fromDayNumber(td.days[elapsed]) : null;

    var phase;
    if (todayN < firstN) phase = 'before';
    else if (todayN > lastN) phase = 'after';
    else phase = 'during';

    // Is today a holiday, a closed day or a weekend (inside the school year)?
    var todayIsTeachingDay = elapsed > 0 && td.days[elapsed - 1] === todayN;
    var offToday = null; // 'holiday' | 'closed' | 'weekend' | null
    if (phase === 'during' && !todayIsTeachingDay) {
      var inTerm = terms.some(function (t) {
        return todayN >= toDayNumber(t.start) && todayN <= toDayNumber(t.end);
      });
      if (!inTerm) offToday = 'holiday';
      else if (isWeekday(input.today)) offToday = 'closed';
      else offToday = 'weekend';
    }

    // Days done, and money, counting only days inside the school year.
    var done = 0;
    var earnedPence = 0;
    var countedEntries = 0;
    var outsideEntries = 0;
    (input.entries || []).forEach(function (e) {
      if (!isValidISODate(e.date)) return;
      var n = toDayNumber(e.date);
      if (n >= firstN && n <= lastN) {
        done += entryAmount(e);
        earnedPence += entryEarnedPence(e);
        countedEntries++;
      } else {
        outsideEntries++;
      }
    });

    var expected = (target * elapsed) / total;
    var difference = Math.round((done - expected) * 1000) / 1000;

    var verdict;
    if (target === 0 || done >= target) verdict = 'reached';
    else if (phase === 'after') verdict = 'short';
    else if (difference >= 1) verdict = 'ahead';
    else if (difference <= -1) verdict = 'behind';
    else verdict = 'on-track';

    var remaining = Math.max(0, target - done);

    return {
      valid: true,
      phase: phase,
      today: input.today,
      offToday: offToday,
      nextTeachingDay: nextTeachingDay,
      yearStart: terms[0].start,
      yearEnd: terms[terms.length - 1].end,
      totalTeachingDays: total,
      teachingDaysPerTerm: td.perTerm,
      elapsedTeachingDays: elapsed,
      remainingTeachingDays: remainingTeachingDays,
      teachingWeeksLeft: remainingTeachingDays / 5,
      targetDays: target,
      done: done,
      expected: expected,
      difference: difference,
      verdict: verdict,
      remaining: remaining,
      earnedPence: earnedPence,
      targetIncomePence: Math.round(target * (Number(input.usualRatePence) || 0)),
      countedEntries: countedEntries,
      outsideEntries: outsideEntries,
      // Where things sit along the year, from 0 (start) to 1 (end), in teaching days.
      todayFraction: elapsed / total,
      doneFraction: target > 0 ? Math.min(1, done / target) : 1
    };
  }

  // ---------------------------------------------------------------------------
  // Words for the screen
  // ---------------------------------------------------------------------------

  var HEADLINES = {
    ahead: 'Ahead',
    'on-track': 'On track',
    behind: 'Behind',
    reached: 'Target reached',
    short: 'Year over'
  };

  // The big verdict and the line under it.
  function describeVerdict(pace) {
    var headline = HEADLINES[pace.verdict];
    var detail;
    var gap = trunc1(pace.difference);
    if (pace.verdict === 'ahead') detail = formatDays(gap) + ' ahead';
    else if (pace.verdict === 'behind') detail = formatDays(gap) + ' behind';
    else if (pace.verdict === 'on-track') {
      if (gap > 0) detail = formatDays(gap) + ' ahead';
      else if (gap < 0) detail = formatDays(gap) + ' behind';
      else detail = 'Right on pace';
    } else if (pace.verdict === 'reached') {
      var extra = pace.done - pace.targetDays;
      if (pace.targetDays === 0) detail = 'Your target is 0 days, so there’s nothing to catch up';
      else if (extra > 0) detail = formatDays(extra) + ' more than you needed';
      else detail = 'Every day you needed, done';
    } else {
      detail = 'Short by ' + formatDays(pace.remaining);
    }
    return { headline: headline, detail: detail };
  }

  // A line about where today sits in the school year, or null.
  function describeToday(pace) {
    if (pace.phase === 'before') return 'The school year starts ' + formatDate(pace.yearStart) + '.';
    if (pace.phase === 'after') return 'The school year ended ' + formatDate(pace.yearEnd) + '.';
    if (pace.offToday === 'holiday') return 'School holiday. Back ' + formatDate(pace.nextTeachingDay) + '.';
    if (pace.offToday === 'closed') {
      return pace.nextTeachingDay
        ? 'Schools are closed today. Back ' + formatDate(pace.nextTeachingDay) + '.'
        : 'Schools are closed today.';
    }
    return null;
  }

  /*
    The "pace needed" line, e.g.
    "9 more days in the 21 teaching weeks left: about one every 2 weeks".
    Returns null when there's nothing to say (target reached or year over).
  */
  function describePaceNeeded(remaining, remainingTeachingDays) {
    if (!(remaining > 0)) return null;
    if (!(remainingTeachingDays > 0)) return null;

    var weeks = remainingTeachingDays / 5;
    var amount;
    if (remaining === 0.5) amount = 'Half a day more';
    else if (remaining === 1) amount = '1 more day';
    else amount = (Math.round(remaining * 10) / 10) + ' more days';
    var period;
    if (remainingTeachingDays < 5) {
      period = remainingTeachingDays === 1 ? 'the 1 teaching day left' : 'the ' + remainingTeachingDays + ' teaching days left';
    } else {
      var w = Math.round(weeks);
      period = 'the ' + w + ' teaching ' + (w === 1 ? 'week' : 'weeks') + ' left';
    }

    var rate;
    if (remaining > remainingTeachingDays) rate = 'more than there are teaching days';
    else if (remaining === remainingTeachingDays) rate = 'every teaching day';
    else {
      var perWeek = remaining / weeks;
      if (perWeek > 1) {
        var shown = Math.round(perWeek * 10) / 10;
        rate = 'about ' + shown + ' a week';
      } else {
        var every = Math.round(weeks / remaining);
        rate = every <= 1 ? 'about one a week' : 'about one every ' + every + ' weeks';
      }
    }
    // With under a day to go, or under a week left, a weekly rate reads oddly.
    var plainEnough = remaining < 1 || (remainingTeachingDays < 5 && remaining < remainingTeachingDays);
    if (plainEnough) return amount + ' in ' + period;
    return amount + ' in ' + period + ': ' + rate;
  }

  // ---------------------------------------------------------------------------
  // Saved data: checking it, filling gaps, and example days
  // ---------------------------------------------------------------------------

  var DATA_VERSION = 1;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function cleanNote(text) {
    if (typeof text !== 'string') return '';
    // Remove control characters, squash runs of spaces, cap the length.
    return text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxNoteLength);
  }

  function cleanTarget(value) {
    var n = Number(value);
    if (!isFinite(n)) return null;
    return clamp(Math.round(n * 2) / 2, 0, LIMITS.maxTargetDays);
  }

  // One logged day, checked. Returns a clean entry, or null if it can't be used.
  function cleanEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!isValidISODate(raw.date)) return null;
    var rate = Math.round(Number(raw.ratePence));
    if (!isFinite(rate) || rate < 0 || rate > LIMITS.maxRatePence) return null;
    var id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : makeId();
    var created = Number(raw.createdAt);
    return {
      id: id,
      date: raw.date,
      ratePence: rate,
      half: raw.half === true,
      note: cleanNote(raw.note),
      example: raw.example === true,
      createdAt: isFinite(created) && created > 0 ? created : 0
    };
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultData() {
    return {
      version: DATA_VERSION,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      entries: [],
      lastRatePence: null,
      exampleNoticeDismissed: false
    };
  }

  /*
    Checks anything that claims to be On Track data (from storage or an
    imported file). Returns { ok: true, data, skipped } with every value
    cleaned, or { ok: false, message } if it isn't usable at all.
    Term dates that are badly ordered are kept, so you can fix them in Settings.
  */
  function normaliseData(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, message: 'This isn’t an On Track file.' };
    }
    if (raw.version !== DATA_VERSION) {
      return { ok: false, message: 'This file is from a different version of On Track.' };
    }
    var s = raw.settings;
    if (!s || typeof s !== 'object') return { ok: false, message: 'This file has no settings in it.' };
    if (!Array.isArray(s.terms) || s.terms.length === 0 || s.terms.length > LIMITS.maxTerms) {
      return { ok: false, message: 'This file’s term dates can’t be read.' };
    }
    var terms = [];
    for (var i = 0; i < s.terms.length; i++) {
      var t = s.terms[i];
      if (!t || !isValidISODate(t.start) || !isValidISODate(t.end)) {
        return { ok: false, message: 'This file’s term dates can’t be read.' };
      }
      terms.push({ start: t.start, end: t.end });
    }
    var closedDays = Array.isArray(s.closedDays)
      ? s.closedDays.filter(isValidISODate).slice(0, LIMITS.maxClosedDays)
      : [];
    closedDays = closedDays.filter(function (d, idx) { return closedDays.indexOf(d) === idx; }).sort();

    var target = cleanTarget(s.targetDays);
    var usual = Math.round(Number(s.usualRatePence));
    if (!isFinite(usual) || usual < 0 || usual > LIMITS.maxRatePence) usual = DEFAULT_SETTINGS.usualRatePence;

    var entries = [];
    var skipped = 0;
    var seenIds = {};
    var rawEntries = Array.isArray(raw.entries) ? raw.entries.slice(0, LIMITS.maxEntries) : [];
    rawEntries.forEach(function (r) {
      var e = cleanEntry(r);
      if (!e) { skipped++; return; }
      while (seenIds[e.id]) e.id = makeId();
      seenIds[e.id] = true;
      entries.push(e);
    });

    var last = Math.round(Number(raw.lastRatePence));
    return {
      ok: true,
      skipped: skipped,
      data: {
        version: DATA_VERSION,
        settings: {
          targetDays: target === null ? DEFAULT_SETTINGS.targetDays : target,
          usualRatePence: usual,
          terms: terms,
          closedDays: closedDays
        },
        entries: entries,
        lastRatePence: raw.lastRatePence != null && isFinite(last) && last >= 0 && last <= LIMITS.maxRatePence ? last : null,
        exampleNoticeDismissed: raw.exampleNoticeDismissed === true
      }
    };
  }

  /*
    Example days for a first look, placed on teaching days already gone this
    year, so you end up about a day ahead of pace. Returns [] before the year
    has started (there's nowhere sensible to put them yet).
  */
  function makeExampleEntries(settings, today) {
    if (!validateTerms(settings.terms).ok) return [];
    var td = teachingDays(settings.terms, settings.closedDays);
    var todayN = toDayNumber(today);
    var past = td.days.filter(function (n) { return n <= todayN; });
    if (past.length === 0 || td.days.length === 0) return [];

    var target = Number(settings.targetDays) || 0;
    var expected = target * (past.length / td.days.length);
    var wanted = Math.round((expected + 1.2) * 2) / 2; // about a day ahead, in half days
    wanted = Math.max(1.5, Math.min(wanted, past.length));

    var fullDays = Math.floor(wanted);
    var hasHalf = wanted - fullDays > 0;
    var count = fullDays + (hasHalf ? 1 : 0);
    count = Math.min(count, past.length);

    var rates = [0, -1000, 1000, 0, 2500, -1000]; // small swings around the usual rate
    var notes = ['Example school', 'Example cover day', 'Example school', 'Example exam cover'];
    var base = settings.usualRatePence || DEFAULT_SETTINGS.usualRatePence;
    var entries = [];
    for (var i = 0; i < count; i++) {
      // Spread the days evenly over the teaching days gone, latest last.
      var index = Math.floor(((i + 0.5) / count) * past.length);
      var date = fromDayNumber(past[Math.min(index, past.length - 1)]);
      entries.push({
        id: 'example-' + (i + 1),
        date: date,
        ratePence: Math.max(0, base + rates[i % rates.length]),
        half: hasHalf && i === 1,
        note: notes[i % notes.length],
        example: true,
        createdAt: i + 1
      });
    }
    return entries;
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    LIMITS: LIMITS,
    DATA_VERSION: DATA_VERSION,
    parseISODate: parseISODate,
    isValidISODate: isValidISODate,
    toDayNumber: toDayNumber,
    fromDayNumber: fromDayNumber,
    addDays: addDays,
    weekdayOf: weekdayOf,
    isWeekday: isWeekday,
    todayISO: todayISO,
    formatDate: formatDate,
    monthShort: monthShort,
    formatPence: formatPence,
    parseMoneyToPence: parseMoneyToPence,
    penceToInput: penceToInput,
    formatDays: formatDays,
    trunc1: trunc1,
    termName: termName,
    validateTerms: validateTerms,
    teachingDays: teachingDays,
    entryAmount: entryAmount,
    entryEarnedPence: entryEarnedPence,
    isInYear: isInYear,
    sortEntries: sortEntries,
    computePace: computePace,
    describeVerdict: describeVerdict,
    describeToday: describeToday,
    describePaceNeeded: describePaceNeeded,
    cleanNote: cleanNote,
    cleanTarget: cleanTarget,
    cleanEntry: cleanEntry,
    makeId: makeId,
    defaultData: defaultData,
    normaliseData: normaliseData,
    makeExampleEntries: makeExampleEntries
  };

  // In Node (the tests) this file is a module; in the browser it sets window.OnTrackLogic.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OnTrackLogic = api;
})();
