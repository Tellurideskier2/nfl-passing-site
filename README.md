# NFL Passing Yards Edge Finder

Click **Update Today's Slate** to fetch upcoming NFL QB passing-yard markets, compare sportsbook prices, load player/team/matchup stats, and calculate projections, probabilities, EV, edge, best bets and confidence. Manual entry remains available, including when the odds provider is unavailable.

## Connect the existing MLB odds account

This app reuses **SportsGameOdds v2**, the provider used by `Tellurideskier2/mlb-k-site/server/odds.js`, and the same environment variable: `SPORTSGAMEODDS_API_KEY`.

Copy that key from the MLB service's **Render → Environment** into the NFL service's environment. Render does not automatically share a variable between services. Do not put a key in GitHub, HTML, browser storage, a screenshot, or a URL. The key is sent only from this server to SportsGameOdds in the `x-api-key` header. Your subscription must include NFL player props and the books you want; MLB access alone does not establish NFL entitlement.

No key was copied from the MLB repository: it correctly references the environment rather than storing a credential. The NFL app starts normally without a key and explains the required setup when automatic updating is requested.

## Run locally

Use Node 22–24 (24 recommended):

```sh
npm ci
# Copy .env.example to .env, then enter your API key in .env.
npm start
```

Open http://localhost:3000. The server loads `.env` automatically. Opening the HTML directly is no longer the supported launch method. There are no production package dependencies or frontend build steps.

## Render deployment

Use an existing **Node Web Service**, or create a Blueprint from `render.yaml`.

| Setting | Value |
| --- | --- |
| Repository | `Tellurideskier2/nfl-passing-site` |
| Branch | The branch containing these changes; use `main` after merging |
| Root directory | Leave empty |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Node | `NODE_VERSION=24.19.0` (Blueprint sets this) |

Set the key below, save the environment, then deploy the latest commit. The server binds `0.0.0.0` and uses Render's assigned `PORT`. Existing services do not automatically adopt settings from a newly added Blueprint; update their settings in the dashboard. No persistent disk is needed. Server caches reset on redeploy, while manual entries remain in the user's browser.

### Environment variables

| Variable | Required / default | Purpose |
| --- | --- | --- |
| `SPORTSGAMEODDS_API_KEY` | Required for automatic odds | Reuse the MLB server key if its plan covers NFL props. |
| `SLATE_TIMEZONE` | `America/Denver` | IANA timezone defining the slate date and midnight bounds; DST is respected. |
| `ODDS_BOOKMAKERS` | Empty | Optional comma-separated SportsGameOdds bookmaker IDs, e.g. `draftkings,fanduel,betmgm,caesars`. Empty requests all covered books. |
| `SLATE_CACHE_SECONDS` | `120` | Completed slate cache, clamped to 30–900 seconds. |
| `STATS_CACHE_SECONDS` | `3600` | Stats download cache, clamped to 300–86400 seconds. |
| `PORT` | `3000` locally | Render supplies this automatically. |

The default public app has no login. Refreshes use a shared cache and coalesce concurrent requests; errors have a 30-second cooldown. A per-instance cache is not an account-wide quota guarantee. For a private dashboard, restrict access at your hosting layer. No betting transactions are supported.

## Daily workflow and comparison

1. **Update Today's Slate** resolves today on the server in the configured timezone. **Update Selected Date** supports today through the next seven days. Historical odds/backtesting are not provided.
2. The server requests SportsGameOdds `/v2/events` with `leagueID=NFL`, `passing_yards-PLAYER_ID-game-ou-over`, opposing odds and alternate lines, and follows all response cursors. Only full-game, upcoming, non-cancelled markets for that date are retained. It never silently switches to another day's slate.
3. Every returned player remains visible even if their stats cannot be matched. Unavailable/suspended quotes and invalid prices are excluded. Missing bookmaker lines are never substituted with consensus or fair lines. Known pick'em platforms are excluded because their displayed numbers do not represent straight-bet payouts. Use `ODDS_BOOKMAKERS` to restrict results to your actual sportsbooks.
4. The dashboard selects the highest **estimated EV** quote for over and under independently, accounting for both the line and price. It does not pair the best over price at one line with an under at a different line as if they were one market. **Details** shows every quote, both probabilities, push probability, EV, edge, bookmaker update timestamp, and best price per side at each identical line.
5. The best bet is the positive-EV side with at least a 1.5 percentage-point edge and sufficient stats. Otherwise the result is **Pass**. No offered side or no model is shown as unavailable, not as 0%.
6. Search, filter picks, export all quotes as CSV, or add a manual prop. Manual entries are separately persisted in browser storage and are not deleted by refresh. Compatible entries from the original `nflPassingProps` storage are imported; the original storage is left intact. Undated or different-day manual entries cannot generate a current-slate pick.

