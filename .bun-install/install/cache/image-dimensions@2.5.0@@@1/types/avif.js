import {getIsobmffFtypBrands, getIsobmffIspeSizesFromMeta, getLargestAreaSize} from '../utilities.js';

// Specification: https://aomediacodec.github.io/av1-avif/v1.1.0.html

// AVIF brands: image/collection ('avif'), sequence ('avis'), intra-only ('avio')
const avifBrands = new Set([
	'avif',
	'avis',
	'avio',
]);

const isAvif = bytes => {
	const brands = getIsobmffFtypBrands(bytes);
	if (!brands) {
		return false;
	}

	return brands.some(brand => avifBrands.has(brand));
};

export default function avif(bytes) {
	if (!isAvif(bytes)) {
		return;
	}

	const sizes = getIsobmffIspeSizesFromMeta(bytes);

	if (sizes.length === 0) {
		return;
	}

	return {
		...getLargestAreaSize(sizes),
		type: 'avif',
	};
}
