/**
 * Client Updates agent.
 *
 * Staff post a photo, mention the agent ("send Max's owner an update, he loved the pool"),
 * and get back a drafted owner email. Nothing is sent until someone clicks Approve & send.
 * Sending is mocked: the email is appended to data/outbox.log and posted to #outbox.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { App, types, webApi } from '@slack/bolt';
import { config } from '../config.js';

interface Dog {
	name: string;
	breed: string;
	location: string;
	owner: { name: string; email: string };
	checkOut: string;
	today: { activities: string[]; meals: string; notes: string };
}

interface Draft {
	id: string;
	dog: string;
	to: string;
	ownerName: string;
	location: string;
	subject: string;
	body: string;
	photoId?: string;
	photoName?: string;
	requestedBy: string;
	channel: string;
	messageTs?: string;
	status: 'draft' | 'sent' | 'discarded';
}

interface SlackFile {
	id: string;
	name?: string;
	mimetype?: string;
}

const ROSTER_FILE = path.resolve('data/roster.json');
const DRAFTS_FILE = path.resolve('data/drafts.json');
const OUTBOX_FILE = path.resolve('data/outbox.log');

function loadRoster(): Dog[] {
	return (JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8')) as { dogs: Dog[] }).dogs;
}

// Drafts are persisted so Approve still works after the dev server reloads.
function loadDrafts(): Record<string, Draft> {
	try {
		return JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8')) as Record<string, Draft>;
	} catch {
		return {};
	}
}

const drafts = loadDrafts();

function saveDraft(draft: Draft) {
	drafts[draft.id] = draft;
	fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, '\t'));
}

function findDog(text: string, roster: Dog[]) {
	return roster.find((dog) => new RegExp(`\\b${dog.name}\\b`, 'i').test(text));
}

/** Anything after "update" becomes the staff note, e.g. "...an update, he loved the pool today". */
function staffNote(text: string) {
	const match = text.match(/\bupdate\b[\s,:;.!-]*(.*)$/is);
	const note = match?.[1]?.trim() ?? '';
	return note ? note.charAt(0).toUpperCase() + note.slice(1).replace(/[.!]*$/, '.') : '';
}

function joinList(items: string[]) {
	return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '');
}

function draftEmail(dog: Dog, note: string, staffName: string, hasPhoto: boolean) {
	const ownerFirst = dog.owner.name.split(' ')[0];
	// "Location 1 · Riverside" reads as "Paws & Stay Riverside" in the email.
	const site = dog.location.split(' · ').at(-1);
	const lines = [
		`Hi ${ownerFirst},`,
		'',
		`A quick update on ${dog.name} from Paws & Stay ${site}!`,
		...(note ? ['', note] : []),
		'',
		`Today ${dog.name} ${joinList(dog.today.activities)}. ${dog.today.meals} ${dog.today.notes}`,
		'',
		`${hasPhoto ? `We've attached a photo from today. ` : ''}We'll see you at pickup on ${dog.checkOut}.`,
		'',
		'Warmly,',
		staffName,
		`Paws & Stay ${site}`,
	];
	return {
		subject: `${dog.name}'s day at Paws & Stay`,
		body: lines.filter((line, i) => line !== '' || lines[i - 1] !== '').join('\n'),
	};
}

function quote(text: string) {
	return text
		.split('\n')
		.map((line) => `>${line}`)
		.join('\n');
}

function draftBlocks(draft: Draft, footer?: string): types.KnownBlock[] {
	const blocks: types.KnownBlock[] = [
		{
			type: 'section',
			text: { type: 'mrkdwn', text: `*Draft update for ${draft.ownerName}* (${draft.dog}'s owner)` },
		},
		{
			type: 'context',
			elements: [{ type: 'mrkdwn', text: `To: ${draft.to} · ${draft.location} · Requested by <@${draft.requestedBy}>` }],
		},
	];
	if (draft.photoId) {
		blocks.push({ type: 'image', slack_file: { id: draft.photoId }, alt_text: `Photo of ${draft.dog}` });
	}
	blocks.push(
		{ type: 'section', text: { type: 'mrkdwn', text: `*Subject:* ${draft.subject}` } },
		{ type: 'section', text: { type: 'mrkdwn', text: quote(draft.body) } },
	);

	if (draft.status === 'draft') {
		blocks.push(
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						style: 'primary',
						text: { type: 'plain_text', text: 'Approve & send' },
						action_id: 'client_updates_approve',
						value: draft.id,
					},
					{ type: 'button', text: { type: 'plain_text', text: 'Edit' }, action_id: 'client_updates_edit', value: draft.id },
					{
						type: 'button',
						style: 'danger',
						text: { type: 'plain_text', text: 'Discard' },
						action_id: 'client_updates_discard',
						value: draft.id,
					},
				],
			},
			{
				type: 'context',
				elements: [{ type: 'mrkdwn', text: ':lock: Nothing is sent until a staff member approves.' }],
			},
		);
	}
	if (footer) {
		blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: footer }] });
	}
	return blocks;
}

