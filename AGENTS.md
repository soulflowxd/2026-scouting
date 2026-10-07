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

## Scouting Behavior

- Keep external statistics tied to the selected event and current year. Never
  substitute another year's EPA when current-year data is unavailable.
- Preserve independent in-season and offseason/all xP scopes.
- Pit reports require at least one robot photo, with up to six photos, each no
  larger than 10 MB. Validate uploaded storage metadata on the backend.
- Support phone-camera capture and multiple-file uploads. Preserve existing
  reports without photos, but require a photo when submitting updates.
- Keep strategy-board robot markers square and paths colored by driver station.

## Deployment And Secrets

- Production frontend: `https://2026-scouting.vercel.app`.
- Vercel configuration is in `vercel.json`; `scripts/deploy.mjs` coordinates the
  Convex deployment and frontend build with `VITE_CONVEX_URL` injected.
- Deploy with `vercel deploy --prod --yes` only when authorized. Wait for
  completion and report failures accurately.
- Keep API keys and deployment credentials in environment variables. Never
  commit `.env` files, paste secrets into source, or print credentials in logs.
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
