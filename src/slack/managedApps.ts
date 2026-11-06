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
import { WebClient } from '@slack/web-api';
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
			response = (await new WebClient(token).apiCall(method, args)) as unknown as Record<string, unknown>;
		} catch (error) {
			const data = (error as { data?: Record<string, unknown> }).data;
			response = data ?? { ok: false, error: (error as Error).message };
		}
	}

	const result: CallResult = { method, simulated: simulate, ok: response.ok === true, request: logged, response };
	onCall?.(result);
	if (!result.ok) {
		throw new SlackCallError(result);
	}
	return result;
}

function redactCredentials(response: Record<string, unknown>) {
	const credentials = response.credentials as Record<string, string> | undefined;
	if (!credentials) {
		return response;
	}
	const redacted = Object.fromEntries(Object.keys(credentials).map((key) => [key, '•••']));
	return { ...response, credentials: redacted };
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
		{ ...opts, onCall: (r) => opts.onCall?.({ ...r, response: redactCredentials(r.response) }) },
	);
	const credentials = (result.response.credentials ?? {}) as Record<string, string>;
	return {
		appId: String(result.response.app_id),
		signingSecret: credentials.signing_secret ?? '',
		// UNVERIFIED: whether manifest.create returns an app-level token when socket_mode_enabled is true.
		appToken: String(result.response.app_level_token ?? ''),
	};
}

export async function setIcon(appId: string, iconPath: string, opts: CallOptions) {
	const file = opts.simulate ? undefined : fs.createReadStream(iconPath);
	await call('apps.icon.set', { app_id: appId, file }, { app_id: appId, file: path.basename(iconPath) }, {}, opts);
}

export async function setPermissions(appId: string, permissions: Permissions, opts: CallOptions) {
	const args = { app_id: appId, permissions };
	await call('apps.managed.permissions.set', args, args, { permissions }, opts);
}

/** UNVERIFIED: method name from the Add to Slack brief; arguments and response are guesses. */
export async function managedInstall(appId: string, opts: CallOptions) {
	const args = { app_id: appId };
	const result = await call('apps.managedInstall', args, args, { app_id: appId, bot_token: '•••' }, {
		...opts,
		onCall: (r) => opts.onCall?.({ ...r, response: { ...r.response, ...(r.response.bot_token ? { bot_token: '•••' } : {}) } }),
	});
	return { botToken: String(result.response.bot_token ?? '') };
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
