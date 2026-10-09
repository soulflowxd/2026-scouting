# Production Deployment

Pushes to `master` run `deploy-production.yml`, regardless of the pusher's
username. Other branches do not replace production. The workflow can also be
started manually from GitHub Actions on `master`.

Configure these repository secrets in GitHub Settings > Secrets and variables >
Actions:

- `VERCEL_TOKEN`: a Vercel token with access to the production project.
- `VERCEL_ORG_ID`: the project's Vercel account or team ID.
- `VERCEL_PROJECT_ID`: the existing production project ID.

Use the IDs from `.vercel/project.json` after linking the existing project with
`vercel link`. Do not create a replacement project or commit the token.
Store the production Convex deploy key in the existing Vercel project's
production environment as `CONVEX_DEPLOY_KEY`.

The workflow runs tests, pulls the production environment, and uses
`vercel build --prod` followed by `vercel deploy --prebuilt --prod`. The existing
`vercel.json` build command deploys Convex and builds the frontend together.

The token owner must have deployment permission under the Vercel project's
plan and access policies. This workflow does not override those policies.
Restrict write access and protect `master`: anyone able to change deployed code
or the workflow can influence production and access deployment secrets.

If Git-integrated Vercel deployments are also enabled, they may trigger a
second build. Disable automatic Git deployments in the Vercel project after
the Actions workflow has successfully deployed, to use a single deployment path.
