/**
 * Writes every manifest to manifests/ so apps can be created by hand
 * (api.slack.com/apps → Create New App → From a manifest).
 */
import fs from 'node:fs';
import { agentKeys, catalog } from '../src/agents/catalog.js';
import { childManifest, managerManifest } from '../src/manifests.js';

const files: Record<string, unknown> = {
	'pawsops-manager.json': managerManifest({ restricted: true }),
	'pawsops-manager.unflagged.json': managerManifest({ restricted: false }),
	...Object.fromEntries(agentKeys.map((key) => [`${key}.json`, childManifest(catalog[key])])),
};

fs.mkdirSync('manifests', { recursive: true });
for (const [name, manifest] of Object.entries(files)) {
	fs.writeFileSync(`manifests/${name}`, `${JSON.stringify(manifest, null, '\t')}\n`);
	console.log(`manifests/${name}`);
}
