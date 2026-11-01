# Gates: mobile scouting redesign

OWNS: src/routes/**, src/components/**, src/lib/match-activity*, convex/matchScouting.ts, convex/scouting.test.ts, AGENTS.md, GATES.md

Scope: Make every routed screen usable on a phone with less scrolling while finishing the focused, hold-to-record match scout.

- [x] G1: Match scouting opens in an isolated start state, then an isolated live state with hold-to-record actions, restart, stealing, and a correct auto-based shift counter.
  EVIDENCE: MatchActivity portal and matchShift unit test; backend accepts Stealing.

- [x] G2: Scout-facing routes use compact mobile layouts, especially Pick Lists, and reveal secondary content on demand while preserving their desktop layouts.
  EVIDENCE: Pick Lists mobile natural scroll and compact cards; Teams compact cards; Rank Teams secondary stats disclosure; pit guide one-row navigation.

- [x] G2a: Teams and Pick Lists show quick robot capability cues such as defense and passing when verified scouting data exists.
  EVIDENCE: teams.list derives observedActivities from nonzero activityTimeline segments; both cards render evidence cues.

- [x] G3: Admin, account, event, pick-list, strategy, and fallback routes remain usable at narrow phone widths without horizontal overflow or buried primary actions.
  EVIDENCE: Static responsive-class audit of routes; existing grid layouts and menu remain responsive; no new fixed-width route content introduced.

- [x] G3a: Breakdown alerts name the responsible pit scout, while any approved scout can submit the follow-up and resolve the alert for everyone.
  EVIDENCE: notifications.mine resolves scoutTeamAssignments; cross-recipient submission test passes.

- [x] G4: Production build succeeds after the mobile changes.
  CHECK: npm.cmd run build
  EXPECT: built in
  EVIDENCE: npm.cmd run build passed.

- [x] G5: Tests pass, including timing and activity report validation.
  CHECK: npm.cmd test
  EXPECT: Test Files
  EVIDENCE: 39 files, 130 tests passed.

- [x] G6: Lint has no errors.
  CHECK: npm.cmd run lint
  EXPECT: 0 errors
  EVIDENCE: 0 errors, 4 generated-file warnings.

- [x] G7: A phone-accessible Vercel preview uses the Convex development deployment, and the feature branch includes the completed changes.
  EVIDENCE: Vercel preview bccq34v6o READY and HTTP 200; Convex dev functions ready. Branch push checked separately.
