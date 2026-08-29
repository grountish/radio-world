import { describe, expect, it } from 'vitest';
import {
	extractTrackMetadataFromCueValue,
	extractTrackMetadataFromIcyMetadata,
	extractTrackMetadataFromId3
} from './stream-metadata';

function encodeSynchsafe(size: number) {
	return [(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f];
}

function buildTextFrame(id: string, value: string) {
	const text = new TextEncoder().encode(value);
	const payload = new Uint8Array([3, ...text]);
	const size = payload.length;
	return new Uint8Array([
		...new TextEncoder().encode(id),
		(size >> 24) & 0xff,
		(size >> 16) & 0xff,
		(size >> 8) & 0xff,
		size & 0xff,
		0,
		0,
		...payload
	]);
}

function buildId3Tag(frames: Uint8Array[]) {
	const body = new Uint8Array(frames.reduce((sum, frame) => sum + frame.length, 0));
	let offset = 0;
	for (const frame of frames) {
		body.set(frame, offset);
		offset += frame.length;
	}

	return new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, ...encodeSynchsafe(body.length), ...body]);
}

describe('stream metadata helpers', () => {
	it('extracts artist and title from ID3 text frames', () => {
		const tag = buildId3Tag([
			buildTextFrame('TPE1', 'Nina Simone'),
			buildTextFrame('TIT2', 'Sinnerman')
		]);
		expect(extractTrackMetadataFromId3(tag)).toEqual({
			artist: 'Nina Simone',
			title: 'Sinnerman'
		});
	});

	it('extracts artist and title from cue frame objects', () => {
		expect(
			extractTrackMetadataFromCueValue([
				{ id: 'TPE1', value: 'Theo Parrish' },
				{ id: 'TIT2', value: 'Soul Control' }
			])
		).toEqual({
			artist: 'Theo Parrish',
			title: 'Soul Control'
		});
	});

	it('extracts and splits ICY StreamTitle metadata', () => {
		expect(
			extractTrackMetadataFromIcyMetadata("StreamTitle='DJ Shadow - Midnight In A Perfect World';")
		).toEqual({
			artist: 'DJ Shadow',
			title: 'Midnight In A Perfect World'
		});
	});

	it('repairs mojibake when UTF-8 track metadata was decoded as latin1', () => {
		expect(
			extractTrackMetadataFromIcyMetadata(
				"StreamTitle='Eiichi Ohtaki - é›¨ã®ã‚¦ã‚§ãƒ³ã‚ºãƒ‡ã‚¤ - Ameno Wednesday';"
			)
		).toEqual({
			artist: 'Eiichi Ohtaki',
			title: '雨のウェンズデイ - Ameno Wednesday'
		});
	});
});
