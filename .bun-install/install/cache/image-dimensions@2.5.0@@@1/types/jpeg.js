import {isValidOffsetToRead, getUint16} from '../utilities.js';

const SOF0 = 0xFF_C0;
const SOF3 = 0xFF_C3;

const jsJpeg = bytes =>
	bytes[0] === 0xFF
	&& bytes[1] === 0xD8
	&& bytes[2] === 0xFF;

export default function jpeg(bytes) {
	if (!jsJpeg(bytes)) {
		return;
	}

	const dataView = new DataView(bytes.buffer);

	let offset = 2; // Start after the SOI marker.

	while (isValidOffsetToRead(dataView, offset, 2)) {
		const marker = dataView.getUint16(offset);
		offset += 2; // Move past the marker.

		if (marker >= SOF0 && marker <= SOF3) {
			const height = getUint16(dataView, offset + 3, false);
			const width = getUint16(dataView, offset + 5, false);

			if (height === undefined || width === undefined) {
				return;
			}

			return {
				height,
				width,
				type: 'jpeg',
			};
		}

		const segmentLength = getUint16(dataView, offset);

		if (segmentLength === undefined) {
			return; // Unexpected EOF when reading segment length.
		}

		offset += segmentLength; // Skip over the segment.

		if (offset > dataView.byteLength) {
			return; // Segment length exceeds byte range.
		}
	}
}