An empty slate is normal on non-game days or before books post props. The response covers all available quotes returned by the configured provider/account, not every sportsbook in existence. Price timestamps are provider timestamps, not guarantees that a price can still be placed. Started games are removed, including from cached responses and the open page. Expired/failed snapshots retain visible quotes for reference but disable automatic picks until refreshed.

## Automatic stats and model

Public nflverse weekly **player and team** CSVs for the current and previous NFL seasons are combined with the nflverse schedule. January/February map to the prior NFL season. Games on or after the slate date are excluded to prevent look-ahead. Player matching uses normalized full names, checks unique IDs and matchup team, and does not guess fuzzy matches. Players without verified history (including rookies) remain on the board without a projection.

Inputs include last 5/10 passing-yard averages, season baseline, projected attempts, YPA, team passing yards/attempts, opponent gross passing yards allowed, schedule spread and total, and known dome/closed-roof status. Only qualifying QB starts with at least 10 attempts are used, with up to 400 days of history. A previous-season baseline is used when fewer than three current-season starts exist. Team and opponent summaries use up to ten recent games. Missing schedule matches suppress the model; missing defense/total/spread adjustments are omitted and data notes explain limitations. NFL stats are not instant; a QB history trailing the team's last completed game disables its automatic pick.

The model is intentionally transparent and **not calibrated or backtested**:

- Base yards = 30% last 5 average + 20% last 10 average + 20% baseline average + 30% (projected attempts × YPA).
- Attempts = 65% recent 5 average + 35% baseline average. YPA uses aggregate yards divided by attempts.
- Defense adjustment = 18% of opponent yards allowed above 220, capped at ±15 yards; total adjustment = 1.5 × points above 44, capped at ±15; spread adjustment = 2 × team spread, capped at ±14. Dome adds 5. Manual bad weather subtracts 12; manual yard adjustments are supported.
- A normal approximation uses recent game sample SD with a 45-yard floor. The same distribution is used for every sportsbook and line. Manual inputs use an attempts/projection-based SD when no observed SD exists.
- For line `L`, over wins at `floor(L)+1` and under at `ceil(L)-1`. Continuity correction handles whole-yard pushes separately; half-yard lines have no push mass.
- `EV per $100 = 100 × (P(win) × (decimal odds − 1) − P(loss))`. A push refunds the stake.
- Edge is the model's unconditional win probability minus the push-adjusted break-even probability `(1 − P(push)) / decimal odds`, expressed in percentage points. It is not a no-vig market consensus edge.
- Confidence is **Unavailable**, **Low**, or **Medium**, based on data support. It is capped at Medium until the model has out-of-sample calibration. Manual/small-sample/prior-season-only/data-warning estimates are Low. Confidence is not a win probability; higher EV does not by itself create higher confidence.

No injury feed, live weather forecast, EPA model or pass-rate-over-expectation model is claimed. Verify the starting QB and conditions. Games with fewer than three qualifying starts or stale QB stats receive no automatic pick.

## Tests

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
# Optional real public-data check (network required, no API key):
npm run test:live-stats
```

`npm test` covers probabilities/pushes, EV, line shopping, missing/sparse/stale data, timezone/DST, pagination, filtered/suspended markets, API errors, CSV parsing, past-only stats, shared caching, HTTP responses and protection of non-public files. Browser E2E runs the real server and frontend with fixture upstream responses; it checks refresh through rendered results, missing players, quote details, search, CSV, manual persistence, escaping, error recovery and mobile overflow. It does not spend odds API credits. Screenshots are written to ignored `test-results/`.

For an installed Chrome instead of downloaded Chromium, set `BROWSER_EXECUTABLE` to its executable path. `PLAYWRIGHT_MODULE` can point to an existing Playwright `index.mjs` installation. GitHub Actions runs both automated suites on Node 24.

Validation during implementation: all 15 unit/integration tests and desktop/mobile browser E2E passed; a live nflverse check on September 22, 2026 downloaded current/prior player and team data and produced Jordan Love matchup inputs for September 24. Paid live odds and the deployed Render service were not tested because the NFL service's credential/hosting connection was not available. After configuring Render, click Update on a game day and confirm the provider returns your covered books.

## Data references

- [SportsGameOdds events endpoint](https://sportsgameodds.com/docs/endpoints/getEvents)
- [SportsGameOdds NFL market guide](https://sportsgameodds.com/blog/nfl-odds-api-guide)
- [SportsGameOdds response examples](https://sportsgameodds.com/docs/basics/quickstart)
- [nflverse player stats](https://nflreadr.nflverse.com/reference/load_player_stats.html) and [team stats](https://nflreadr.nflverse.com/reference/load_team_stats.html)
- [nflverse schedule](https://github.com/nflverse/nfldata/blob/master/data/games.csv)
- [Render Node version](https://render.com/docs/node-version) and [health checks](https://render.com/docs/health-checks)

The old ZIP archive is retained as a historical repository artifact and is not served by the web app. Deploy the current repository files, not that archive.
