/**
 * Every managed-app ("Add to Slack") Web API call lives here.
 *
 * Each call can run for real or be simulated. Simulated calls return the documented success shape
 * so the dashboard and demo look identical in both modes.
 *
 * Calls marked UNVERIFIED are not in the public docs yet. Their argument and response shapes are
 * best guesses; update them here when Slack Partnerships shares the spec.
 */
import fs from 'node:fs';
import path from 'node:path';
import { webApi } from '@slack/bolt';
import type { Permissions } from '../agents/catalog.js';

export interface CallResult {
	method: string;
	simulated: boolean;
	ok: boolean;
	request: Record<string, unknown>;
	response: Record<string, unknown>;
}

export class SlackCallError extends Error {
	constructor(public result: CallResult) {
		super(`${result.method} failed: ${String(result.response.error ?? 'unknown_error')}`);
	}
}

export interface CallOptions {
	token: string;
	simulate: boolean;
	onCall?: (result: CallResult) => void;
}

const SIMULATED_LATENCY_MS = 600;

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function call(
	method: string,
	args: Record<string, unknown>,
	logged: Record<string, unknown>,
	simulatedResponse: Record<string, unknown>,
	{ token, simulate, onCall }: CallOptions,
): Promise<CallResult> {
	let response: Record<string, unknown>;
	if (simulate) {
		await delay(SIMULATED_LATENCY_MS);
		response = { ok: true, ...simulatedResponse };
	} else if (!token) {
		response = { ok: false, error: 'not_authed', detail: 'No token configured for this call. Check .env.' };
	} else {
		try {
			response = (await new webApi.WebClient(token).apiCall(method, args)) as unknown as Record<string, unknown>;
		} catch (error) {
			const data = (error as { data?: Record<string, unknown> }).data;
			response = data ?? { ok: false, error: (error as Error).message };
		}
	}

	const result: CallResult = { method, simulated: simulate, ok: response.ok === true, request: logged, response };
	const safe = { ...result, response: redact(response) as Record<string, unknown> };
	onCall?.(safe);
	if (!result.ok) {
		throw new SlackCallError(safe);
	}
	return result;
}

const SECRET_KEYS = new Set(['client_secret', 'signing_secret', 'verification_token']);
const TOKEN_PATTERN = /^(xox[a-z]|xapp)-/;

/** Masks tokens and secrets anywhere in a response before it is logged or sent to the dashboard. */
function redact(value: unknown, key = ''): unknown {
	if (typeof value === 'string') {
		return SECRET_KEYS.has(key) || TOKEN_PATTERN.test(value) ? `${value.slice(0, 5)}•••` : value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => redact(item));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
	}
	return value;
}

export async function createApp(manifest: Record<string, unknown>, simulatedAppId: string, opts: CallOptions) {
	const args = { manifest: JSON.stringify(manifest) };
	const result = await call(
		'apps.manifest.create',
		args,
		{ manifest },
		{
			app_id: simulatedAppId,
			credentials: { client_id: '•••', client_secret: '•••', verification_token: '•••', signing_secret: '•••' },
		},
		opts,
	);
	const credentials = (result.response.credentials ?? {}) as Record<string, string>;
	return {
		appId: String(result.response.app_id),
		signingSecret: credentials.signing_secret ?? '',
	};
}

export async function setIcon(appId: string, iconPath: string, opts: CallOptions) {
	// Send a Buffer: it is reliably encoded as multipart/form-data by every web-api version.
	const file = opts.simulate ? undefined : fs.readFileSync(iconPath);
	await call('apps.icon.set', { app_id: appId, file }, { app_id: appId, file: path.basename(iconPath) }, {}, opts);
}

export async function setPermissions(appId: string, permissions: Permissions, opts: CallOptions) {
	const args = { app_id: appId, permissions };
	await call('apps.managed.permissions.set', args, args, { permissions }, opts);
}

/**
 * Installs a managed app without a per-app OAuth flow. Not yet in the public docs; shape confirmed
 * against a flagged sandbox: the child app's tokens come back under `api_access_tokens`.
 */
export async function managedInstall(appId: string, opts: CallOptions) {
	const args = { app_id: appId };
	const result = await call(
		'apps.managedInstall',
		args,
		args,
		{ app_id: appId, api_access_tokens: { bot_access_token: 'xoxb-simulated', app_level_token: 'xapp-simulated' } },
		opts,
	);
	const tokens = (result.response.api_access_tokens ?? {}) as Record<string, string>;
	return { botToken: tokens.bot_access_token ?? '', appToken: tokens.app_level_token ?? '' };
}

export async function updateManifest(appId: string, manifest: Record<string, unknown>, opts: CallOptions) {
	await call(
		'apps.manifest.update',
		{ app_id: appId, manifest: JSON.stringify(manifest) },
		{ app_id: appId, manifest },
		{ app_id: appId, permissions_updated: false },
		opts,
	);
}

export async function deleteApp(appId: string, opts: CallOptions) {
	const args = { app_id: appId };
	await call('apps.manifest.delete', args, args, {}, opts);
}
