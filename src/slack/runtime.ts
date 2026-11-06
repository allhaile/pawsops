/**
 * Runs one Bolt app per deployed agent. Each child app has its own tokens and handlers.
 *
 * Socket Mode: each agent opens its own WebSocket with its app-level token.
 * HTTP: each agent gets an ExpressReceiver verified with its own signing secret, reached via
 * POST /slack/events/:agentKey on the main server.
 */
import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import type { RequestHandler } from 'express';
import { config, type AgentKey } from '../config.js';
import { registerAgentHandlers } from '../agents/handlers.js';

interface RunningAgent {
	app: App;
	receiver?: ExpressReceiver;
}

const running = new Map<AgentKey, RunningAgent>();

export interface RuntimeCredentials {
	botToken: string;
	appToken: string;
	signingSecret: string;
}

export async function startAgent(key: AgentKey, creds: RuntimeCredentials) {
	await stopAgent(key);

	if (config.transport === 'socket') {
		if (!creds.appToken) {
			throw new Error(`No app-level token for ${key}. Socket Mode needs an xapp- token.`);
		}
		const app = new App({ token: creds.botToken, appToken: creds.appToken, socketMode: true, logLevel: LogLevel.WARN });
		registerAgentHandlers(app, key);
		await app.start();
		running.set(key, { app });
		return;
	}

	const receiver = new ExpressReceiver({ signingSecret: creds.signingSecret, endpoints: `/slack/events/${key}` });
	const app = new App({ token: creds.botToken, receiver, logLevel: LogLevel.WARN });
	registerAgentHandlers(app, key);
	running.set(key, { app, receiver });
}

export async function stopAgent(key: AgentKey) {
	const agent = running.get(key);
	if (!agent) {
		return;
	}
	running.delete(key);
	if (config.transport === 'socket') {
		await agent.app.stop();
	}
}

export function isRunning(key: AgentKey) {
	return running.has(key);
}

export function getAgentApp(key: AgentKey) {
	return running.get(key)?.app;
}

/** HTTP transport: hands each request to the receiver for the agent in the URL. */
export const httpRouter: RequestHandler = (req, res, next) => {
	const receiver = running.get(req.params.agentKey as AgentKey)?.receiver;
	if (!receiver) {
		res.sendStatus(404);
		return;
	}
	receiver.app(req, res, next);
};
