const agentsEl = document.getElementById('agents');
const logEl = document.getElementById('log');
const badgesEl = document.getElementById('badges');
const template = document.getElementById('agent-card');

let busy = false;

async function getState() {
	const res = await fetch('/api/state');
	return res.json();
}

function badge(text, tone = '') {
	const el = document.createElement('span');
	el.className = `badge ${tone}`;
	el.textContent = text;
	return el;
}

function button(label, className, onClick) {
	const el = document.createElement('button');
	el.type = 'button';
	el.className = className;
	el.textContent = label;
	el.disabled = busy;
	el.addEventListener('click', onClick);
	return el;
}

function renderBadges(state) {
	badgesEl.replaceChildren(
		badge(state.mockMode ? 'Mock mode' : 'Live mode', state.mockMode ? 'warn' : 'ok'),
		badge(state.transport === 'socket' ? 'Socket Mode' : 'HTTP'),
		badge(state.managerConnected ? 'Manager app connected' : 'Manager app offline', state.managerConnected ? 'ok' : ''),
	);
}

function renderAgents(state) {
	agentsEl.replaceChildren(
		...state.agents.map((agent) => {
			const card = template.content.cloneNode(true);
			card.querySelector('.card__icon').src = `/icons/${agent.key}.png`;
			card.querySelector('.card__name').textContent = agent.deployedName ?? agent.name;
			card.querySelector('.card__desc').textContent = agent.description;

			const meta = card.querySelector('.card__meta');
			meta.append(badge(agent.permissions === 'app_owner' ? 'Restricted: app owner only' : 'Everyone'));
			if (agent.deployed) {
				meta.append(badge(agent.connected ? 'In Slack' : 'Installed, not connected', agent.connected ? 'ok' : 'warn'));
				meta.append(badge(agent.appId, 'mono'));
			} else if (state.mockMode && !agent.premadeReady) {
				meta.append(badge('Pre-made app missing in .env', 'warn'));
			}

			const actions = card.querySelector('.card__actions');
			if (agent.deployed) {
				actions.append(
					button('Rename', 'secondary', () => rename(agent)),
					button('Delete', 'danger', () => remove(agent)),
				);
			} else {
				actions.append(button('Add to Slack', 'slack', () => run(`/api/agents/${agent.key}/deploy`)));
			}
			return card;
		}),
	);
}

function json(value) {
	const pre = document.createElement('pre');
	pre.textContent = JSON.stringify(value, null, 2);
	return pre;
}

function logItem(step) {
	const li = document.createElement('li');
	li.className = `log__item ${step.ok === false || step.type === 'error' ? 'is-error' : ''}`;

	if (step.type === 'call') {
		const details = document.createElement('details');
		const summary = document.createElement('summary');
		const method = document.createElement('code');
		method.textContent = step.method;
		summary.append(step.ok ? '✓ ' : '✗ ', method);
		if (step.simulated) summary.append(badge('simulated', 'warn'));
		if (!step.ok) summary.append(` ${step.response.error}`);
		const req = document.createElement('h4');
		req.textContent = 'Request';
		const res = document.createElement('h4');
		res.textContent = 'Response';
		details.append(summary, req, json(step.request), res, json(step.response));
		li.append(details);
		return li;
	}

	const title = step.title ?? (step.type === 'done' ? 'Done' : 'Error');
	const detail = step.detail ?? step.message;
	li.innerHTML = '<strong></strong> <span></span>';
	li.querySelector('strong').textContent = `${step.ok === false || step.type === 'error' ? '✗' : '•'} ${title}`;
	li.querySelector('span').textContent = detail;
	return li;
}

function renderActivity(state) {
	logEl.replaceChildren(...state.activity.map((entry) => logItem({ type: 'call', ...entry })));
}

async function refresh() {
	const state = await getState();
	renderBadges(state);
	renderAgents(state);
	return state;
}

/** Runs a lifecycle action and prints each streamed step at the top of the log as it arrives. */
async function run(url, body) {
	busy = true;
	await refresh();
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body ?? {}),
	});
	const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += value;
		const lines = buffer.split('\n');
		buffer = lines.pop();
		for (const line of lines.filter(Boolean)) {
			logEl.prepend(logItem(JSON.parse(line)));
		}
	}
	busy = false;
	await refresh();
}

function rename(agent) {
	const name = prompt('New agent name', agent.deployedName ?? agent.name);
	if (name?.trim()) run(`/api/agents/${agent.key}/rename`, { name: name.trim() });
}

function remove(agent) {
	if (confirm(`Delete ${agent.deployedName ?? agent.name} from Slack?`)) run(`/api/agents/${agent.key}/delete`);
}

document.getElementById('reset').addEventListener('click', async () => {
	if (!confirm('Clear PawsOps state and activity? Pre-made Slack apps are not touched.')) return;
	await fetch('/api/activity/clear', { method: 'POST' });
	renderActivity(await refresh());
});

renderActivity(await refresh());
