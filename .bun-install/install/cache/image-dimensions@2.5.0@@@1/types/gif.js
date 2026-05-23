import {getUint16} from '../utilities.js';

const isGif = bytes =>
	bytes[0] === 0x47
	&& bytes[1] === 0x49
	&& bytes[2] === 0x46
	&& bytes[3] === 0x38
	&& (bytes[4] === 0x37 || bytes[4] === 0x39)
	&& bytes[5] === 0x61;

export default function gif(bytes) {
	if (!isGif(bytes)) {
		return;
	}

	const dataView = new DataView(bytes.buffer);

	const width = getUint16(dataView, 6, true);
	const height = getUint16(dataView, 8, true);

	if (width === undefined || height === undefined) {
		return;
	}

	return {
		width,
		height,
		type: 'gif',
	};
}
