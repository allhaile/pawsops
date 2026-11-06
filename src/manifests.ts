import type { AgentDef } from './agents/catalog.js';
import { config, type Transport } from './config.js';

type Manifest = Record<string, unknown>;

function settings(transport: Transport, path: string, botEvents: string[]) {
	const requestUrl = `${config.publicUrl}/slack/events/${path}`;
	if (transport === 'socket') {
		return {
			...(botEvents.length && { event_subscriptions: { bot_events: botEvents } }),
			interactivity: { is_enabled: true },
			socket_mode_enabled: true,
			org_deploy_enabled: false,
			token_rotation_enabled: false,
		};
	}
	return {
		...(botEvents.length && { event_subscriptions: { request_url: requestUrl, bot_events: botEvents } }),
		interactivity: { is_enabled: true, request_url: requestUrl },
		socket_mode_enabled: false,
		org_deploy_enabled: false,
		token_rotation_enabled: false,
	};
}

// Slack requires long_description to be 175 to 4000 characters.
function longDescription(agent: AgentDef) {
	return [
		agent.longDescription,
		agent.description,
		'This agent was built on PawsOps and deployed to Slack as its own app for Paws & Stay, a dog boarding business with three locations. All data in this demo is sample data.',
	].join('\n\n');
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
			long_description: longDescription(agent),
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
 *
 * The app_configurations and managed_apps scopes are only legal as bot/user scopes once Slack enables
 * manager-app support for the workspace. `restricted: false` drops them (and the flagged event) so the
 * app can be created in an unflagged sandbox for mock mode.
 */
export function managerManifest({ restricted = true, transport = config.transport } = {}): Manifest {
	const configScopes = ['app_configurations:read', 'app_configurations:write'];
	const scopes = restricted
		? { bot: [...configScopes, 'chat:write'], user: [...configScopes, 'managed_apps:install'] }
		: { bot: ['chat:write'] };
	// UNVERIFIED: event name from the Add to Slack brief, not yet in public docs.
	const botEvents = restricted ? ['managed_app_deleted'] : [];
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
		oauth_config: { scopes },
		settings: settings(transport, 'manager', botEvents),
	};
}
