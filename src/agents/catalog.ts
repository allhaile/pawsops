import type { AgentKey } from '../config.js';

export type Permissions = 'everyone' | 'app_owner';

export interface SlashCommand {
	command: string;
	description: string;
	usage_hint?: string;
}

export interface AgentDef {
	key: AgentKey;
	name: string;
	description: string;
	longDescription: string;
	color: string;
	permissions: Permissions;
	botScopes: string[];
	botEvents: string[];
	slashCommands: SlashCommand[];
}

export const catalog: Record<AgentKey, AgentDef> = {
	'client-updates': {
		key: 'client-updates',
		name: 'Client Updates',
		description: 'Drafts photo updates for dog owners. Staff approve before anything is sent.',
		longDescription:
			'Mention me with a photo and say "send Max\'s owner an update". I draft the email, you approve it, then I send it.',
		color: '#2E86AB',
		permissions: 'everyone',
		botScopes: ['app_mentions:read', 'chat:write', 'files:read', 'im:history', 'users:read'],
		botEvents: ['app_mention', 'message.im'],
		slashCommands: [],
	},
	'overtime-approver': {
		key: 'overtime-approver',
		name: 'Overtime Approver',
		description: 'Flags employees past 40 hours and asks a manager to approve or deny overtime.',
		longDescription: 'I check ADP hours and post an approval card in #managers when someone passes 40 hours.',
		color: '#C0392B',
		permissions: 'app_owner',
		botScopes: ['app_mentions:read', 'chat:write', 'commands', 'users:read'],
		botEvents: ['app_mention'],
		slashCommands: [{ command: '/overtime-check', description: 'Check ADP hours for overtime' }],
	},
	'inventory-tracker': {
		key: 'inventory-tracker',
		name: 'Inventory Tracker',
		description: 'Answers stock questions per location and alerts on low supplies.',
		longDescription: 'Ask me "how much kibble is left at Location 2?" I also post low-stock alerts with a Reorder button.',
		color: '#27AE60',
		permissions: 'everyone',
		botScopes: ['app_mentions:read', 'chat:write', 'commands', 'im:history'],
		botEvents: ['app_mention', 'message.im'],
		slashCommands: [{ command: '/stock-check', description: 'Check inventory levels', usage_hint: '[location]' }],
	},
};

export const agentKeys = Object.keys(catalog) as AgentKey[];

export function isAgentKey(value: string): value is AgentKey {
	return value in catalog;
}
