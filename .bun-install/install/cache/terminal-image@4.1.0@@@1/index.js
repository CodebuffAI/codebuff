import process from 'node:process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import chalk from 'chalk';
import {Jimp, intToRGBA} from 'jimp';
import termImg from 'term-img';
import renderGif from 'render-gif';
import logUpdate from 'log-update';
import {imageDimensionsFromData} from 'image-dimensions';

// `log-update` adds an extra newline so the generated frames need to be 2 pixels shorter.
const ROW_OFFSET = 2;

const PIXEL = '\u2584';

function scale(width, height, originalWidth, originalHeight) {
	const originalRatio = originalWidth / originalHeight;
	const factor = (width / height > originalRatio ? height / originalHeight : width / originalWidth);
	width = factor * originalWidth;
	height = factor * originalHeight;
	return {width, height};
}

function checkAndGetDimensionValue(value, percentageBase) {
	if (typeof value === 'string' && value.endsWith('%')) {
		const percentageValue = Number.parseFloat(value);
		if (!Number.isNaN(percentageValue) && percentageValue > 0 && percentageValue <= 100) {
			return Math.floor(percentageValue / 100 * percentageBase);
		}
	}

	if (typeof value === 'number') {
		return value;
	}

	throw new Error(`${value} is not a valid dimension value`);
}

function calculateWidthHeight(imageWidth, imageHeight, inputWidth, inputHeight, preserveAspectRatio) {
	const terminalColumns = process.stdout.columns || 80;
	const terminalRows = Math.max(1, (process.stdout.rows || 24) - ROW_OFFSET);

	let width;
	let height;

	if (inputHeight && inputWidth) {
		width = checkAndGetDimensionValue(inputWidth, terminalColumns);
		height = checkAndGetDimensionValue(inputHeight, terminalRows) * 2;

		if (preserveAspectRatio) {
			({width, height} = scale(width, height, imageWidth, imageHeight));
		}
	} else if (inputWidth) {
		width = checkAndGetDimensionValue(inputWidth, terminalColumns);
		height = imageHeight * width / imageWidth;
	} else if (inputHeight) {
		height = checkAndGetDimensionValue(inputHeight, terminalRows) * 2;
		width = imageWidth * height / imageHeight;
	} else {
		({width, height} = scale(terminalColumns, terminalRows * 2, imageWidth, imageHeight));
	}

	if (width > terminalColumns) {
		({width, height} = scale(terminalColumns, terminalRows * 2, width, height));
	}

	width = Math.round(width);
	height = Math.round(height);

	return {width, height};
}

async function render(buffer, {width: inputWidth, height: inputHeight, preserveAspectRatio}) {
	const image = await Jimp.fromBuffer(Buffer.from(buffer)); // eslint-disable-line n/prefer-global/buffer
	const {bitmap} = image;

	const {width, height} = calculateWidthHeight(bitmap.width, bitmap.height, inputWidth, inputHeight, preserveAspectRatio);

	image.resize({w: width, h: height});

	const lines = [];
	for (let y = 0; y < bitmap.height - 1; y += 2) {
		let line = '';
		for (let x = 0; x < bitmap.width; x++) {
			const {r, g, b, a} = intToRGBA(image.getPixelColor(x, y));
			const {r: r2, g: g2, b: b2} = intToRGBA(image.getPixelColor(x, y + 1));
			line += a === 0 ? chalk.reset.rgb(r2, g2, b2)(PIXEL) : chalk.bgRgb(r, g, b).rgb(r2, g2, b2)(PIXEL);
		}

		lines.push(line);
	}

	return lines.join('\n');
}

// Kitty graphics protocol implementation
function drawImageWithKitty(buffer, columns, rows) {
	const base64Data = buffer.toString('base64');
	const chunks = [];

	// Split base64 data into chunks for Kitty protocol (4KB chunks)
	for (let index = 0; index < base64Data.length; index += 4096) {
		chunks.push(base64Data.slice(index, index + 4096));
	}

	// Build control data
	let controlData = 'f=100,a=T'; // PNG format, transmit and display

	// Add sizing parameters if specified
	if (columns !== undefined && columns > 0) {
		controlData += `,c=${Math.round(columns)}`;
	}

	if (rows !== undefined && rows > 0) {
		controlData += `,r=${Math.round(rows)}`;
	}

	// Send image data using Kitty graphics protocol
	for (let index = 0; index < chunks.length; index++) {
		const chunk = chunks[index];
		const isLast = index === chunks.length - 1;

		if (index === 0) {
			// First chunk includes all control data
			process.stdout.write(`\u001B_G${controlData},m=${isLast ? 0 : 1};${chunk}\u001B\\`);
		} else {
			// Subsequent chunks only need the m flag
			process.stdout.write(`\u001B_Gm=${isLast ? 0 : 1};${chunk}\u001B\\`);
		}
	}
}

