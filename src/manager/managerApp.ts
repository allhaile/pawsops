/**
 * The PawsOps manager app's own Slack connection. It receives managed_app_deleted when a child app
 * is removed outside PawsOps (for example, by a workspace admin).
 */
import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import { config } from '../config.js';
import { handleManagedAppDeleted } from './deploy.js';

let receiver: ExpressReceiver | undefined;

export function managerConnected() {
	return Boolean(config.manager.botToken && (config.transport === 'http' || config.manager.appToken));
}

export async function startManagerApp() {
	if (!managerConnected()) {
		console.log('Manager app tokens not set: skipping the PawsOps Slack connection.');
		return undefined;
	}

	const socket = config.transport === 'socket';
	if (!socket) {
		receiver = new ExpressReceiver({ signingSecret: config.manager.signingSecret, endpoints: '/slack/events/manager' });
	}
	const app = new App({
		token: config.manager.botToken,
		logLevel: LogLevel.WARN,
		...(socket ? { appToken: config.manager.appToken, socketMode: true } : { receiver }),
	});

	// UNVERIFIED: event payload shape. Assumes the deleted child's ID arrives as `app_id`.
	app.event(/^managed_app_deleted$/, async ({ event }) => {
		const appId = (event as unknown as { app_id?: string }).app_id;
		console.log('managed_app_deleted', event);
		if (appId) {
			await handleManagedAppDeleted(appId);
		}
	});

	if (socket) {
		await app.start();
	}
	console.log('PawsOps manager app connected.');
	return app;
}

export function managerReceiver() {
	return receiver;
}
