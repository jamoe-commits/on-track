# On Track

On Track is a small app for supply and contract teachers who need to work a number of extra days each school year to break even. You log each extra day you work and its day rate, and a track of the school year shows whether you’re ahead, on track or behind for this point in the year.

Pace is counted in teaching days, so holidays and half-terms never put you behind.

## Using it

1. Open the app on your phone. In Safari, tap Share, then **Add to Home Screen**, so it opens like any other app.
2. Go to **Settings** and put in your own target (extra days a year), your usual day rate and your term dates.
3. The first time you open it you’ll see a few example days. Tap **Start fresh** to clear them.
4. Each time you work an extra day, tap **Log a day**, then **Add day**. The date is today and the rate is the last one you used, so that’s usually all it takes. Switch on **Half day** if it was a half day; it counts as half a day and earns half the rate.
5. Tap any day in the list to change or delete it.

**Example numbers:** the target of 24 days, the £200 day rate and the example days are only there to show how it works. Change them to your own.

## Where your data lives

Everything stays in your browser on your device (in `localStorage`). Nothing is sent anywhere, and there are no accounts.

That also means clearing your browser data, or losing your phone, loses your days. To keep a copy:

- **Settings → Save backup** makes a `.json` file. On a phone it opens the share sheet, so you can save it to Files or email it to yourself; on a computer it downloads.
- **Settings → Restore backup** loads that file back, on the same phone or a new one.

## Changing the term dates

The app comes with typical England dates for 2026–27. Your council’s dates may differ, so check them.

- In the app: **Settings → Term dates**. Change any start or end date and it saves straight away. Add bank holidays and training days under **Extra closed days**.
- For everyone who uses your copy: change `DEFAULT_SETTINGS` near the top of `logic.js`.

## Running it on your computer

It’s plain HTML, CSS and JavaScript, with nothing to install.

```sh
cd on-track
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (Opening `index.html` straight from your files often works too, but some browsers block saving that way.)

### Running the tests

The sums have tests. You need [Node.js](https://nodejs.org) 18 or later:

```sh
node --test
```

## How it’s built

| File | What it does |
| --- | --- |
| `index.html` | The page: what’s on screen and in which order |
| `styles.css` | How it looks, with the colours for light and dark mode at the top |
| `logic.js` | The sums: teaching days, pace, verdict, money. No screen code |
| `app.js` | The screen: saving, drawing the track, the forms and buttons |
| `tests/logic.test.mjs` | Checks that the sums are right |
| `manifest.webmanifest`, `icons/` | The home screen icon and name |

## Change it with AI

You don’t need to be a programmer to change On Track. An AI assistant (such as Claude or ChatGPT) can do it for you.

1. Open the AI assistant and paste in this README, then `logic.js`, `app.js`, `index.html` and `styles.css`. (Most assistants let you attach the files instead.)
2. Say what you want in plain words, and ask for the complete changed files back.
3. Replace your files with the new ones and open the app to try it.
4. If you changed the sums, ask the AI to update `tests/logic.test.mjs` too, then run `node --test`.
5. Save a backup in Settings before trying a big change.

Example requests:

- “Add a line under the track showing how many days I’ve done this half-term.”
- “Let me log a day I’ve booked but not worked yet, and only count it once the day has passed. Update the tests too.”
- “Change the green on the track to a dark blue, in both light and dark mode, keeping the text readable.”

## Licence

MIT. See `LICENSE`.
