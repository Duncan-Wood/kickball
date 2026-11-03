# Kickball Field View

A lineup page for a kickball team. The captain keeps the lineup in a Google Sheet, and players open one link on their phone to see who plays where in each inning, the kicking order, a whole-game table and season totals. Captains and co-captains can also edit the lineup from the same page. There is nothing to install.

Screenshots use made-up players.

| Field | Whole game | Season |
| --- | --- | --- |
| ![Field view](docs/screenshots/demo-field.png) | ![Whole-game table](docs/screenshots/demo-all.png) | ![Season totals](docs/screenshots/demo-season.png) |

## Features

- Pick a game and an inning to see who plays each of the 11 positions
- A position given to two players is flagged in red, and so is an absent player who still has a position. An open position is flagged only while someone is sitting, so a team with 8 to 10 players sees plain "open" chips instead of errors
- Game date, time, location, opponent and final score
- Kicking order and the players sitting each inning
- Whole-game table with innings played per player
- Season totals: innings played, sat, infield and outfield, across games already played
- Refreshes every 10 seconds while the page is in view, so edits in the sheet show up on their own, and shows when the lineup was last updated
- Shows load and update errors in a red box at the top, retries a failed first load on its own, and keeps the last good lineup on the device
- Captain tools: move players, reorder the kicking order, record RSVPs, add and remove players, edit the roster, enter results, set up the whole season and change the team's look, all from the team page

## Set up a team

1. Open the setup page (`start.html` on the site) and choose **Sign in with Google**.
2. Enter your team name and season, then choose **Create my team sheet**. To keep a sheet you already have, choose **Use a sheet I already have** and pick it. The app adds a `Team Config` tab to it. Read [the guide](site/existing-sheet.html) first, because the sheet has to follow the layout below.
3. Send the team link to your players.

Nothing is installed in the sheet and there is no script to paste or deploy. The app asks Google for one permission, `drive.file`. It lets the app see only the sheet it created or the one you picked, never the rest of your Drive.

The `Team Config` tab has eight settings, which a captain can also change from **Team** in Captain tools: team name, season label, icon, main color, second color, stripe (Blend or Rainbow), font and the suggestion box. The color cells take their fill color: click the box, then the paint bucket in the toolbar. White is a valid value. Everything else (page background, text, borders, highlights) is worked out from the two colors. The `Roster` and `Schedule` tabs feed the game tabs and are never sent to players.

## The team sheet

- `Schedule` holds each game's date, time, location, opponent and result once. A game tab looks its details up by the number in its `Game #:` cell.
- `Start here` is the first tab: setup steps and what the colors mean. It is never sent to players.
- To add games, use **Games** in Captain tools, or duplicate the `New game (copy me)` tab, rename the copy so it ends with `Lineup`, and type its number in the `Game #:` cell. The blank tab is ignored until it is renamed.
- The lookup cells in a game tab show a red corner flag if someone types over their formula. The warning is a validation rule, so it carries over when a tab is duplicated.
- `Roster` can be edited from **Team** in Captain tools, and holds each player's name, the positions they prefer and the positions they won't play, private notes and an optional pronouns column. Subs go on the roster like anyone else and are added to a game's grid when they play.
- In a game tab, the `RSVP` column takes Yes, Maybe or No as replies come in. A blank cell next to a name is gray, meaning no reply yet. Blank and Maybe players are still planned for, and a No turns the row gray.
- The `Prefers` and `Won't play` columns after the innings fill in from the roster. A preferred position turns green in the grid and a won't-play position turns red. These columns are never sent to players.
- The `Open spots` row under the grid lists the positions nobody is covering in each inning, and a position given to two players turns orange.

## Captain tools

Under the team page, **Captain tools** lets anyone who can edit the sheet change the lineup from their phone, so a game can be planned or adjusted without opening the Sheets app.

