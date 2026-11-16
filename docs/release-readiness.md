# Release readiness

Status as of 2026-11-15, after one full season with one team (8 games).

## What the app is

A lineup page for a recreational kickball team. Players open one link and see who plays where in each inning. Captains and co-captains edit the lineup from the same page. The data lives in a Google Sheet in the captain's Drive.

About 4,900 lines in `site/` and `worker/src/`, with 134 Worker tests.

## Left before a wider release

- An install on a real Android phone
- A game weekend run by a captain who did not build the app

## Strengths

| Strength | Evidence |
| --- | --- |
| Players need no account or install | Rec-league advice treats this as the main barrier. [BenchApp](https://landing.benchapp.com/blog/rec-league-team-nobody-rsvps) (a vendor) says players should be able to reply without installing an app |
| Free and no ads | General team apps put features behind paid tiers. [Capterra's TeamSnap pricing page](https://www.capterra.com/p/123208/TeamSnap/pricing/) lists paid plans |
| Position-by-inning planning | The big team apps cover scheduling, chat and scoring, not fielding. [GameChanger](https://gc.com/post/coach-smarter-a-data-informed-way-to-set-your-lineup) is built around scoring and batting-order suggestions |
| The captain owns the data | The sheet stays in the captain's Drive and can be edited by hand |
| Least-privilege access | Only `drive.file`, which sees the one sheet the app created |
| Safe editing | Undo, and a refusal to save when the sheet changed underneath |

## Weaknesses

1. **No tests for the page.** Only the Worker is tested. The suggestion box saved nothing from the Worker move until [PR #42](https://github.com/Duncan-Wood/kickball/pull/42), because no test sent the request the page sends.
2. **Sign-in on every visit.** Captain tools asks Google again after a reload or an hour.
3. **Google Sheets quota.** Google allows [300 read requests a minute per project](https://developers.google.com/workspace/sheets/api/limits). With the 15-second cache and shared reads, that should cover around 37 teams watched at once. Past that, players see the last good lineup.
4. **Fixed shape.** 11 positions, and the template has 5 innings.
5. **Link is the secret.** Anyone with the team link sees the lineups. Stop sharing is the only way to revoke it.
6. **Captain enters RSVPs.** Players cannot answer for themselves.
7. **Accessibility.** No dark mode and no screen reader pass, and the kicking-order numbers fall below the contrast target in some team colors.
8. **Rate limiting** covers suggestions only, and per data center.
9. **Single Worker URL.** A fork must change `site/settings.js` and the Google client.

## How comparable apps are received

Ratings come from different sites, so compare them loosely.

| App | What it is | Reception | Lineup support |
| --- | --- | --- | --- |
| [Spond](https://marlvel.ai/apps/com-spond) | Free team communication | About 4.8 from about 14.6K reviews on one aggregator | None |
| [TeamSnap](https://www.capterra.ie/compare/123208/181253/teamsnap/vs/spond) | Scheduling, RSVP, messaging | 4.2 from 157 Capterra reviews | None |
| [GameChanger](https://www.apppricinglab.com/compare/apple/1308415878/6670517733) | Scoring and stats | 4.9 on the App Store, from about 771K reviews | Batting-order suggestions |
| [Baseball Fielding Rotation App](https://apps.apple.com/us/app/id1355733523) | Fair fielding rotations | Few ratings | Yes, youth-focused |
| [Baseball Lineup Pro](https://apps.apple.com/app/id6760890785) | Inning-by-inning matrix | Too few ratings to show | Yes, $1.99 a month or $5.99 once |
| [Kickball Coach](https://marlvel.ai/api/llm/apps/sports/com-beckersoft-kickball-coach) | iOS lineup builder | 4.3 from 4 ratings, stability complaints | Yes, paid |

The popular team apps are built around scheduling and communication, and the ones with lineups are small, mostly paid and thinly reviewed. That leaves a gap for a free, no-account fielding tool. It does not show that captains prefer this approach. That needs feedback from other teams.

## Later

In rough order: configurable positions and innings, a player RSVP link, dark mode, notifications, global rate limiting, more languages.
