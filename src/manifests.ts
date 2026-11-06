import type { AgentDef } from './agents/catalog.js';
import { config, type Transport } from './config.js';

type Manifest = Record<string, unknown>;

function settings(transport: Transport, path: string, botEvents: string[]) {
	const requestUrl = `${config.publicUrl}/slack/events/${path}`;
	if (transport === 'socket') {
		return {
			event_subscriptions: { bot_events: botEvents },
			interactivity: { is_enabled: true },
			socket_mode_enabled: true,
			org_deploy_enabled: false,
			token_rotation_enabled: false,
		};
	}
	return {
		event_subscriptions: { request_url: requestUrl, bot_events: botEvents },
		interactivity: { is_enabled: true, request_url: requestUrl },
		socket_mode_enabled: false,
		org_deploy_enabled: false,
		token_rotation_enabled: false,
	};
}

/**
 * Manifest for one agent's dedicated Slack app.
 * In HTTP transport the request URL is keyed by agent so the router can find the right signing secret.
 */
export function childManifest(agent: AgentDef, name = agent.name, transport = config.transport): Manifest {
	const requestUrl = `${config.publicUrl}/slack/events/${agent.key}`;
	return {
		display_information: {
			name,
			description: agent.description,
			long_description: `${agent.longDescription} Built and deployed with PawsOps for Paws & Stay.`,
			background_color: agent.color,
		},
		features: {
			app_home: { home_tab_enabled: false, messages_tab_enabled: true, messages_tab_read_only_enabled: false },
			bot_user: { display_name: name, always_online: true },
			...(agent.slashCommands.length && {
				slash_commands: agent.slashCommands.map((cmd) => ({
					...cmd,
					should_escape: false,
					...(transport === 'http' && { url: requestUrl }),
				})),
			}),
		},
		oauth_config: { scopes: { bot: agent.botScopes } },
		settings: settings(transport, agent.key, agent.botEvents),
	};
}

/**
 * Manifest for the PawsOps manager app.
 * `restricted: false` drops the flagged scope and event so it validates in a workspace without the feature flag.
 */
export function managerManifest({ restricted = true, transport = config.transport } = {}): Manifest {
	const userScopes = ['app_configurations:read', 'app_configurations:write'];
	const botEvents: string[] = [];
	if (restricted) {
		userScopes.push('managed_apps:install');
		// UNVERIFIED: event name from the Add to Slack brief, not yet in public docs.
		botEvents.push('managed_app_deleted');
	}
	return {
		display_information: {
			name: 'PawsOps',
			description: 'Build employee agents and deploy each one to Slack in one click.',
			background_color: '#4A154B',
		},
		features: {
			app_home: { home_tab_enabled: false, messages_tab_enabled: false, messages_tab_read_only_enabled: true },
			bot_user: { display_name: 'PawsOps', always_online: true },
		},
		oauth_config: {
			scopes: {
				bot: ['app_configurations:read', 'app_configurations:write', 'chat:write'],
				user: userScopes,
			},
		},
		settings: settings(transport, 'manager', botEvents),
	};
}
