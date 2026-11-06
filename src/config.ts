import 'dotenv/config';

export type AgentKey = 'client-updates' | 'overtime-approver' | 'inventory-tracker';
export type Transport = 'socket' | 'http';

function env(name: string, fallback = ''): string {
	return process.env[name] || fallback;
}

export interface ChildCredentials {
	appId: string;
	botToken: string;
	appToken: string;
	signingSecret: string;
}

function premade(prefix: string): ChildCredentials {
	return {
		appId: env(`${prefix}_APP_ID`),
		botToken: env(`${prefix}_BOT_TOKEN`),
		appToken: env(`${prefix}_APP_TOKEN`),
		signingSecret: env(`${prefix}_SIGNING_SECRET`),
	};
}

export const config = {
	port: Number(env('PORT', '3000')),
	mockMode: env('MOCK_MODE', 'true') === 'true',
	transport: (env('TRANSPORT', 'socket') === 'http' ? 'http' : 'socket') as Transport,
	publicUrl: env('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, ''),
	manager: {
		botToken: env('MANAGER_BOT_TOKEN'),
		userToken: env('MANAGER_USER_TOKEN'),
		appToken: env('MANAGER_APP_TOKEN'),
		signingSecret: env('MANAGER_SIGNING_SECRET'),
	},
	// Optional, mock mode only: an app configuration token from api.slack.com/apps.
	// When set, rename (apps.manifest.update) and apps.icon.set run for real against the pre-made apps.
	configToken: env('SLACK_CONFIG_TOKEN'),
	premade: {
		'client-updates': premade('CLIENT_UPDATES'),
		'overtime-approver': premade('OVERTIME_APPROVER'),
		'inventory-tracker': premade('INVENTORY_TRACKER'),
	} satisfies Record<AgentKey, ChildCredentials>,
	channels: {
		managers: env('MANAGERS_CHANNEL', 'managers'),
		outbox: env('OUTBOX_CHANNEL', 'outbox'),
	},
};
