import { VNode } from 'preact';

interface RenderStream extends ReadableStream<Uint8Array> {
	allReady: Promise<void>;
}

export function renderToReadableStream(
	vnode: VNode,
	context?: any
): RenderStream;