async function staffDisplayName(client: webApi.WebClient, userId: string) {
	try {
		const { user } = await client.users.info({ user: userId });
		return user?.profile?.first_name || user?.real_name || 'The Paws & Stay team';
	} catch {
		return 'The Paws & Stay team';
	}
}

/** Posts the draft, falling back to a text-only preview if the photo can't be shown in an image block. */
async function postDraft(client: webApi.WebClient, draft: Draft, threadTs: string) {
	const text = `Draft update for ${draft.ownerName}`;
	try {
		return await client.chat.postMessage({ channel: draft.channel, thread_ts: threadTs, text, blocks: draftBlocks(draft) });
	} catch (error) {
		if (!draft.photoId) throw error;
		console.warn('[client-updates] image block failed, posting without photo preview:', (error as Error).message);
		const withoutPreview = { ...draft, photoId: undefined };
		return client.chat.postMessage({ channel: draft.channel, thread_ts: threadTs, text, blocks: draftBlocks(withoutPreview) });
	}
}

async function updateDraftMessage(client: webApi.WebClient, draft: Draft, footer?: string) {
	if (!draft.messageTs) return;
	const blocks = draftBlocks(draft, footer);
	try {
		await client.chat.update({ channel: draft.channel, ts: draft.messageTs, text: `Update for ${draft.ownerName}`, blocks });
	} catch {
		const withoutPreview = draftBlocks({ ...draft, photoId: undefined }, footer);
		await client.chat.update({ channel: draft.channel, ts: draft.messageTs, text: `Update for ${draft.ownerName}`, blocks: withoutPreview });
	}
}

/** Mock email delivery: log to a file and the console, then post a copy to #outbox if the agent is in it. */
async function sendEmail(client: webApi.WebClient, draft: Draft, approvedBy: string) {
	const sentAt = new Date().toISOString();
	const email = [
		`--- ${sentAt} ---`,
		`To: ${draft.ownerName} <${draft.to}>`,
		`Subject: ${draft.subject}`,
		...(draft.photoName ? [`Attachment: ${draft.photoName}`] : []),
		`Approved by: ${approvedBy}`,
		'',
		draft.body,
		'',
	].join('\n');
	fs.appendFileSync(OUTBOX_FILE, `${email}\n`);
	console.log(`[client-updates] mock email sent\n${email}`);

	try {
		await client.chat.postMessage({
			channel: config.channels.outbox,
			text: `Email sent to ${draft.to}`,
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `:email: *Sent to ${draft.ownerName}* <mailto:${draft.to}|${draft.to}>\n*Subject:* ${draft.subject}${draft.photoName ? `\n:paperclip: ${draft.photoName}` : ''}`,
					},
				},
				{ type: 'section', text: { type: 'mrkdwn', text: quote(draft.body) } },
				{ type: 'context', elements: [{ type: 'mrkdwn', text: `Approved by <@${approvedBy}> · mock delivery, no email left Slack` }] },
			],
		});
		return true;
	} catch (error) {
		console.warn(`[client-updates] could not post to #${config.channels.outbox}:`, (error as Error).message);
		return false;
	}
}