- **Who sees the link:** The Captain tools link is hidden from players. A captain or co-captain opens the team link once with `#captain` on the end, like `https://.../?team=abc123#captain`. After a successful sign-in the device remembers, and the link shows on its own.
- **Signing in:** Sign in with Google and the page checks that your account can edit the team sheet. A co-captain who was shared the sheet picks it once in Google's file picker. Each visit starts with a Google sign-in, and the page keeps no sign-in afterward.
- **Field:** tap a position and a panel slides up under the field listing who can play there, with the players sitting first and each player's current position beside their name. Tap someone to put them there, which swaps them with whoever held the spot. When the spot was open, the panel moves on to the next open position, so a lineup can be filled in by tapping down the list. Tap a sitting player to place them by tapping a position on the field. On a computer you can also drag a player onto a position.
- **Edit innings:** changes apply to the inning on screen. To change several at once, tap more innings in the **Edit innings** row, or use **Odd**, **Even** or **All**. A captain who alternates two lineups can select the odd innings, set that lineup, then select the even innings and set the other. A note below the row says which innings a change will touch.
- **Kicking:** tap a kicker, then tap the numbered spot in the order they should take.
- **Players:** a headcount at the top shows how many are playing and warns below 8, and the same number sits on the **Players** button. Set each player's RSVP to Yes, Maybe or No. Marking someone No also clears their positions in every inning. The **×** beside a name removes them from this game, and a name tapped under **Add from the roster** goes into the next empty row after the last player, so late arrivals land at the end of the kicking order.
- **Games:** lists every game on the `Schedule` tab with its date, time, place, opponent and whether it has a lineup tab. Tap a game to edit its details or enter the result (Won, Lost or Tied with both scores), **Add a game** for a reschedule or playoff, and **Set up lineups** to create a lineup tab for every game that has a date and no tab yet. Each new tab starts with everyone on the `Roster` tab and no replies, so a captain only has to mark who is coming. It only appears for sheets that have the `Schedule` and `New game (copy me)` tabs.
- **Team:** two views. **Settings** is the eight `Team Config` settings as a form (name, season label, icon, main and second color, stripe, font and the suggestion box) with the team link and a Copy button. Changes show on the page as you make them, and **Save** writes them to the `Team Config` tab. **Roster** lists everyone on the `Roster` tab. Tap a name to change their name, preferred and won't-play positions, pronouns or notes, or remove them, and use **Add a player** for someone new. Renaming a player also renames them in every game. Removing someone does not take them out of games already set up. Undo reverses any of these. Settings appears for sheets with a `Team Config` tab and Roster for sheets with a `Roster` tab.
- **Undo:** the **Undo** button in the top bar reverses the last field move, kicking move, RSVP, added or removed player, and keeps going back through earlier ones. Game details and new lineup tabs cannot be undone from the page.
- **Opening on the right game:** the team page opens on the next game by date, or the most recent one once the season is over.
- Edits are written to the sheet with your own account, so the sheet's version history shows who made them. If the sheet changed since the page last updated, nothing is saved and the page says so.
- Sheets that number the kicking order in column B are edited in the sheet.

## How it works

1. `worker/` is a Cloudflare Worker. It holds an encrypted refresh token for each connected sheet and reads that one sheet through the Google Sheets API.
2. It returns only the lineup tabs (names ending in "lineup" in any capitalization, not starting with "OLD") and the `Team Config` settings. Roster notes, comments and every other tab stay in the sheet.
3. Reads are cached for 5 seconds, so many players refreshing do not each hit Google.
4. Suggestions from the page are appended to a `Comments` tab in the captain's sheet, limited to 60 per hour.
5. `site/` is the static page on GitHub Pages. `start.html` is the setup flow and `index.html?team=<code>` is the player view. Captain tools run in the browser and edit the sheet with the signed-in captain's own Google account, not through the Worker.
6. If the sheet is deleted, the Worker forgets the team and the link says so. The setup page drops the team from its list, and Stop sharing still works.
7. Team codes are random, so the link is the only thing protecting the lineup view. Anyone with the link can see the lineups, and nothing else.
8. The team's sheet depends on the creator's Google connection. If it expires, the page shows a reconnect link for the captain who created the team.

### Running the Worker

```
cd worker
npm install
npm test
npx wrangler kv namespace create TEAMS
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler deploy
```

`wrangler.toml` holds the KV namespace id, the Google client id and the allowed site origins. `TOKEN_ENCRYPTION_KEY` is 32 random bytes in base64. The Google project needs the Sheets, Drive and Picker APIs, a Web OAuth client and a Picker API key, all in `site/settings.js`.

Deploy the Worker before the site. The page asks for API version 4 and shows "out of date" against an older Worker.

## What the sheet needs

| Convention | Used for |
| --- | --- |
| Tab name ends in "Lineup" (any capitalization) | The tab is a game |
| Tab name starts with "OLD" | The tab is skipped |
| "Name" and "Open spots" (or "Acceptable") labels in column A | Finding the player grid. If one is missing, the view names the tab instead of guessing |
| "Date:", "Time:", "Location:", "Opponent:" and "Notes:" labels in column A, value in column B | Game details. Any that are missing show blank |
| "Game #:" label in column A with a number beside it | Names the game, like "Game 3 (10/21/26)", and puts the games in order. Two tabs cannot share a number: the later tab is hidden and a notice on the page names both tabs |
| Notes like "W, 12-0", "L, 3-5" or "T, 5-5" (your runs first) | The result of the game, shown as "Won 12-0", "Lost 3-5" or "Tied 5-5". A game with a result counts toward season totals. Other notes are shown as written |
| Inning numbers in the "Name" row | One column per inning |
| Position codes P, C, 1B, 2B, 3B, SS, LF, LC, CF, RC, RF | Placing players on the field. Any other code is flagged |
| "RSVP" in the Name row's column B, with Yes, Maybe or No beside each player | No means not attending. Blank (no reply yet) and Maybe count as playing |
| Strikethrough on a player's name | Player is not attending: left out of the kicking order, sitting list and totals |
| Row order of players | Kicking order |
| Same spelling of a name on every tab | Season totals add up as one person |

## Known limits

- The field always has the 11 positions above, and the template has 5 innings.
- A game counts toward season totals once its result is entered, so a rained-out game never counts.
- Date and time appear exactly as the lineup tab displays them.
- A sheet where positions run down the side and names fill the cells is not read. Players go in rows and positions are codes.
