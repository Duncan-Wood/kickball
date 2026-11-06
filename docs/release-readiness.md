# Release readiness

Status as of 2026-11-06. Built from a read of the code, not from a run of every flow.

## What the app is

A lineup page for a recreational kickball team. The captain's Google Sheet is the database. Players open one link and see who plays where in each inning. Captains and co-captains edit the lineup from the same page.

About 5,200 lines of code across `site/` and `worker/`, with 96 Worker-side tests.

## Features

**Players (no account, no install)**
- Field with the 11 positions for any game and inning, the kicking order and the players sitting
- Whole-game table and season totals (innings played, sat, infield, outfield)
- Date, time, location, opponent and result
- Red flags for a position given to two players, or an absent player who still has a position
- Anonymous suggestion box, limited to 60 per hour
- Refreshes every 10 seconds, shows when the lineup was last updated, keeps the last good lineup on the device
- Per-team name, icon, colors and font

**Captains**
- Move players by tap or drag, across several innings at once
- Kicking order, RSVP (Yes, Maybe, No), add and remove players
- Games: edit details, enter results, add playoff or makeup games, create lineup tabs for the whole season
- Team: settings and roster management, including positions a player prefers or won't play
- Undo (30 steps), and a refusal to save when the sheet changed underneath
- Edits use the captain's own Google account, so the sheet's version history shows who changed what

**Setup**
- Create a team sheet from a template, or connect an existing sheet that follows the layout
- One permission: `drive.file`, which sees only the sheet the app created or the one the captain picked

## Strengths

| Strength | Evidence |
| --- | --- |
| Players need no account or install | Rec-league advice treats this as the main barrier. [BenchApp](https://landing.benchapp.com/blog/rec-league-team-nobody-rsvps) (a vendor) says players should be able to reply without installing an app |
| Free and no ads | General team apps put features behind paid tiers. [Capterra's TeamSnap pricing page](https://www.capterra.com/p/123208/TeamSnap/pricing/) lists paid plans, and sources disagree on what the free plan includes |
| Position-by-inning planning | The big team apps cover scheduling, chat and scoring, not fielding. [GameChanger](https://gc.com/post/coach-smarter-a-data-informed-way-to-set-your-lineup) is built around scoring and batting-order suggestions |
| The captain owns the data | The sheet stays in the captain's Drive and can be edited by hand at any time |
| Least-privilege access | Only `drive.file`. Google's [verification rules](https://support.google.com/cloud/answer/7454865) apply the 100-user unverified cap to sensitive and restricted scopes |
| Safe editing | Undo, stale-sheet protection and conflict flags |

## Weaknesses

Blockers are in the MVP below. The rest are post-MVP.

1. **Google Sheets quota.** An uncached read costs 2 Sheets calls, up to about 24 a minute per team being watched. Google allows [300 read requests a minute per project and 60 per user](https://developers.google.com/workspace/sheets/api/limits), so around 12 teams viewed at once can start returning 429 errors.
2. **No contact, license or terms.** The privacy page names the author but gives no way to reach them.
3. **Thin automated coverage.** The Worker's routing, CORS, comment limit and token encryption have no tests, and neither does any browser code.
4. **Accessibility.** The field chips are not keyboard reachable, focus styles exist only in captain tools, status messages are not announced, and there is no dark mode.
5. **Not installable.** There is a service worker but no manifest, home-screen icon or share preview.
6. **Fixed shape.** 11 positions, 5 innings and 8 schedule rows. Leagues with other rules need the sheet edited by hand.
7. **Link is the secret.** Anyone with the team link sees the lineups, including game notes. The only revocation is Stop sharing.
8. **Captain enters RSVPs.** Players cannot answer for themselves.
9. **Rate limiting** covers comments only, and per data center.
10. **Single Worker URL.** Forks must change `site/settings.js` and the Google client.

## How comparable apps are received

Ratings come from different sites, so compare them loosely.

| App | What it is | Reception | Lineup support |
| --- | --- | --- | --- |
| [Spond](https://marlvel.ai/apps/com-spond) | Free team communication | About 4.8 from about 14.6K reviews on one aggregator, with recurring calendar-sync complaints | None |
| [TeamSnap](https://www.capterra.ie/compare/123208/181253/teamsnap/vs/spond) | Scheduling, RSVP, messaging | 4.2 from 157 Capterra reviews | None |
| [GameChanger](https://www.apppricinglab.com/compare/apple/1308415878/6670517733) | Scoring and stats | 4.9 on the App Store, from about 771K reviews | Batting-order suggestions |
| [Baseball Fielding Rotation App](https://apps.apple.com/us/app/id1355733523) | Fair fielding rotations | Few ratings | Yes, youth-focused |
| [Baseball Lineup Pro](https://apps.apple.com/app/id6760890785) | Inning-by-inning matrix | Too few ratings to show | Yes, $1.99 a month or $5.99 once |
| [Kickball Coach](https://marlvel.ai/api/llm/apps/sports/com-beckersoft-kickball-coach) | iOS lineup builder | 4.3 from 4 ratings, stability complaints | Yes, paid |

What this supports, and no more:
- Popular team apps are built around scheduling and communication, and the ones with lineups are small, mostly paid and thinly reviewed.
- A free, no-account, fielding-focused tool for rec kickball fills a gap those sources leave open.
- It does not show that captains prefer this approach. That needs feedback from real teams.

## MVP

The smallest release that is safe to share beyond Duncan's own teams.

- [ ] Sheets reads hardened: longer edge cache, one combined read, serve the last good copy on a 429
- [ ] Contact link, `LICENSE` and a short terms page
- [ ] Google branding verification retried and the result recorded (due on or after 2026-10-22)
- [ ] Worker tests for routing, CORS, the comment limit and token encryption
- [ ] Keyboard access and focus styles on the field, announced status messages
- [ ] Manifest, home-screen icon, share preview and a 404 page
- [ ] A new-sheet run from the template, with the stray test sheets deleted from Drive
- [ ] A real game weekend run with a captain who did not build the app

## After the MVP

In rough order: configurable positions and innings, a player RSVP link, dark mode, notifications, global rate limiting, more languages.