async function renderKitty(buffer, {width: inputWidth, height: inputHeight, preserveAspectRatio}) {
	// Terminal dimensions with safety margins
	const terminalColumns = (process.stdout.columns || 80) - 2;
	const terminalRows = Math.max(1, (process.stdout.rows || 24) - 4);

	// Calculate display size in terminal cells
	let columns;
	let rows;

	// Handle width
	if (typeof inputWidth === 'string' && inputWidth.endsWith('%')) {
		const percentage = Number.parseFloat(inputWidth) / 100;
		columns = Math.floor(terminalColumns * percentage);
	} else if (typeof inputWidth === 'number') {
		columns = Math.min(inputWidth, terminalColumns);
	} else {
		// Default: use full width if no width specified
		columns = terminalColumns;
	}

	// Handle height
	if (typeof inputHeight === 'string' && inputHeight.endsWith('%')) {
		const percentage = Number.parseFloat(inputHeight) / 100;
		rows = Math.floor(terminalRows * percentage);
	} else if (typeof inputHeight === 'number') {
		rows = Math.min(inputHeight, terminalRows);
	} else if (preserveAspectRatio) {
		// If preserveAspectRatio and no height specified, set max height
		rows = terminalRows;
	} else {
		// Only set full height if not preserving aspect ratio
		rows = terminalRows;
	}

	// For PNG images, we can send the original buffer directly
	let imageBuffer = buffer;

	// Check if the buffer is already PNG format
	const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

	if (!isPng) {
		// Convert to PNG if needed
		const image = await Jimp.fromBuffer(Buffer.from(buffer)); // eslint-disable-line n/prefer-global/buffer
		imageBuffer = await image.getBuffer('image/png');
	}

	// When preserving aspect ratio, we need to fit within both dimensions
	// The Kitty protocol doesn't directly support "fit within bounds while maintaining aspect ratio"
	// when both c and r are specified, so we need to calculate which dimension to use
	if (preserveAspectRatio) {
		// Get image dimensions to determine which constraint to use
		const dimensions = imageDimensionsFromData(buffer);
		if (dimensions && dimensions.width && dimensions.height) {
			const imageAspectRatio = dimensions.width / dimensions.height;
			// Terminal cells are approximately 2:1 (height:width)
			const cellAspectRatio = 0.5;
			const terminalAspectRatio = (columns * cellAspectRatio) / rows;

			if (imageAspectRatio > terminalAspectRatio) {
				// Image is wider than terminal space - constrain by width
				drawImageWithKitty(imageBuffer, columns, undefined);
			} else {
				// Image is taller than terminal space - constrain by height
				drawImageWithKitty(imageBuffer, undefined, rows);
			}
		} else {
			// Fallback if we can't get dimensions
			drawImageWithKitty(imageBuffer, columns, undefined);
		}
	} else {
		// Not preserving aspect ratio, use both dimensions
		drawImageWithKitty(imageBuffer, columns, rows);
	}

	// Return empty string as the drawing is done directly
	return '';
}

const terminalImage = {};

terminalImage.buffer = async (buffer, {width = '100%', height = '100%', preserveAspectRatio = true, isGifFrame = false, preferNativeRender = true} = {}) => {
	// If not using native terminal rendering, fallback to ANSI
	if (!preferNativeRender) {
		return render(buffer, {height, width, preserveAspectRatio});
	}

	// Check for Kitty protocol support only if we're in an interactive terminal
	// and not in iTerm2 (which has its own protocol)
	// Note: We disable Kitty protocol for GIF frames as it doesn't work well with log-update
	if (!isGifFrame && process.stdout.isTTY && process.env.TERM_PROGRAM !== 'iTerm.app') {
		const {env} = process;

		// Check for environment variables that indicate Kitty or Kitty-like terminals
		const isKittyLike = env.TERM === 'xterm-kitty'
			|| env.KITTY_WINDOW_ID
			|| env.TERM_PROGRAM === 'WezTerm'
			|| env.TERM_PROGRAM === 'konsole'
			|| env.KONSOLE_VERSION;

		if (isKittyLike) {
			// Use Kitty Graphics Protocol for high-quality rendering
			try {
				return await renderKitty(buffer, {width, height, preserveAspectRatio});
			} catch {
				return render(buffer, {height, width, preserveAspectRatio});
			}
		}
	}

	// Fall back to iTerm2 or ANSI blocks
	return termImg(buffer, {
		width,
		height,
		fallback: () => render(buffer, {height, width, preserveAspectRatio}),
	});
};

terminalImage.file = async (filePath, options = {}) =>
	terminalImage.buffer(await fsPromises.readFile(filePath), options);

terminalImage.gifBuffer = (buffer, options = {}) => {
	options = {
		renderFrame: logUpdate,
		maximumFrameRate: 30,
		...options,
	};

	const finalize = () => {
		options.renderFrame.done?.();
	};

	const dimensions = imageDimensionsFromData(buffer);
	if (dimensions?.width < 2 || dimensions?.height < 2) {
		throw new Error('The image is too small to be rendered.');
	}

	// Check if we can use native terminal support for GIF
	// Note: Kitty doesn't have native GIF animation support, so we always use frame-by-frame
	const result = termImg(buffer, {
		width: options.width,
		height: options.height,
		fallback: () => false,
	});

	if (result) {
		options.renderFrame(result);
		return finalize;
	}

	// Render GIF frame by frame (works with Kitty, iTerm2, and ANSI blocks)
	const animation = renderGif(buffer, async frameData => {
		options.renderFrame(await terminalImage.buffer(frameData, {...options, isGifFrame: true}));
	}, options);

	return () => {
		animation.isPlaying = false;
		finalize();
	};
};

terminalImage.gifFile = (filePath, options = {}) =>
	terminalImage.gifBuffer(fs.readFileSync(filePath), options);

export default terminalImage;
