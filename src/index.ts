import express from 'express';
import { config } from './config.js';

const app = express();

app.use(express.static('public'));

app.get('/health', (_req, res) => {
	res.json({ ok: true, mockMode: config.mockMode });
});

app.listen(config.port, () => {
	console.log(`PawsOps listening on http://localhost:${config.port} (mock mode: ${config.mockMode ? 'on' : 'off'})`);
});
