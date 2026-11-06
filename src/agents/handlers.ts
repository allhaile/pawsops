import type { App } from '@slack/bolt';
import type { AgentKey } from '../config.js';
import { catalog } from './catalog.js';

/** Placeholder until Phase 3: every agent answers mentions so deploys can be verified in Slack. */
export function registerAgentHandlers(app: App, key: AgentKey) {
	const agent = catalog[key];

	app.event('app_mention', async ({ event, say }) => {
		await say({ text: `:wave: Hi <@${event.user}>, I'm ${agent.name}. ${agent.longDescription}`, thread_ts: event.ts });
	});
}
