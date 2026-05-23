import { Deferred } from './lib/util.js';
import { renderToChunks } from './lib/chunked.js';

/** @typedef {ReadableStream<Uint8Array> & { allReady: Promise<void>}} RenderStream */

/**
 * @param {import('preact').VNode} vnode
 * @param {any} [context]
 * @returns {RenderStream}
 */
export function renderToReadableStream(vnode, context) {
	/** @type {Deferred<void>} */
	const allReady = new Deferred();
	const encoder = new TextEncoder('utf-8');

	/** @type {RenderStream} */
	const stream = new ReadableStream({
		start(controller) {
			renderToChunks(vnode, {
				context,
				onError: (error) => {
					allReady.reject(error);
					controller.abort(error);
				},
				onWrite(s) {
					controller.enqueue(encoder.encode(s));
				}
			})
				.then(() => {
					controller.close();
					allReady.resolve();
				})
				.catch((error) => {
					controller.error(error);
					allReady.reject(error);
				});
		}
	});

	stream.allReady = allReady.promise;

	return stream;
}
