import { renderToString } from '../index.js';
import { CHILD_DID_SUSPEND, COMPONENT, PARENT } from './constants.js';
import { Deferred } from './util.js';
import { createInitScript, createSubtree } from './client.js';

/**
 * @param {VNode} vnode
 * @param {RenderToChunksOptions} options
 * @returns {Promise<void>}
 */
export async function renderToChunks(vnode, { context, onWrite, abortSignal }) {
	context = context || {};

	/** @type {RendererState} */
	const renderer = {
		start: Date.now(),
		abortSignal,
		onWrite,
		onError: handleError,
		suspended: []
	};

	// Synchronously render the shell
	// @ts-ignore - using third internal RendererState argument
	const shell = renderToString(vnode, context, renderer);
	onWrite(shell);

	// Wait for any suspended sub-trees if there are any
	const len = renderer.suspended.length;
	if (len > 0) {
		onWrite('<div hidden>');
		onWrite(createInitScript(len));
		// We should keep checking all promises
		await forkPromises(renderer);
		onWrite('</div>');
	}
}

async function forkPromises(renderer) {
	if (renderer.suspended.length > 0) {
		const suspensions = [...renderer.suspended];
		await Promise.all(renderer.suspended.map((s) => s.promise));
		renderer.suspended = renderer.suspended.filter(
			(s) => !suspensions.includes(s)
		);
		await forkPromises(renderer);
	}
}

/** @type {RendererErrorHandler} */
function handleError(error, vnode, renderChild) {
	if (!error || !error.then) return;

	// walk up to the Suspense boundary
	while ((vnode = vnode[PARENT])) {
		let component = vnode[COMPONENT];
		if (component && component[CHILD_DID_SUSPEND]) {
			break;
		}
	}

	if (!vnode) return;

	const id = vnode.__v;
	const found = this.suspended.find((x) => x.id === id);
	const race = new Deferred();

	const abortSignal = this.abortSignal;
	if (abortSignal) {
		// @ts-ignore 2554 - implicit undefined arg
		if (abortSignal.aborted) race.resolve();
		else abortSignal.addEventListener('abort', race.resolve);
	}

	const promise = error.then(
		() => {
			if (abortSignal && abortSignal.aborted) return;
			const child = renderChild(vnode.props.children);
			if (child) this.onWrite(createSubtree(id, child));
		},
		// TODO: Abort and send hydration code snippet to client
		// to attempt to recover during hydration
		this.onError
	);

	this.suspended.push({
		id,
		vnode,
		promise: Promise.race([promise, race.promise])
	});

	const fallback = renderChild(vnode.props.fallback);

	return found
		? ''
		: `<!--preact-island:${id}-->${fallback}<!--/preact-island:${id}-->`;
}
