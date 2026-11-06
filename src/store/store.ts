import fs from 'node:fs';
import path from 'node:path';
import type { AgentKey } from '../config.js';

const FILE = path.resolve('data/store.json');
const MAX_ACTIVITY = 100;

export interface AgentRecord {
	key: AgentKey;
	appId: string;
	name: string;
	botToken: string;
	appToken: string;
	signingSecret: string;
	simulated: boolean;
	deployedAt: string;
}

export interface ActivityEntry {
	at: string;
	agent: AgentKey | 'manager';
	method: string;
	simulated: boolean;
	ok: boolean;
	request: unknown;
	response: unknown;
}

interface StoreData {
	agents: Partial<Record<AgentKey, AgentRecord>>;
	activity: ActivityEntry[];
}

function load(): StoreData {
	try {
		return JSON.parse(fs.readFileSync(FILE, 'utf8')) as StoreData;
	} catch {
		return { agents: {}, activity: [] };
	}
}

let data = load();

function save() {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	fs.writeFileSync(FILE, JSON.stringify(data, null, '\t'));
}

export function getAgent(key: AgentKey): AgentRecord | undefined {
	return data.agents[key];
}

export function listAgents(): AgentRecord[] {
	return Object.values(data.agents);
}

export function findAgentByAppId(appId: string): AgentRecord | undefined {
	return listAgents().find((agent) => agent.appId === appId);
}

export function putAgent(record: AgentRecord) {
	data.agents[record.key] = record;
	save();
}

export function removeAgent(key: AgentKey) {
	delete data.agents[key];
	save();
}

export function addActivity(entry: ActivityEntry) {
	data.activity = [entry, ...data.activity].slice(0, MAX_ACTIVITY);
	save();
}

export function listActivity(): ActivityEntry[] {
	return data.activity;
}

export function reset() {
	data = { agents: {}, activity: [] };
	save();
}
