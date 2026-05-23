export function isValidOffsetToRead(dataView, offset, bytesToRead) {
	return dataView.byteLength >= offset + bytesToRead;
}

export function getUint32(dataView, offset, littleEndian = false) {
	if (isValidOffsetToRead(dataView, offset, 4)) {
		return dataView.getUint32(offset, littleEndian);
	}
}

export function getUint16(dataView, offset, littleEndian = false) {
	if (isValidOffsetToRead(dataView, offset, 2)) {
		return dataView.getUint16(offset, littleEndian);
	}
}

/*
Parse the FileTypeBox (ftyp) at the start of an ISOBMFF container and return an array of 4CC brand strings (major brand first, followed by compatible brands).

Applicable to ISOBMFF-based image formats like HEIF/HEIC and AVIF. Not applicable to PNG, JPEG, GIF, or WebP.
*/
export function getIsobmffFtypBrands(bytes) {
	// Minimum size: 4 (size) + 4 ('ftyp') + 4 (major_brand) + 4 (minor_version)
	if (bytes.length < 16) {
		return;
	}

	// Validate 'ftyp' marker at offset 4
	const isFtyp = bytes[4] === 0x66
		&& bytes[5] === 0x74
		&& bytes[6] === 0x79
		&& bytes[7] === 0x70;

	if (!isFtyp) {
		return;
	}

	// Box size (Big-endian) at offset 0
	const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const size = getUint32(dataView, 0);
	if (size === undefined || size < 16 || size > bytes.length) {
		return;
	}

	const brands = [];
	// Major brand
	brands.push(String.fromCodePoint(...bytes.slice(8, 12)));
	// Compatible brands start at offset 16
	for (let i = 16; i + 4 <= size; i += 4) {
		brands.push(String.fromCodePoint(...bytes.slice(i, i + 4)));
	}

	return brands;
}

/*
Read a generic ISOBMFF box at the given offset.

Returns an object with {type, data, tail} or undefined if invalid.

Applicable to ISOBMFF-based image formats like HEIF/HEIC and AVIF.
*/
export function unboxIsobmffBox(data, offset) {
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const size = getUint32(dataView, offset);

	if (size === undefined) {
		return;
	}

	// Size includes the first 4 bytes (length)
	if (data.length < size + offset || size < 8) {
		return;
	}

	return {
		type: String.fromCodePoint(...data.slice(offset + 4, offset + 8)),
		data: data.slice(offset + 8, offset + size),
		tail: offset + size,
	};
}

/*
Traverse ISOBMFF boxes to collect image spatial extents from `ispe` properties under the `meta` → `iprp` → `ipco` hierarchy.

Applicable to HEIF/HEIC and AVIF; codec-agnostic within ISOBMFF.
*/
export function getIsobmffIspeSizesFromMeta(data) {
	const sizes = [];
	let offset = 0;

	while (offset < data.length) {
		const box = unboxIsobmffBox(data, offset);

		if (!box) {
			break;
		}

		if (box.type === 'meta') {
			parseIsobmffMetaBox(box.data, sizes);
		}

		offset = box.tail;
	}

	return sizes;
}

// Parses `meta` box
function parseIsobmffMetaBox(data, sizes) {
	// Skip version (1 byte) and flags (3 bytes).
	let offset = 4; // Version + flags

	while (offset < data.length) {
		const box = unboxIsobmffBox(data, offset);

		if (!box) {
			break;
		}

		if (box.type === 'iprp') {
			parseIsobmffIprpBox(box.data, sizes);
		}

		offset = box.tail;
	}

	return sizes;
}

// Parses `meta.iprp` box (Item Properties)
function parseIsobmffIprpBox(data, sizes) {
	let offset = 0;

	while (offset < data.length) {
		const box = unboxIsobmffBox(data, offset);

		if (!box) {
			break;
		}

		if (box.type === 'ipco') {
			parseIsobmffIpcoBox(box.data, sizes);
		}

		offset = box.tail;
	}
}

// Parses `meta.iprp.ipco` box (Item Property Container)
function parseIsobmffIpcoBox(data, sizes) {
	let offset = 0;

	while (offset < data.length) {
		const box = unboxIsobmffBox(data, offset);

		if (!box) {
			break;
		}

		// Image Spatial Extent
		if (box.type === 'ispe') {
			const dataView = new DataView(box.data.buffer, box.data.byteOffset, box.data.byteLength);
			const width = getUint32(dataView, 4);
			const height = getUint32(dataView, 8);

			if (width === undefined || height === undefined) {
				return;
			}

			sizes.push({
				width,
				height,
			});
		}

		offset = box.tail;
	}
}

/*
Return the size with the largest area from a list of {width, height}.

Generic helper used by HEIF/HEIC and AVIF readers.
*/
export function getLargestAreaSize(sizes) {
	let maxSize = sizes[0];

	for (const size of sizes) {
		if (size.width * size.height > maxSize.width * maxSize.height) {
			maxSize = size;
		}
	}

	return maxSize;
}
