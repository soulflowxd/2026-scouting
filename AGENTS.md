# Project Guidance

`AGENTS.md` is the canonical instruction file for coding agents. `CLAUDE.md`
redirects here; keep project guidance here rather than duplicating it.

## Stack And Structure

- React, TypeScript, Vite, React Router, Tailwind CSS, and lucide-react.
- Convex handles database queries, mutations, file storage, and authentication.
- Routes live in `src/routes`; shared UI lives in `src/components`.
- Backend functions, schema, validators, and tests live in `convex`.
- Follow existing component patterns and keep changes scoped to the request.

## Development And Verification

- Install dependencies with `bun install`. Vercel also uses Bun explicitly.
- `npm run dev` starts Vite; report the actual URL and port it prints.
- `npm run build` runs TypeScript checks and builds the frontend.
- `npm test` runs the Vitest/convex-test backend suite.
- `npm run lint` runs ESLint.
- Verify relevant tests and a production build before deploying code changes.
- Preserve unrelated work in a dirty checkout. Stage only intended files;
  never reset or discard another contributor's changes.

## Authentication And Accounts

- Use server-side authorization helpers in `convex/lib/authz.ts`.
- Convex Auth subjects include a user ID and session ID. Resolve members using
  the canonical-member helpers, not a new member row per session.
- Protect the super-admin account. Enforce permissions on the backend, not
  just through hidden frontend controls.
- Do not automatically merge identities just because emails match. Use the
  authorized duplicate-cleanup flow, preserving the password-linked account,
  archiving obsolete rows, and preserving scouting ownership.
- Archived identities must not regain access or recreate duplicate member rows.
- Use Convex Auth credential helpers for password changes; never store plaintext
  passwords. Require the actor's current password and revoke other sessions.
- Name editing uses first-name and last-name inputs with a combined display name.
- Signup requires separate first and last names. Trim both and reject missing
  or whitespace-only values on the backend as well as in the form. Existing
  accounts must still be able to sign in without re-entering their names.
- Notify approved admins and the super admin of pending account approvals.
  Keep pending requests visible in the notification bell until resolved, link
  them to the admin page, and do not notify scouts about other users' requests.
- Notify scouts when their account transitions to approved, with a dismissible
  in-app confirmation and Web Push when enabled. Repeated approval clicks or
  sign-ins must not schedule duplicate notifications.
- Pending scouts may register their own device notifications from the waiting
  screen. This must not grant scouting access; rejected and archived accounts
  must remain blocked. Recheck recipient eligibility before push delivery.

## Scouting Behavior

- Save pit and match submissions durably in the device's IndexedDB outbox before
  clearing forms. Include pit photo files, scope queued data to the deployment
  and canonical scout, and upload automatically while that scout is signed in
  and connected. Remove queued reports only after server acknowledgement.
  Retain upload errors with a retry option; never bypass authorization, event
  closure, assignments, or report locks. Use client submission IDs to make
  retries idempotent. Device-local drafts are not submitted reports. Uploads
  require the app to be open; do not promise closed-app background syncing.

- Pit reports lock a team at that event after submission; match reports lock a
  team in that specific match. Reject repeat submissions from every role until
  an approved admin deletes the existing report(s). Admins can delete individual
  reports from team details even when scouting is closed. Preserve other reports,
  official results and independent breakdown follow-ups; retract unsupported
  breakdown alerts when the final reporting match report is removed.

- Admins choose event-specific participants for randomized regular-team scouting
  assignments. Balance all teams across available scouts without a fixed group
  limit. If regular teams overlap in a match, choose one randomly and use free
  scouts to cover other robots. Seed match choices so all devices agree; assign
  at most one robot per scout per match and leave coverage gaps visible. Assignment edits must not
  transfer active claims or bypass the two-person substitute handoff. Enforce
  assignment-only mode on backend claims and new reports, while allowing an
  existing claim owner or confirmed substitute to finish their report.
- Match scouting automatically syncs available official TBA alliance results for
  the selected qualification match. Keep robot cycles, activities, ratings, and
  breakdown observations scout-entered. Retain manual results when TBA is
  unavailable or unposted; never invent TBA match keys for custom events.
- Keep external statistics tied to the selected event and current year. Never
  substitute another year's EPA when current-year data is unavailable.
- Preserve independent in-season and offseason/all xP scopes.
- Resolve TBA event `remap_teams` aliases for offseason demo teams when importing
  rankings, RP, OPR, DPR, CCWM, and match rosters. Preserve the demo team's
  numeric identity; never borrow a parent team's statistics for its B squad.
- Use letter-suffixed event aliases (such as 1745S and 10014R) as the primary
  visible team identifiers. Never show event-local placeholder numbers in their
  place. Preserve internal numeric keys so reports and rankings remain linked,
  and support searching by either identifier.
- Offseason demo teams (99xx numbers) and letter-suffixed second robots may
  display EPA/xP only from the selected event. Do not use season, prior-event,
  or parent-team fallbacks. Hide unverified cached stats until refreshed.
- Custom event rosters must keep letter-suffixed squads separate from their
  parent teams. `scripts/load-ntx.mjs` loads the supplied NTX roster into an
  explicitly named deployment. Do not invent schedules or external statistics
  for manually supplied rosters.
