/**
 * Generates 512x512 paw-print PNG icons (the minimum size apps.icon.set accepts).
 * Pure Node, no image libraries: draws shapes with 4x supersampling and encodes the PNG by hand.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { catalog } from '../src/agents/catalog.js';

const SIZE = 512;
const SAMPLES = 4;

type Shape = (x: number, y: number) => boolean;

const ellipse =
	(cx: number, cy: number, rx: number, ry: number): Shape =>
	(x, y) =>
		((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

const roundedSquare = (r: number): Shape => (x, y) => {
	const dx = Math.max(r - x, 0, x - (SIZE - r));
	const dy = Math.max(r - y, 0, y - (SIZE - r));
	return dx * dx + dy * dy <= r * r;
};

const paw: Shape[] = [
	ellipse(256, 320, 105, 88),
	ellipse(140, 210, 38, 50),
	ellipse(210, 148, 38, 52),
	ellipse(302, 148, 38, 52),
	ellipse(372, 210, 38, 50),
];
const background = roundedSquare(110);

function hex(color: string): [number, number, number] {
	const n = parseInt(color.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function coverage(shape: (x: number, y: number) => boolean, px: number, py: number) {
	let hits = 0;
	for (let i = 0; i < SAMPLES; i++) {
		for (let j = 0; j < SAMPLES; j++) {
			if (shape(px + (i + 0.5) / SAMPLES, py + (j + 0.5) / SAMPLES)) hits++;
		}
	}
	return hits / (SAMPLES * SAMPLES);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(buf: Buffer) {
	let c = 0xffffffff;
	for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function render(color: string) {
	const [r, g, b] = hex(color);
	const isPaw = (x: number, y: number) => paw.some((shape) => shape(x, y));
	const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
	for (let y = 0; y < SIZE; y++) {
		const row = y * (SIZE * 4 + 1);
		raw[row] = 0;
		for (let x = 0; x < SIZE; x++) {
			const bg = coverage(background, x, y);
			const fg = coverage(isPaw, x, y);
			const i = row + 1 + x * 4;
			raw[i] = Math.round(r + (255 - r) * fg);
			raw[i + 1] = Math.round(g + (255 - g) * fg);
			raw[i + 2] = Math.round(b + (255 - b) * fg);
			raw[i + 3] = Math.round(255 * bg);
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(SIZE, 0);
	header.writeUInt32BE(SIZE, 4);
	header.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', zlib.deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

const icons: Record<string, string> = {
	'pawsops-manager': '#4A154B',
	...Object.fromEntries(Object.values(catalog).map((agent) => [agent.key, agent.color])),
};

fs.mkdirSync('assets/icons', { recursive: true });
for (const [name, color] of Object.entries(icons)) {
	fs.writeFileSync(`assets/icons/${name}.png`, render(color));
	console.log(`assets/icons/${name}.png`);
}
