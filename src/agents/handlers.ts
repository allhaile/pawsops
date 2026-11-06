import type { App } from '@slack/bolt';
import type { AgentKey } from '../config.js';
import { catalog } from './catalog.js';
import { registerClientUpdates } from './clientUpdates.js';

export function registerAgentHandlers(app: App, key: AgentKey) {
	if (key === 'client-updates') {
		registerClientUpdates(app);
		return;
	}

	// Placeholder for agents without a workflow yet: answer mentions so deploys can be verified in Slack.
	const agent = catalog[key];
	app.event('app_mention', async ({ event, say }) => {
		await say({ text: `:wave: Hi <@${event.user}>, I'm ${agent.name}. ${agent.longDescription}`, thread_ts: event.ts });
	});
}
