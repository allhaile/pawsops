# PawsOps

A working demo of Slack's **Add to Slack** feature for agent platforms. PawsOps is a fictional agent builder that acts as a Slack Marketplace **manager app**. It provisions one dedicated Slack app (a **managed app**) per agent into a customer's workspace, with no extra OAuth per agent.

The customer is **Paws & Stay**, a 3-location dog boarding business, which deploys three agents:

| Agent | What it does |
|---|---|
| Client Updates | Staff post a photo and ask for an owner update. The agent drafts an email, staff approve it, then it "sends" (mock outbox). |
| Overtime Approver | Posts an Approve/Deny card in #managers when an employee passes 40 hours (mock ADP data). Restricted to managers. |
| Inventory Tracker | Answers stock questions per location and posts low-stock alerts with a Reorder button (mock inventory API). |

All data is fake. Overtime and outbound email always require a human approval.

## How deploy works

Clicking **Add to Slack** for an agent runs these calls with the manager app's token:

1. `apps.manifest.create`: create the child app from its manifest
2. `apps.icon.set`: upload the agent icon
3. `apps.managed.permissions.set`: set who can interact (`everyone` or `app_owner`)
4. `apps.managedInstall`: install the child app into the workspace

Lifecycle: `apps.manifest.update` (rename), `apps.manifest.delete`, and a `managed_app_deleted` event handler.

> `apps.managedInstall` and `managed_app_deleted` are not publicly documented yet. Their payloads are isolated in `src/slack/managedApps.ts` and marked `UNVERIFIED`.

## Modes

- **Real mode** (`MOCK_MODE=false`): every call goes to Slack. Requires a workspace feature-flagged by the Slack Partnerships team, since `managed_apps:install` is a restricted scope.
- **Mock mode** (`MOCK_MODE=true`): the flagged calls are simulated, and PawsOps connects 3 child apps you created by hand from `manifests/`. Agent messages and buttons are real, in your Slack sandbox.

## Setup

Requires Node 20+ and a public HTTPS tunnel (ngrok, cloudflared).

```bash
npm install
cp .env.example .env   # fill in values
npm run dev
```

Open http://localhost:3000.

Detailed manager app and sandbox setup steps are added in later phases.
