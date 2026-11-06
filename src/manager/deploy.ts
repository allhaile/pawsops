/**
 * Agent lifecycle: deploy (Add to Slack), rename, delete, and the managed_app_deleted handler.
 *
 * Real mode: every call hits Slack with the manager app's tokens.
 * Mock mode: managed-app calls are simulated, and the agent connects to a pre-made app from .env.
 * With SLACK_CONFIG_TOKEN set, mock mode also runs rename and icon calls for real on the pre-made app.
 */
import path from 'node:path';
import { catalog } from '../agents/catalog.js';
import { config, type AgentKey } from '../config.js';
import { childManifest } from '../manifests.js';
import * as slack from '../slack/managedApps.js';
import * as runtime from '../slack/runtime.js';
import * as store from '../store/store.js';

export type Step =
	| ({ type: 'call' } & slack.CallResult)
	| { type: 'local'; title: string; detail: string; ok: boolean }
	| { type: 'done'; message: string }
	| { type: 'error'; message: string };

export type Emit = (step: Step) => void;

function iconPath(key: AgentKey) {
	return path.resolve('assets/icons', `${key}.png`);
}

function recorder(agent: AgentKey | 'manager', emit: Emit) {
	return (result: slack.CallResult) => {
		store.addActivity({ at: new Date().toISOString(), agent, ...result });
		emit({ type: 'call', ...result });
	};
}

/** Token and simulate flag for each managed-app call, based on mode. */
function callOptions(kind: 'user' | 'bot' | 'config-capable', onCall: slack.CallOptions['onCall']): slack.CallOptions {
	if (config.mockMode) {
		const realViaConfigToken = kind === 'config-capable' && Boolean(config.configToken);
		return { token: config.configToken, simulate: !realViaConfigToken, onCall };
	}
	const token = kind === 'bot' ? config.manager.botToken : config.manager.userToken;
	return { token, simulate: false, onCall };
}

export async function deployAgent(key: AgentKey, emit: Emit) {
	const agent = catalog[key];
	if (store.getAgent(key)) {
		throw new Error(`${agent.name} is already deployed.`);
	}
	const premade = config.premade[key];
	if (config.mockMode && !premade.appId) {
		throw new Error(`Mock mode needs the pre-made ${agent.name} app. Fill in its values in .env.`);
	}
	const onCall = recorder(key, emit);

	const created = await slack.createApp(childManifest(agent), premade.appId, callOptions('user', onCall));
	await slack.setIcon(created.appId, iconPath(key), callOptions('config-capable', onCall));
	await slack.setPermissions(created.appId, agent.permissions, callOptions('bot', onCall));
	const installed = await slack.managedInstall(created.appId, callOptions('user', onCall));

	const creds = config.mockMode
		? premade
		: { botToken: installed.botToken, appToken: created.appToken, signingSecret: created.signingSecret };

	store.putAgent({
		key,
		appId: created.appId,
		name: agent.name,
		...creds,
		simulated: config.mockMode,
		deployedAt: new Date().toISOString(),
	});

	const connected = await connect(key, emit);
	emit({
		type: 'done',
		message: connected ? `${agent.name} is live in Slack.` : `${agent.name} is installed but not connected. See the step above.`,
	});
}

async function connect(key: AgentKey, emit: Emit): Promise<boolean> {
	const record = store.getAgent(key);
	if (!record) {
		return false;
	}
	const via = config.transport === 'socket' ? 'Socket Mode' : `HTTP /slack/events/${key}`;
	try {
		await runtime.startAgent(key, record);
		emit({ type: 'local', title: 'Agent connected', detail: `${record.name} (${record.appId}) via ${via}`, ok: true });
		return true;
	} catch (error) {
		emit({ type: 'local', title: 'Agent not connected', detail: (error as Error).message, ok: false });
		return false;
	}
}

export async function renameAgent(key: AgentKey, name: string, emit: Emit) {
	const record = store.getAgent(key);
	if (!record) {
		throw new Error(`${catalog[key].name} is not deployed.`);
	}
	const manifest = childManifest(catalog[key], name);
	await slack.updateManifest(record.appId, manifest, callOptions('config-capable', recorder(key, emit)));
	store.putAgent({ ...record, name });
	emit({ type: 'done', message: `Renamed to ${name}.` });
}

export async function deleteAgent(key: AgentKey, emit: Emit) {
	const record = store.getAgent(key);
	if (!record) {
		throw new Error(`${catalog[key].name} is not deployed.`);
	}
	// Never delete a pre-made app for real: in mock mode this call is always simulated.
	const opts = config.mockMode
		? { token: '', simulate: true, onCall: recorder(key, emit) }
		: callOptions('user', recorder(key, emit));
	await slack.deleteApp(record.appId, opts);

	if (config.mockMode) {
		// Slack would send this event to the manager app. Simulate it so the demo shows the full lifecycle.
		emit({ type: 'local', title: 'Event: managed_app_deleted (simulated)', detail: `app_id ${record.appId}`, ok: true });
		await handleManagedAppDeleted(record.appId, emit);
	} else {
		emit({ type: 'local', title: 'Waiting for managed_app_deleted', detail: 'Slack sends this event to PawsOps.', ok: true });
	}
	emit({ type: 'done', message: `${record.name} was removed from Slack.` });
}

/** Cleans up local state when Slack reports a managed app is gone, whether PawsOps or an admin removed it. */
export async function handleManagedAppDeleted(appId: string, emit: Emit = () => {}) {
	const record = store.findAgentByAppId(appId);
	if (!record) {
		return;
	}
	await runtime.stopAgent(record.key);
	store.removeAgent(record.key);
	emit({ type: 'local', title: 'Agent disconnected', detail: `${record.name} stopped and removed from PawsOps.`, ok: true });
}

/** Reconnects agents that were deployed before a restart. */
export async function restoreAgents() {
	for (const record of store.listAgents()) {
		await connect(record.key, ({ type, ...step }) => console.log(`[restore] ${type}`, step));
	}
}
