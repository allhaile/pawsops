import 'dotenv/config';

export type AgentKey = 'client-updates' | 'overtime-approver' | 'inventory-tracker';

function env(name: string, fallback = ''): string {
	return process.env[name] ?? fallback;
}

function premade(prefix: string) {
	return {
		appId: env(`${prefix}_APP_ID`),
		botToken: env(`${prefix}_BOT_TOKEN`),
		signingSecret: env(`${prefix}_SIGNING_SECRET`),
	};
}

export const config = {
	port: Number(env('PORT', '3000')),
	publicUrl: env('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, ''),
	mockMode: env('MOCK_MODE', 'true') === 'true',
	manager: {
		clientId: env('MANAGER_CLIENT_ID'),
		clientSecret: env('MANAGER_CLIENT_SECRET'),
		signingSecret: env('MANAGER_SIGNING_SECRET'),
		stateSecret: env('STATE_SECRET', 'change-me'),
	},
	premade: {
		'client-updates': premade('CLIENT_UPDATES'),
		'overtime-approver': premade('OVERTIME_APPROVER'),
		'inventory-tracker': premade('INVENTORY_TRACKER'),
	} satisfies Record<AgentKey, ReturnType<typeof premade>>,
	channels: {
		managers: env('MANAGERS_CHANNEL', 'managers'),
		outbox: env('OUTBOX_CHANNEL', 'outbox'),
	},
};
