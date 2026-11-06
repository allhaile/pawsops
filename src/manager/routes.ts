import express, { type Response } from 'express';
import { agentKeys, catalog, isAgentKey } from '../agents/catalog.js';
import { config, type AgentKey } from '../config.js';
import * as runtime from '../slack/runtime.js';
import * as store from '../store/store.js';
import { deleteAgent, deployAgent, renameAgent, type Emit } from './deploy.js';
import { managerConnected } from './managerApp.js';
import { MAX_AGENT_NAME, slackAppName } from '../manifests.js';

const APP_PREFIX_LENGTH = slackAppName('').length;

export const routes = express.Router();
routes.use(express.json());

/** Streams lifecycle steps as newline-delimited JSON so the dashboard can show each call as it happens. */
async function stream(res: Response, run: (emit: Emit) => Promise<void>) {
	res.setHeader('Content-Type', 'application/x-ndjson');
	const emit: Emit = (step) => res.write(`${JSON.stringify(step)}\n`);
	try {
		await run(emit);
	} catch (error) {
		emit({ type: 'error', message: (error as Error).message });
	}
	res.end();
}

function agentKey(raw: string): AgentKey | undefined {
	return isAgentKey(raw) ? raw : undefined;
}

routes.get('/state', (_req, res) => {
	res.json({
		mockMode: config.mockMode,
		transport: config.transport,
		configToken: Boolean(config.configToken),
		managerConnected: managerConnected(),
		agents: agentKeys.map((key) => {
			const record = store.getAgent(key);
			return {
				...catalog[key],
				deployed: record?.stage === 'installed',
				partial: record?.stage === 'created',
				connected: runtime.isRunning(key),
				appId: record?.appId,
				deployedName: record?.name,
				slackName: slackAppName(record?.name ?? catalog[key].name),
				premadeReady: Boolean(config.premade[key].appId),
			};
		}),
		activity: store.listActivity(),
	});
});

routes.post('/agents/:key/deploy', (req, res) => {
	const key = agentKey(req.params.key);
	if (!key) {
		res.sendStatus(404);
		return;
	}
	void stream(res, (emit) => deployAgent(key, emit));
});

routes.post('/agents/:key/rename', (req, res) => {
	const key = agentKey(req.params.key);
	if (!key) {
		res.sendStatus(404);
		return;
	}
	// Users may type the name with or without the PawsOps prefix; store it without.
	const name = slackAppName(String(req.body?.name ?? '').trim()).slice(APP_PREFIX_LENGTH);
	void stream(res, async (emit) => {
		if (!name || name.length > MAX_AGENT_NAME) {
			throw new Error(`Name must be 1 to ${MAX_AGENT_NAME} characters.`);
		}
		await renameAgent(key, name, emit);
	});
});

routes.post('/agents/:key/delete', (req, res) => {
	const key = agentKey(req.params.key);
	if (!key) {
		res.sendStatus(404);
		return;
	}
	void stream(res, (emit) => deleteAgent(key, emit));
});

routes.post('/activity/clear', (_req, res) => {
	for (const key of agentKeys) {
		void runtime.stopAgent(key);
	}
	store.reset();
	res.json({ ok: true });
});
