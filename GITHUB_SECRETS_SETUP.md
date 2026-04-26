# GitHub Actions and Amplify Access Setup Guide

This repository now uses a single deployment path:

- GitHub Actions runs quality gates only.
- AWS Amplify Console deploys the frontend and backend after a successful push to a connected branch.

## Required GitHub Secrets

The current GitHub Actions workflow in `.github/workflows/ci.yml` does not require any AWS repository secrets. It only runs:

- `npm ci`
- `npm run generate:config`
- `npm run validate:amplify-outputs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:ci`
- `npm audit --production`

If you later reintroduce AWS CLI steps into GitHub Actions, add only the minimum secrets required for those steps.

## What AWS Amplify Needs

Deployment is handled by AWS Amplify Console, not by GitHub Actions. Configure these in Amplify Console instead:

1. Connect the repository and branch.
2. Confirm the build spec uses `amplify.yml`.
3. Ensure the Amplify service role can deploy backend resources.
4. Set any runtime environment variables required by the frontend.

Amplify Console injects deployment context such as `AWS_APP_ID` and `AWS_BRANCH` during the build. The backend phase uses those values to run `npx ampx pipeline-deploy`.

## Verification

After pushing code:

1. Open the GitHub Actions run for the `CI/CD Pipeline` workflow.
2. Confirm the `quality-gates` job passes.
3. Open AWS Amplify Console.
4. Confirm the same branch started a new deployment.
5. In the Amplify build logs, confirm the backend phase runs `npx ampx pipeline-deploy`.

## Troubleshooting

### GitHub Actions passes but AWS Amplify does not deploy
- Confirm the branch is connected in Amplify Console.
- Confirm Amplify is using the repository's `amplify.yml`.
- Confirm the push went to a tracked branch such as `main` or `1-delivery-management`.

### Amplify build fails during backend deploy
- Confirm `@aws-amplify/backend-cli` is installed in `devDependencies`.
- Confirm the Amplify service role has permission to deploy backend resources.
- Confirm `AWS_APP_ID` and branch context are available in the Amplify build environment.

### Amplify outputs validation fails
- Run `npm run generate:config` locally.
- Check that the backend branch has deployed successfully at least once.
- Confirm the generated `amplify_outputs.json` does not contain placeholder values.

## Security Best Practices

1. Do not commit credentials or manually generated secrets into the repository.
2. Prefer Amplify service roles and GitHub App integration over long-lived IAM user credentials.
3. Grant the Amplify service role only the AWS permissions required for this app.

## Next Steps

1. Push a commit to the tracked branch.
2. Verify GitHub Actions quality gates pass.
3. Verify Amplify Console starts and completes the deployment.
4. Test authentication and data access against the deployed environment.