async function handleRequest(client: webApi.WebClient, args: { text: string; user: string; channel: string; ts: string; files?: SlackFile[] }) {
	const roster = loadRoster();
	const dog = findDog(args.text, roster);
	if (!dog) {
		await client.chat.postMessage({
			channel: args.channel,
			thread_ts: args.ts,
			text: `Which dog is this for? I know ${joinList(roster.map((d) => `*${d.name}*`))}. Try "send Max's owner an update".`,
		});
		return;
	}

	const photo = args.files?.find((file) => file.mimetype?.startsWith('image/'));
	const staffName = await staffDisplayName(client, args.user);
	const { subject, body } = draftEmail(dog, staffNote(args.text), staffName, Boolean(photo));
	const draft: Draft = {
		id: `${args.channel}-${args.ts}`,
		dog: dog.name,
		to: dog.owner.email,
		ownerName: dog.owner.name,
		location: dog.location,
		subject,
		body,
		photoId: photo?.id,
		photoName: photo?.name,
		requestedBy: args.user,
		channel: args.channel,
		status: 'draft',
	};

	const posted = await postDraft(client, draft, args.ts);
	saveDraft({ ...draft, messageTs: posted.ts });
}

function mentionText(text: string) {
	return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

export function registerClientUpdates(app: App) {
	app.event('app_mention', async ({ event, client }) => {
		const files = (event as { files?: SlackFile[] }).files;
		if (!files) {
			console.log('[client-updates] app_mention arrived without files; keys:', Object.keys(event).join(', '));
		}
		await handleRequest(client, { text: mentionText(event.text), user: event.user ?? '', channel: event.channel, ts: event.ts, files });
	});

	// DMs: same flow, no mention needed.
	app.message(async ({ message, client }) => {
		if (message.channel_type !== 'im' || ('bot_id' in message && message.bot_id)) return;
		if (message.subtype && message.subtype !== 'file_share') return;
		const msg = message as { text?: string; user: string; channel: string; ts: string; files?: SlackFile[] };
		await handleRequest(client, { text: msg.text ?? '', user: msg.user, channel: msg.channel, ts: msg.ts, files: msg.files });
	});

	app.action('client_updates_approve', async ({ ack, body, action, client }) => {
		await ack();
		const draft = drafts[(action as { value: string }).value];
		if (!draft || draft.status !== 'draft') return;
		const sent = { ...draft, status: 'sent' as const };
		saveDraft(sent);
		const posted = await sendEmail(client, sent, body.user.id);
		const where = posted ? ` · copy in #${config.channels.outbox}` : '';
		await updateDraftMessage(client, sent, `:white_check_mark: Sent to ${sent.to} by <@${body.user.id}> <!date^${Math.floor(Date.now() / 1000)}^at {time}|just now>${where}`);
	});

	app.action('client_updates_discard', async ({ ack, body, action, client }) => {
		await ack();
		const draft = drafts[(action as { value: string }).value];
		if (!draft || draft.status !== 'draft') return;
		const discarded = { ...draft, status: 'discarded' as const };
		saveDraft(discarded);
		await updateDraftMessage(client, discarded, `:wastebasket: Discarded by <@${body.user.id}>. Nothing was sent.`);
	});

	app.action('client_updates_edit', async ({ ack, body, action, client }) => {
		await ack();
		const draft = drafts[(action as { value: string }).value];
		if (!draft || draft.status !== 'draft' || !('trigger_id' in body)) return;
		await client.views.open({
			trigger_id: body.trigger_id,
			view: {
				type: 'modal',
				callback_id: 'client_updates_edit_submit',
				private_metadata: draft.id,
				title: { type: 'plain_text', text: 'Edit owner update' },
				submit: { type: 'plain_text', text: 'Save draft' },
				close: { type: 'plain_text', text: 'Cancel' },
				blocks: [
					{
						type: 'input',
						block_id: 'subject',
						label: { type: 'plain_text', text: 'Subject' },
						element: { type: 'plain_text_input', action_id: 'value', initial_value: draft.subject },
					},
					{
						type: 'input',
						block_id: 'body',
						label: { type: 'plain_text', text: `Email to ${draft.ownerName}` },
						element: { type: 'plain_text_input', action_id: 'value', multiline: true, initial_value: draft.body },
					},
				],
			},
		});
	});

	app.view('client_updates_edit_submit', async ({ ack, view, client }) => {
		await ack();
		const draft = drafts[view.private_metadata];
		if (!draft || draft.status !== 'draft') return;
		const values = view.state.values;
		const edited = {
			...draft,
			subject: values.subject.value.value ?? draft.subject,
			body: values.body.value.value ?? draft.body,
		};
		saveDraft(edited);
		await updateDraftMessage(client, edited);
	});
}
