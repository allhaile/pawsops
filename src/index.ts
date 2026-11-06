import express from 'express';
import { config } from './config.js';
import { restoreAgents } from './manager/deploy.js';
import { managerReceiver, startManagerApp } from './manager/managerApp.js';
import { routes } from './manager/routes.js';
import { httpRouter } from './slack/runtime.js';

const app = express();

app.use(express.static('public'));
app.use('/icons', express.static('assets/icons'));
app.use('/api', routes);

// HTTP transport only. Slack request bodies must stay unparsed so each receiver can verify signatures.
app.post('/slack/events/manager', (req, res, next) => {
	const receiver = managerReceiver();
	return receiver ? receiver.app(req, res, next) : res.sendStatus(404);
});
app.post('/slack/events/:agentKey', httpRouter);

app.get('/health', (_req, res) => {
	res.json({ ok: true, mockMode: config.mockMode, transport: config.transport });
});

app.listen(config.port, async () => {
	console.log(`PawsOps dashboard: http://localhost:${config.port}`);
	console.log(`Mode: ${config.mockMode ? 'mock' : 'real'} · Transport: ${config.transport}`);
	await startManagerApp();
	await restoreAgents();
});
