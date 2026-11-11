/*
  On Track: the screen.

  This file reads and saves your data, draws the page and responds to taps.
  The sums live in logic.js (window.OnTrackLogic), so this file stays about
  what you see.

  A rule this file follows everywhere: text you type is only ever put on the
  page with textContent, never as HTML, so nothing you type can run as code.
*/
(function () {
  'use strict';

  var L = window.OnTrackLogic;
  var STORAGE_KEY = 'on-track:v1';
  var BACKUP_KEY = 'on-track:v1:unreadable-backup';
  var MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  // Make an element: el('p', { className: 'hint' }, 'Some text', otherElement)
  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === 'className') node.className = props[key];
        else if (key === 'text') node.textContent = props[key];
        else if (key === 'role' || key.indexOf('data-') === 0 || key.indexOf('aria-') === 0) node.setAttribute(key, props[key]);
        else node[key] = props[key];
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function showError(id, message, input) {
    var box = $(id);
    box.textContent = message || '';
    box.hidden = !message;
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function today() {
    return L.todayISO(new Date());
  }

  // ---------------------------------------------------------------------------
  // Saving and loading
  // ---------------------------------------------------------------------------

  var state = {
    data: null,
    storageWorks: true,
    unreadable: false, // saved data was there but couldn't be read
    saveFailed: false
  };

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      state.storageWorks = false;
    }

    if (raw === null) {
      // First visit (or storage switched off): start with example days.
      var data = L.defaultData();
      data.entries = L.makeExampleEntries(data.settings, today());
      state.data = data;
      save();
      return;
    }

    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    var result = parsed ? L.normaliseData(parsed) : { ok: false };
    if (result.ok) {
      state.data = result.data;
      return;
    }

    // Saved data is there but broken. Keep a copy, never wipe it silently.
    state.unreadable = true;
    try { window.localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* nothing more we can do */ }
    state.data = L.defaultData();
    state.data.exampleNoticeDismissed = true;
  }

  function save() {
    if (!state.storageWorks) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      if (state.saveFailed) { state.saveFailed = false; renderNotices(); }
    } catch (e) {
      if (!state.saveFailed) { state.saveFailed = true; renderNotices(); }
    }
  }

  function settings() { return state.data.settings; }

  function currentPace() {
    var s = settings();
    return L.computePace({
      terms: s.terms,
      closedDays: s.closedDays,
      targetDays: s.targetDays,
      usualRatePence: s.usualRatePence,
      entries: state.data.entries,
      today: today()
    });
  }

  // ---------------------------------------------------------------------------
  // Notices at the top of the main screen
  // ---------------------------------------------------------------------------

  function hasExamples() {
    return state.data.entries.some(function (e) { return e.example; });
  }

  function renderNotices() {
    var box = $('notices');
    clear(box);

    if (!state.storageWorks) {
      box.appendChild(el('div', { className: 'notice', role: 'status' },
        el('p', { className: 'notice-title', text: 'This browser isn’t saving' }),
        el('p', { text: 'Days you add will be gone when you close the page. Private browsing can cause this.' })
      ));
    } else if (state.saveFailed) {
      box.appendChild(el('div', { className: 'notice', role: 'alert' },
        el('p', { className: 'notice-title', text: 'Your last change didn’t save' }),
        el('p', { text: 'This device may be out of space. Save a backup from Settings to be safe.' })
      ));
    }

    if (state.unreadable) {
      var dismiss = el('button', { type: 'button', className: 'btn btn-secondary', text: 'OK' });
      dismiss.addEventListener('click', function () { state.unreadable = false; renderNotices(); });
      box.appendChild(el('div', { className: 'notice', role: 'alert' },
        el('p', { className: 'notice-title', text: 'Your saved days couldn’t be read' }),
        el('p', { text: 'On Track has started fresh and kept a copy of the old data on this device. If you have a backup file, restore it in Settings.' }),
        el('div', { className: 'button-row' }, dismiss)
      ));
    }

    if (hasExamples() && !state.data.exampleNoticeDismissed) {
      var fresh = el('button', { type: 'button', className: 'btn btn-secondary', text: 'Start fresh' });
      var keep = el('button', { type: 'button', className: 'btn btn-secondary', text: 'Keep for now' });
      fresh.addEventListener('click', function () {
        var before = state.data.entries;
        state.data.entries = state.data.entries.filter(function (e) { return !e.example; });
        state.data.exampleNoticeDismissed = true;
        save();
        render();
        $('verdict').focus();
        toast('Example days cleared', function () {
          state.data.entries = before;
          state.data.exampleNoticeDismissed = false;
          save();
          render();
        });
      });
      keep.addEventListener('click', function () {
        state.data.exampleNoticeDismissed = true;
        save();
        renderNotices();
        $('verdict').focus();
      });
      box.appendChild(el('div', { className: 'notice', role: 'region', 'aria-label': 'Example days' },
        el('p', { className: 'notice-title', text: 'These are example days' }),
        el('p', { text: 'They show how the track works. Clear them when you’re ready to log your own.' }),
        el('div', { className: 'button-row' }, fresh, keep)
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // The gauge: verdict, track and figures
  // ---------------------------------------------------------------------------

  function renderGauge() {
    var pace = currentPace();
    var gauge = document.querySelector('.gauge');
    var s = settings();

    if (!pace.valid) {
      gauge.setAttribute('data-verdict', 'invalid');
      $('today-line').textContent = L.formatDate(today());
      $('verdict').textContent = 'Check your term dates';
      $('verdict-detail').textContent = '';
      $('track-error-text').textContent = pace.message;
      $('track-error').hidden = false;
      $('track-figure').hidden = true;
      document.querySelector('.track-key').hidden = true;
      $('figures').hidden = true;
      $('pace-needed').hidden = true;
      return;
    }

    $('track-error').hidden = true;
    $('track-figure').hidden = false;
    document.querySelector('.track-key').hidden = false;
    $('figures').hidden = false;

    var words = L.describeVerdict(pace);
    gauge.setAttribute('data-verdict', pace.verdict);
    var todayNote = L.describeToday(pace);
    $('today-line').textContent = L.formatDate(today()) + (todayNote ? ' · ' + todayNote : '');
    $('verdict').textContent = words.headline;
    $('verdict-detail').textContent = words.detail;

    $('fig-done').textContent = formatNumber(pace.done);
    $('fig-target').textContent = 'of ' + formatNumber(pace.targetDays) + ' days';
    $('fig-expected').textContent = formatNumber(pace.expected);
    $('fig-earned').textContent = L.formatPence(pace.earnedPence);
    $('fig-target-income').textContent = 'of ' + L.formatPence(pace.targetIncomePence);

    var needed = L.describePaceNeeded(pace.remaining, pace.remainingTeachingDays);
    var paceLine = $('pace-needed');
    if (needed) paceLine.textContent = needed + '.';
    else if (pace.verdict === 'reached' && pace.phase !== 'after') paceLine.textContent = 'Anything more this year is extra.';
    else if (pace.phase === 'after') paceLine.textContent = 'Put in next year’s term dates in Settings to start again.';
    else paceLine.textContent = '';
    paceLine.hidden = !paceLine.textContent;

    drawTrack(pace, s);
  }

  // 5 -> "5", 5.5 -> "5.5", 5.69 -> "5.7"
  function formatNumber(n) {
    return String(Math.round(n * 10) / 10);
  }

  /*
    The track: each half-term is a bar, in proportion to its teaching days,
    with a gap for each holiday. The green fill is the days you've logged,
    measured against the whole year's target. The dark line is where you
    should be today. If you're behind, the stretch you're missing is hatched.
  */
  function drawTrack(pace, s) {
    var node = $('track');
    clear(node);
    var width = Math.max(240, Math.round(node.getBoundingClientRect().width) || 343);
    var height = 92;
    node.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    var gap = width < 420 ? 6 : 9;
    var perTerm = pace.teachingDaysPerTerm;
    var total = pace.totalTeachingDays;
    var barsWidth = width - gap * (perTerm.length - 1);
    var barTop = 26;
    var barHeight = 30;

    // Where each term's bar starts and ends.
    var bars = [];
    var x = 0;
    perTerm.forEach(function (count) {
      var w = (count / total) * barsWidth;
      bars.push({ x: x, w: w, count: count });
      x += w + gap;
    });

    // Turn "this many teaching days in" into a position across the drawing.
    function xFor(teachingDaysIn) {
      var left = teachingDaysIn;
      for (var i = 0; i < bars.length; i++) {
        if (left <= bars[i].count || i === bars.length - 1) {
          return bars[i].x + (bars[i].count ? Math.min(1, left / bars[i].count) : 0) * bars[i].w;
        }
        left -= bars[i].count;
      }
      return width;
    }

    var defs = svg('defs');
    var pattern = svg('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pattern.appendChild(svg('rect', { width: 6, height: 6, class: 't-hatch-bg' }));
    pattern.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 't-hatch-line' }));
    defs.appendChild(pattern);
    node.appendChild(defs);

    var doneX = xFor(pace.doneFraction * total);
    var todayX = xFor(pace.todayFraction * total);

    // In a holiday, today sits in the middle of the gap it's in.
    if (pace.offToday === 'holiday') {
      var termsBefore = s.terms.filter(function (t) { return t.end < pace.today; }).length;
      var bar = bars[termsBefore - 1];
      if (bar) todayX = bar.x + bar.w + gap / 2;
    }
    if (pace.phase === 'before') todayX = 0;

    var clipId = 'bars-clip';
    var clip = svg('clipPath', { id: clipId });
    defs.appendChild(clip);

    bars.forEach(function (b) {
      var shape = { x: b.x, y: barTop, width: Math.max(0, b.w), height: barHeight, rx: 4 };
      node.appendChild(svg('rect', Object.assign({ class: 't-term' }, shape)));
      clip.appendChild(svg('rect', shape));
    });

    var inside = svg('g', { 'clip-path': 'url(#' + clipId + ')' });
    // Behind: hatch the stretch between what you've done and where you should be.
    var showShort = todayX > doneX + 0.5 && pace.verdict !== 'reached';
    $('key-short').hidden = !showShort;
    if (showShort) {
      inside.appendChild(svg('rect', { class: 't-short', fill: 'url(#hatch)', x: doneX, y: barTop, width: todayX - doneX, height: barHeight }));
    }
    if (doneX > 0) {
      inside.appendChild(svg('rect', { class: 't-fill', x: 0, y: barTop, width: doneX, height: barHeight }));
    }
    node.appendChild(inside);

    // Where your logged days put you: a dot at the end of the fill.
    if (pace.done > 0) {
      node.appendChild(svg('circle', { class: 't-you', cx: clampX(doneX, 7, width), cy: barTop + barHeight / 2, r: 7 }));
    }

    // Today: a line through the track with a small pointer on top.
    var tx = clampX(todayX, 2, width);
    node.appendChild(svg('line', { class: 't-today-halo', x1: tx, y1: barTop - 6, x2: tx, y2: barTop + barHeight + 6 }));
    node.appendChild(svg('line', { class: 't-today', x1: tx, y1: barTop - 6, x2: tx, y2: barTop + barHeight + 6 }));
    node.appendChild(svg('path', { class: 't-today-head', d: 'M' + (tx - 6) + ' ' + (barTop - 13) + ' h12 l-6 7 z' }));

    var todayLabel = svg('text', { class: 't-label-strong', x: tx, y: 11 });
    todayLabel.textContent = 'Today';
    anchor(todayLabel, tx, width, 22);
    node.appendChild(todayLabel);

    // Month each term starts, under its bar.
    bars.forEach(function (b, i) {
      if (b.w < 24) return;
      var label = svg('text', { class: 't-label', x: b.x, y: barTop + barHeight + 22 });
      label.textContent = L.monthShort(s.terms[i].start);
      node.appendChild(label);
    });

    // The same picture in words, for screen readers.
    $('track-desc').textContent =
      'School year track. ' + pace.elapsedTeachingDays + ' of ' + total + ' teaching days have gone, so ' +
      formatNumber(pace.expected) + ' of your ' + formatNumber(pace.targetDays) + ' days are due by today. ' +
      'You’ve logged ' + formatNumber(pace.done) + '.';
  }

  function clampX(x, margin, width) {
    return Math.min(width - margin, Math.max(margin, x));
  }

  // Keep a label inside the drawing near the edges.
  function anchor(text, x, width, halfWidth) {
    if (x < halfWidth) { text.setAttribute('x', 0); text.setAttribute('text-anchor', 'start'); }
    else if (x > width - halfWidth) { text.setAttribute('x', width); text.setAttribute('text-anchor', 'end'); }
    else text.setAttribute('text-anchor', 'middle');
  }

  // ---------------------------------------------------------------------------
  // The list of days, grouped by half-term
  // ---------------------------------------------------------------------------

  function groupFor(date, terms, termsOk) {
    if (!termsOk) return { key: 'all', name: '' };
    if (!L.isInYear(date, terms)) return { key: 'outside', name: 'Outside this school year' };
    // A holiday belongs with the term before it.
    var index = 0;
    for (var i = 0; i < terms.length; i++) {
      if (terms[i].start <= date) index = i;
    }
    return { key: 'term-' + index, name: L.termName(index, terms.length) };
  }

  function renderDays() {
    var list = $('day-list');
    clear(list);
    var entries = L.sortEntries(state.data.entries);
    $('days-empty').hidden = entries.length > 0;
    if (!entries.length) return;

    var terms = settings().terms;
    var termsOk = L.validateTerms(terms).ok;
    var groups = [];
    var byKey = {};
    entries.forEach(function (e) {
      var g = groupFor(e.date, terms, termsOk);
      if (!byKey[g.key]) {
        byKey[g.key] = { name: g.name, outside: g.key === 'outside', entries: [], days: 0, pence: 0 };
        groups.push(byKey[g.key]);
      }
      byKey[g.key].entries.push(e);
      byKey[g.key].days += L.entryAmount(e);
      byKey[g.key].pence += L.entryEarnedPence(e);
    });

    groups.forEach(function (g) {
      var ul = el('ul', { className: 'group-list' });
      g.entries.forEach(function (e) { ul.appendChild(dayRow(e, g.outside)); });
      var section = el('section', { className: 'group', 'aria-label': g.name || 'Days' });
      if (g.name) {
        var sum = g.outside ? 'Not counted' : L.formatDays(g.days) + ' · ' + L.formatPence(g.pence);
        section.appendChild(el('div', { className: 'group-head' },
          el('h3', { className: 'group-name', text: g.name }),
          el('span', { className: 'group-sum', text: sum })
        ));
      }
      section.appendChild(ul);
      list.appendChild(section);
    });
  }

  function dayRow(entry, outside) {
    var withYear = outside;
    var meta = el('span', { className: 'day-meta' });
    if (entry.half) meta.appendChild(el('span', { className: 'pill', text: 'Half day' }));
    if (entry.example) meta.appendChild(el('span', { className: 'pill', text: 'Example' }));
    if (entry.note) meta.appendChild(el('span', { text: entry.note }));
    if (outside) meta.appendChild(el('span', { className: 'day-outside', text: 'Not counted this year' }));

    var label = L.formatDate(entry.date, { withYear: withYear }) + ', ' + L.formatPence(L.entryEarnedPence(entry)) +
      (entry.half ? ', half day' : '') + (entry.note ? ', ' + entry.note : '') + '. Edit';

    var button = el('button', { type: 'button', className: 'day-row', 'aria-label': label },
      el('span', { className: 'day-date', text: L.formatDate(entry.date, { withYear: withYear }) }),
      el('span', { className: 'day-amount', text: L.formatPence(L.entryEarnedPence(entry)) }),
      meta
    );
    button.addEventListener('click', function () { openDayDialog(entry.id); });
    return el('li', null, button);
  }

  // ---------------------------------------------------------------------------
  // Log or edit a day
  // ---------------------------------------------------------------------------

  var editingId = null;
  var lastFocus = null;

  function openDayDialog(id) {
    var dialog = $('day-dialog');
    var entry = id ? findEntry(id) : null;
    editingId = entry ? entry.id : null;
    lastFocus = document.activeElement;

    var t = today();
    $('day-dialog-title').textContent = entry ? 'Edit day' : 'Log a day';
    $('day-submit').textContent = entry ? 'Save changes' : 'Add day';
    $('day-delete').hidden = !entry;
    $('day-date').max = t;
    $('day-date').value = entry ? entry.date : t;
    var rate = entry ? entry.ratePence
      : (state.data.lastRatePence != null ? state.data.lastRatePence : settings().usualRatePence);
    $('day-rate').value = L.penceToInput(rate);
    $('day-half').checked = entry ? entry.half : false;
    $('day-note').value = entry ? entry.note : '';
    showError('day-date-error', '', $('day-date'));
    showError('day-rate-error', '', $('day-rate'));
    updateDayHints();

    dialog.showModal();
    // Adding with the defaults is then one more tap.
    $('day-submit').focus();
  }

  function closeDayDialog() {
    $('day-dialog').close();
  }

  function findEntry(id) {
    for (var i = 0; i < state.data.entries.length; i++) {
      if (state.data.entries[i].id === id) return state.data.entries[i];
    }
    return null;
  }

  // Small notes under the fields: a date already logged, what a half day earns.
  function updateDayHints() {
    var date = $('day-date').value;
    var dateNote = $('day-date-note');
    var clash = state.data.entries.some(function (e) { return e.date === date && e.id !== editingId; });
    var outside = L.isValidISODate(date) && L.validateTerms(settings().terms).ok && !L.isInYear(date, settings().terms);
    var message = '';
    if (clash) message = 'You’ve already logged a day on this date.';
    if (outside && date <= today()) message = (message ? message + ' ' : '') + 'This is outside this school year, so it won’t count.';
    dateNote.textContent = message;
    dateNote.hidden = !message;

    var pence = L.parseMoneyToPence($('day-rate').value);
    var rateNote = $('day-rate-note');
    if ($('day-half').checked && pence !== null) {
      rateNote.textContent = 'Half day: ' + L.formatPence(Math.round(pence / 2)) + ' earned.';
      rateNote.hidden = false;
    } else {
      rateNote.hidden = true;
    }
  }

  function checkDayForm() {
    var ok = true;
    var date = $('day-date').value;
    var dateError = '';
    if (!L.isValidISODate(date)) dateError = 'Pick a date.';
    else if (date > today()) dateError = 'That date hasn’t happened yet.';
    showError('day-date-error', dateError, $('day-date'));
    if (dateError) ok = false;

    var pence = L.parseMoneyToPence($('day-rate').value);
    var rateError = '';
    if ($('day-rate').value.trim() === '') rateError = 'Put in the day rate. Use 0 if it was unpaid.';
    else if (pence === null) rateError = 'Use a number between 0 and 5,000, like 200 or 185.50.';
    showError('day-rate-error', rateError, $('day-rate'));
    if (rateError) ok = false;

    if (!ok) {
      var first = dateError ? $('day-date') : $('day-rate');
      first.focus();
      return null;
    }
    return {
      date: date,
      ratePence: pence,
      half: $('day-half').checked,
      note: L.cleanNote($('day-note').value)
    };
  }

  function submitDay(event) {
    event.preventDefault();
    var values = checkDayForm();
    if (!values) return;

    if (editingId) {
      var entry = findEntry(editingId);
      if (entry) {
        var before = Object.assign({}, entry);
        Object.assign(entry, values, { example: false });
        state.data.lastRatePence = values.ratePence;
        save();
        closeDayDialog();
        render();
        toast('Changes saved', function () {
          var again = findEntry(before.id);
          if (again) Object.assign(again, before);
          save();
          render();
        });
      }
      return;
    }

    var added = L.cleanEntry(Object.assign({ id: L.makeId(), createdAt: Date.now() }, values));
    if (!added) return;
    state.data.entries.push(added);
    state.data.lastRatePence = values.ratePence;
    save();
    closeDayDialog();
    render();
    toast('Added ' + L.formatDate(added.date), function () { removeEntry(added.id); });
  }

  function removeEntry(id) {
    state.data.entries = state.data.entries.filter(function (e) { return e.id !== id; });
    save();
    render();
  }

  function deleteDay() {
    var entry = findEntry(editingId);
    if (!entry) return;
    var copy = Object.assign({}, entry);
    closeDayDialog();
    removeEntry(entry.id);
    $('verdict').focus();
    toast('Deleted ' + L.formatDate(copy.date), function () {
      state.data.entries.push(copy);
      save();
      render();
    });
  }

  // ---------------------------------------------------------------------------
  // Toast: a short message, with Undo
  // ---------------------------------------------------------------------------

  var toastTimer = null;
  var toastUndo = null;

  function toast(message, undo) {
    var box = $('toast');
    $('toast-text').textContent = message;
    toastUndo = undo || null;
    $('toast-undo').hidden = !undo;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 8000 : 4000);
  }

  function hideToast() {
    $('toast').hidden = true;
    toastUndo = null;
  }

  // ---------------------------------------------------------------------------
  // Are you sure?
  // ---------------------------------------------------------------------------

  var confirmAction = null;

  function confirmThen(title, text, yesLabel, action) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm-yes').textContent = yesLabel;
    confirmAction = action;
    lastFocus = document.activeElement;
    $('confirm-dialog').showModal();
    $('confirm-no').focus();
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  function showSettings(open) {
    $('home-view').hidden = open;
    $('settings-view').hidden = !open;
    $('settings-toggle').setAttribute('aria-expanded', String(open));
    $('settings-toggle').hidden = open;
    if (open) {
      fillSettings();
      window.scrollTo(0, 0);
      $('settings-heading').focus();
    } else {
      render();
      window.scrollTo(0, 0);
      $('verdict').focus();
    }
  }

  function fillSettings() {
    var s = settings();
    $('target-days').value = formatNumber(s.targetDays);
    $('usual-rate').value = L.penceToInput(s.usualRatePence);
    showError('target-days-error', '', $('target-days'));
    showError('usual-rate-error', '', $('usual-rate'));
    showError('import-error', '');
    renderTermRows();
    renderClosedDays();
  }

  function renderTermRows() {
    var box = $('term-rows');
    clear(box);
    var s = settings();
    var check = L.validateTerms(s.terms);
    var counts = check.ok ? L.teachingDays(s.terms, s.closedDays).perTerm : null;

    s.terms.forEach(function (t, i) {
      var name = L.termName(i, s.terms.length);
      var startId = 'term-' + i + '-start';
      var endId = 'term-' + i + '-end';
      var start = el('input', { type: 'date', id: startId, className: 'input', value: t.start });
      var end = el('input', { type: 'date', id: endId, className: 'input', value: t.end });
      start.addEventListener('change', function () { updateTerm(i, 'start', start.value); });
      end.addEventListener('change', function () { updateTerm(i, 'end', end.value); });
      var wrong = !check.ok && check.termIndex === i;
      if (wrong) { start.setAttribute('aria-invalid', 'true'); end.setAttribute('aria-invalid', 'true'); }

      var head = el('div', { className: 'term-name' },
        el('span', { text: name }),
        counts ? el('span', { className: 'term-count', text: counts[i] + ' teaching days' }) : null
      );
      box.appendChild(el('div', { className: 'term-row' + (wrong ? ' is-wrong' : ''), role: 'group', 'aria-label': name },
        head,
        el('div', null, el('label', { htmlFor: startId, text: 'Starts' }), start),
        el('div', null, el('label', { htmlFor: endId, text: 'Ends' }), end)
      ));
    });

    var total = counts ? counts.reduce(function (a, b) { return a + b; }, 0) : 0;
    var untouched = JSON.stringify(s.terms) === JSON.stringify(L.DEFAULT_SETTINGS.terms);
    $('terms-hint').textContent =
      (untouched ? 'Typical England dates for 2026–27: check your council’s.' : 'Your own dates.') +
      (counts ? ' ' + total + ' teaching days in all.' : '');
    showError('terms-error', check.ok ? '' : check.message);
  }

  function updateTerm(index, which, value) {
    if (!L.isValidISODate(value)) {
      showError('terms-error', L.termName(index, settings().terms.length) + ' needs a full date.');
      return;
    }
    settings().terms[index][which] = value;
    save();
    renderTermRows();
    if (!$('terms-error').hidden) return; // the message is already on screen
    status('Term dates saved');
  }

  function renderClosedDays() {
    var list = $('closed-list');
    clear(list);
    settings().closedDays.forEach(function (d) {
      var remove = el('button', { type: 'button', className: 'btn btn-ghost', text: 'Remove', 'aria-label': 'Remove ' + L.formatDate(d, { withYear: true }) });
      remove.addEventListener('click', function () {
        settings().closedDays = settings().closedDays.filter(function (x) { return x !== d; });
        save();
        renderClosedDays();
        renderTermRows();
        $('closed-new').focus();
        status('Removed ' + L.formatDate(d));
      });
      list.appendChild(el('li', null, el('span', { text: L.formatDate(d, { withYear: true }) }), remove));
    });
  }

  function addClosedDay() {
    var input = $('closed-new');
    var d = input.value;
    if (!L.isValidISODate(d)) { showError('closed-error', 'Pick a date first.', input); input.focus(); return; }
    if (settings().closedDays.indexOf(d) !== -1) { showError('closed-error', 'That day is already on the list.', input); return; }
    if (settings().closedDays.length >= L.LIMITS.maxClosedDays) { showError('closed-error', 'That’s the most closed days On Track can hold.', input); return; }
    showError('closed-error', '', input);
    settings().closedDays.push(d);
    settings().closedDays.sort();
    input.value = '';
    save();
    renderClosedDays();
    renderTermRows();
    status('Added ' + L.formatDate(d));
  }

  function saveTarget() {
    var input = $('target-days');
    var n = Number(input.value.trim());
    if (input.value.trim() === '' || !isFinite(n) || n < 0 || n > L.LIMITS.maxTargetDays) {
      showError('target-days-error', 'Use a number from 0 to ' + L.LIMITS.maxTargetDays + '.', input);
      return;
    }
    showError('target-days-error', '', input);
    settings().targetDays = L.cleanTarget(n);
    input.value = formatNumber(settings().targetDays);
    save();
    status('Target saved');
  }

  function saveUsualRate() {
    var input = $('usual-rate');
    var pence = L.parseMoneyToPence(input.value);
    if (pence === null) {
      showError('usual-rate-error', 'Use a number between 0 and 5,000, like 200.', input);
      return;
    }
    showError('usual-rate-error', '', input);
    settings().usualRatePence = pence;
    input.value = L.penceToInput(pence);
    save();
    status('Day rate saved');
  }

  // A short "saved" message for settings (uses the same toast, no Undo).
  function status(message) { toast(message); }

  // ---------------------------------------------------------------------------
  // Backup: download and restore
  // ---------------------------------------------------------------------------

  function exportData() {
    var text = JSON.stringify(state.data, null, 2);
    var name = 'on-track-backup-' + today() + '.json';

    // On a phone, hand the file to the share sheet (Save to Files, email it...).
    // That is more dependable than a download, above all for a home screen app.
    try {
      var onPhone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (onPhone && window.File && navigator.canShare && navigator.share) {
        var file = new File([text], name, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'On Track backup' }).then(function () {
            status('Backup saved');
          }).catch(function (error) {
            if (error && error.name === 'AbortError') return; // you closed the share sheet
            downloadBackup(text, name);
          });
          return;
        }
      }
    } catch (e) { /* fall through to a plain download */ }
    downloadBackup(text, name);
  }

  function downloadBackup(text, name) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = el('a', { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    status('Backup downloaded');
  }

  function importFile(file) {
    showError('import-error', '');
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showError('import-error', 'That file is too big to be an On Track backup.');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { showError('import-error', 'That file couldn’t be opened.'); };
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) {
        showError('import-error', 'That file isn’t an On Track backup.');
        return;
      }
      var result = L.normaliseData(parsed);
      if (!result.ok) { showError('import-error', result.message); return; }

      var count = result.data.entries.length;
      var skipped = result.skipped;
      confirmThen(
        'Restore this backup?',
        'It has ' + count + ' logged ' + (count === 1 ? 'day' : 'days') +
          (skipped ? ' (and ' + skipped + ' that couldn’t be read, which will be left out)' : '') +
          '. It replaces everything on this device now.',
        'Restore backup',
        function () {
          state.data = result.data;
          state.data.exampleNoticeDismissed = true;
          save();
          fillSettings();
          renderNotices();
          status('Backup restored: ' + count + ' ' + (count === 1 ? 'day' : 'days'));
        }
      );
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Drawing everything, and wiring up the buttons
  // ---------------------------------------------------------------------------

  function render() {
    renderNotices();
    renderGauge();
    renderDays();
  }

  function wire() {
    $('log-day').addEventListener('click', function () { openDayDialog(null); });
    $('day-form').addEventListener('submit', submitDay);
    $('day-cancel').addEventListener('click', closeDayDialog);
    $('day-delete').addEventListener('click', deleteDay);
    ['day-date', 'day-rate', 'day-half'].forEach(function (id) {
      $(id).addEventListener('input', updateDayHints);
      $(id).addEventListener('change', updateDayHints);
    });
    $('day-dialog').addEventListener('close', function () {
      editingId = null;
      if ($('home-view').hidden) return;
      // After an edit the list is redrawn, so the row you tapped is gone.
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
      else $('verdict').focus();
    });
    // Tapping the dark area outside a sheet closes it.
    ['day-dialog', 'confirm-dialog'].forEach(function (id) {
      $(id).addEventListener('click', function (event) {
        if (event.target === $(id)) $(id).close();
      });
    });

    $('confirm-no').addEventListener('click', function () { $('confirm-dialog').close(); });
    $('confirm-yes').addEventListener('click', function () {
      var action = confirmAction;
      confirmAction = null;
      $('confirm-dialog').close();
      if (action) action();
    });
    $('confirm-dialog').addEventListener('close', function () {
      confirmAction = null;
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    });

    $('toast-undo').addEventListener('click', function () {
      var undo = toastUndo;
      hideToast();
      if (undo) undo();
      toast('Undone');
    });

    $('settings-toggle').addEventListener('click', function () { showSettings(true); });
    $('settings-done').addEventListener('click', function () { showSettings(false); });
    $('fix-terms').addEventListener('click', function () {
      showSettings(true);
      $('terms-heading').scrollIntoView();
    });
    $('settings-form').addEventListener('submit', function (event) { event.preventDefault(); });
    $('target-days').addEventListener('change', saveTarget);
    $('usual-rate').addEventListener('change', saveUsualRate);
    $('reset-terms').addEventListener('click', function () {
      confirmThen(
        'Use the typical 2026–27 dates?',
        'This replaces your term dates and closed days with the typical England dates for 2026–27.',
        'Use typical dates',
        function () {
          settings().terms = JSON.parse(JSON.stringify(L.DEFAULT_SETTINGS.terms));
          settings().closedDays = L.DEFAULT_SETTINGS.closedDays.slice();
          save();
          renderTermRows();
          renderClosedDays();
          status('Term dates reset');
        }
      );
    });
    $('closed-add').addEventListener('click', addClosedDay);
    $('export').addEventListener('click', exportData);
    $('import-file').addEventListener('change', function () {
      var file = this.files && this.files[0];
      importFile(file);
      this.value = '';
    });
    $('start-fresh').addEventListener('click', function () {
      var count = state.data.entries.length;
      confirmThen(
        'Start fresh?',
        count
          ? 'This deletes all ' + count + ' logged ' + (count === 1 ? 'day' : 'days') + '. Save a backup first if you might want them.'
          : 'There are no logged days to delete.',
        'Delete all days',
        function () {
          state.data.entries = [];
          state.data.exampleNoticeDismissed = true;
          save();
          showSettings(false);
          toast('All days deleted');
        }
      );
    });

    // Redraw the track when the screen size changes, and when you come back
    // to the app (the date may have moved on overnight).
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (!$('home-view').hidden) renderGauge(); }, 100);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !$('home-view').hidden) render();
    });
  }

  load();
  wire();
  render();
})();
