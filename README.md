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
- **Mock mode** (`MOCK_MODE=true`): the managed-app calls are simulated (marked `simulated` in the dashboard), and PawsOps connects 3 child apps you created by hand from `manifests/`. Agent messages and buttons are real, in your Slack sandbox. Delete is always simulated in mock mode, so your pre-made apps are never removed.

Transport defaults to **Socket Mode** (`TRANSPORT=socket`), so no tunnel is needed. `TRANSPORT=http` routes each app to `POST /slack/events/:agentKey`, verified with that app's signing secret.

## Setup (mock mode, Socket Mode)

Requires Node 20+ and a Slack Enterprise sandbox (`apps.managed.permissions.set` is Enterprise Grid only).

```bash
npm install
cp .env.example .env
npm run dev            # dashboard at http://localhost:3000
```

### 1. Create the PawsOps manager app (optional in mock mode)

1. Go to https://api.slack.com/apps → **Create New App** → **From a manifest** → pick your sandbox workspace.
2. Paste `manifests/pawsops-manager.json`. If the workspace is not feature-flagged and validation fails on `managed_apps:install` or `managed_app_deleted`, use `manifests/pawsops-manager.unflagged.json` instead.
3. **Install to Workspace**. Copy the Bot token (`xoxb-`) and User token (`xoxp-`) into `MANAGER_BOT_TOKEN` and `MANAGER_USER_TOKEN`.
4. **Basic Information → App-Level Tokens → Generate**, scope `connections:write`. Copy the `xapp-` token into `MANAGER_APP_TOKEN`.

### 2. Create the 3 agent apps (mock mode)

Repeat for `client-updates`, `overtime-approver` and `inventory-tracker`:

1. **Create New App → From a manifest**, paste `manifests/<agent>.json`.
2. **Basic Information → Display Information**: upload `assets/icons/<agent>.png`.
3. **Install to Workspace**.
4. Generate an app-level token with `connections:write`.
5. Copy the App ID, Bot token and app-level token into the matching `.env` block.

Invite the agents to `#managers` and `#outbox` in Slack. Restart `npm run dev`; the dashboard should show no "Pre-made app missing" badges.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the server with reload |
| `npm run manifests` | Regenerate `manifests/*.json` from `src/manifests.ts` |
| `npm run icons` | Regenerate the 512×512 icons in `assets/icons/` |
| `npm run typecheck` | TypeScript check |

## Project layout

```
src/
  agents/catalog.ts       agent definitions: name, scopes, events, permissions
  agents/handlers.ts      what each agent does in Slack
  manifests.ts            manager and child app manifests
  manager/deploy.ts       deploy, rename, delete, managed_app_deleted
  manager/managerApp.ts   PawsOps' own Slack connection
  manager/routes.ts       dashboard API (streams each Slack call)
  slack/managedApps.ts    every managed-app Web API call, real or simulated
  slack/runtime.ts        one Bolt app per deployed agent
  store/store.ts          JSON file store (data/store.json)
public/                   dashboard
manifests/                generated manifests for hand-created apps
```