- NTX is not on TBA. Skip TBA event lookups for NTX; available current-year
  EPA/xP for regular teams must be labeled as team stats, not NTX results.
  Leave unavailable event RP and standings blank. NTX roster updates are
  additive and idempotent; preserve existing teams and scouting data.
- STEM Gals (`2026txmck`) uses FIRST event TXMCK rather than TBA. Import its
  verified roster and qualification schedule with `scripts/load-stem-gals.mjs`
  into an explicitly named deployment. Keep FIRST match identifiers distinct
  from TBA keys. Regular-team EPA/xP are current-year team stats; event RP,
  ranks, and records come from FIRST rankings, refreshed every five minutes.
  Leave unposted rankings blank and preserve posted rankings during outages.
  Rankings refreshes must not overwrite EPA/xP or their independent scopes.
- Prefer the official Statbotics API for EPA. When unavailable, use the
  manifest and compressed data files at
  `https://blobs-statbotics.popcornpenguins.com`, the data source for the
  supplied `https://statbotics.popcornpenguins.com` mirror. Validate the year
  and event on fallback rows; keep demo/second-robot restrictions intact.
  Never substitute mirror season RP for selected-event FIRST rankings.
- Rebellious 9994 is the same NTX robot as 10014R, not an additional team.
  Keep the duplicate archived and recoverable rather than deleting reports.
- Admins control scouting submissions per event in Event setup. Enforce closed
  events on the backend for pit saves, match claims/reports, and breakdown
  follow-ups, including admin submissions. New events start closed; legacy
  events without the setting remain open. Viewing data and rankings stays open.
- Breakdown alerts remain unresolved until a required follow-up form is saved.
  Keep device notifications and in-app scout alerts consistent.
- Team logos must come from TBA, not local logo overrides. The supplied ITKAN
  image is the app favicon. Team-color accents come from FRC Colors; preserve
  readable card text and neutral fallbacks when branding is unavailable.
- Scouts' pit reports require at least one robot photo. Approved admins and the
  super admin may submit without photos; enforce this exemption on the backend.
  All uploaded reports allow up to four photos, each no larger than 10 MB.
  Validate uploaded storage metadata on the backend even for admins.
- Support phone-camera capture and multiple-file uploads. Preserve existing
  reports without photos, but require a photo when submitting updates.
- Keep strategy-board robot markers square and paths colored by driver station.

## Rank Teams And Navigation

- Keep mobile-only UI redesigns behind responsive breakpoints. The pick-list
  landing page stays full-width at 768px and up, with compact creation controls,
  shared/personal lists side by side, and collapsible admin consensus tools.
  Let the landing page scroll normally; never clip its content between fixed
  panels. Use the compact mobile landing layout only on smaller screens.
- Laptop pick-list boards need readable team cards and stats. Keep tier columns
  at least 24rem wide with horizontal scrolling and buttons to jump between
  tiers; do not squeeze all five tiers into narrow columns. Keep the board
  header compact and full cards visible on short screens. Preserve mobile tier
  selection, drag-and-drop, search, team details, picked status, and shared Elo.
- Rank Teams uses a shared, event-scoped Elo leaderboard from approved scouts'
  votes in Convex. Pick-list cards show the same shared Elo. Do not revert to
  device-only rankings or automatically import old local votes. Scouts may
  undo only their own votes; enforce this on the backend.
- Randomize matchups, favor less-compared teams, and avoid repeated pairs when
  possible. Skip teams without stats or scouting reports until evidence exists.
- Percentage filtering by EPA or shared Elo keeps at least 10 scored teams for
  every event, or all scored teams if fewer exist. Include cutoff ties; do not
  invent scores to meet the minimum. All teams includes unranked eligible teams.
- Keep comparison cards compact: Pick controls above photos, bounded photo
  previews, compact stats, and access to full-size images and photo thumbnails.
- Keep the header uncluttered: short event name, single-line primary navigation,
  visible scout alerts, and account/admin/theme/sign-out in the profile menu.
  Keep detailed stats provenance on relevant pages, not in the header subtitle.
- Unknown routes use the custom 404 page within the app shell, with links back
  to scouting and a safe fallback when there is no prior in-app history.

## Deployment And Secrets

- Production frontend: `https://2026-scouting.vercel.app`.
- Vercel configuration is in `vercel.json`; `scripts/deploy.mjs` coordinates the
  Convex deployment and frontend build with `VITE_CONVEX_URL` injected.
- Deploy with `vercel deploy --prod --yes` only when authorized. Wait for
  completion and report failures accurately.
- Keep API keys and deployment credentials in environment variables. Never
  commit `.env` files, paste secrets into source, or print credentials in logs.
- FIRST API credentials belong in server-side `FIRST_API_USERNAME` and
  `FIRST_API_AUTH_TOKEN` environment variables, never in browser bundles.
- Keep the current production site serving while a replacement builds and
  passes verification. Preserve backward-compatible backend APIs and avoid
  restarting the running preview or clearing live data during a UI deployment.
- Missing Convex deployment configuration requires project/environment setup;
  do not silently create or select a different backend.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
