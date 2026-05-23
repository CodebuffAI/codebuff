import {getUint32} from '../utilities.js';

const isPng = bytes =>
	bytes[0] === 0x89
	&& bytes[1] === 0x50
	&& bytes[2] === 0x4E
	&& bytes[3] === 0x47
	&& bytes[4] === 0x0D
	&& bytes[5] === 0x0A
	&& bytes[6] === 0x1A
	&& bytes[7] === 0x0A;

// https://iphonedev.wiki/CgBI_file_format
const isAppleMinifiedPng = bytes =>
	bytes[12] === 0x43
	&& bytes[13] === 0x67
	&& bytes[14] === 0x42
	&& bytes[15] === 0x49;

export default function png(bytes) {
	if (!isPng(bytes)) {
		return;
	}

	const dataView = new DataView(bytes.buffer);
	const isAppleMinified = isAppleMinifiedPng(bytes);

	const width = getUint32(dataView, isAppleMinified ? 32 : 16, false);
	const height = getUint32(dataView, isAppleMinified ? 36 : 20, false);

	if (width === undefined || height === undefined) {
		return;
	}

	return {
		width,
		height,
		type: 'png',
	};
}
