import { ComponentChildren, VNode } from 'preact';

interface Suspended {
	id: string;
	promise: Promise<any>;
	context: any;
	isSvgMode: boolean;
	selectValue: any;
	vnode: VNode;
	parent: VNode | null;
}

interface RendererErrorHandler {
	(
		this: RendererState,
		error: any,
		vnode: VNode<{ fallback: any }>,
		renderChild: (child: ComponentChildren) => string
	): string | undefined;
}

interface RendererState {
	start: number;
	suspended: Suspended[];
	abortSignal?: AbortSignal | undefined;
	onWrite: (str: string) => void;
	onError?: RendererErrorHandler;
}

interface RenderToChunksOptions {
	context?: any;
	onError?: (error: any) => void;
	onWrite: (str: string) => void;
	abortSignal?: AbortSignal;
}
