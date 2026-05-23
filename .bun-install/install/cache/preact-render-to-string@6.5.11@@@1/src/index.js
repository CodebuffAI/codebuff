import {
	encodeEntities,
	styleObjToCss,
	UNSAFE_NAME,
	NAMESPACE_REPLACE_REGEX,
	HTML_LOWER_CASE,
	HTML_ENUMERATED,
	SVG_CAMEL_CASE,
	createComponent
} from './lib/util.js';
import { options, h, Fragment } from 'preact';
import {
	CHILDREN,
	COMMIT,
	COMPONENT,
	DIFF,
	DIFFED,
	DIRTY,
	NEXT_STATE,
	PARENT,
	RENDER,
	SKIP_EFFECTS,
	VNODE,
	CATCH_ERROR
} from './lib/constants.js';

const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const isArray = Array.isArray;
const assign = Object.assign;
const EMPTY_STR = '';

// Global state for the current render pass
let beforeDiff, afterDiff, renderHook, ummountHook;

/**
 * Render Preact JSX + Components to an HTML string.
 * @param {VNode} vnode	JSX Element / VNode to render
 * @param {Object} [context={}] Initial root context object
 * @param {RendererState} [_rendererState] for internal use
 * @returns {string} serialized HTML
 */
export function renderToString(vnode, context, _rendererState) {
	// Performance optimization: `renderToString` is synchronous and we
	// therefore don't execute any effects. To do that we pass an empty
	// array to `options._commit` (`__c`). But we can go one step further
	// and avoid a lot of dirty checks and allocations by setting
	// `options._skipEffects` (`__s`) too.
	const previousSkipEffects = options[SKIP_EFFECTS];
	options[SKIP_EFFECTS] = true;

	// store options hooks once before each synchronous render call
	beforeDiff = options[DIFF];
	afterDiff = options[DIFFED];
	renderHook = options[RENDER];
	ummountHook = options.unmount;

	const parent = h(Fragment, null);
	parent[CHILDREN] = [vnode];

	try {
		const rendered = _renderToString(
			vnode,
			context || EMPTY_OBJ,
			false,
			undefined,
			parent,
			false,
			_rendererState
		);

		if (isArray(rendered)) {
			return rendered.join(EMPTY_STR);
		}
		return rendered;
	} catch (e) {
		if (e.then) {
			throw new Error('Use "renderToStringAsync" for suspenseful rendering.');
		}

		throw e;
	} finally {
		// options._commit, we don't schedule any effects in this library right now,
		// so we can pass an empty queue to this hook.
		if (options[COMMIT]) options[COMMIT](vnode, EMPTY_ARR);
		options[SKIP_EFFECTS] = previousSkipEffects;
		EMPTY_ARR.length = 0;
	}
}

/**
 * Render Preact JSX + Components to an HTML string.
 * @param {VNode} vnode	JSX Element / VNode to render
 * @param {Object} [context={}] Initial root context object
 * @returns {string} serialized HTML
 */
export async function renderToStringAsync(vnode, context) {
	// Performance optimization: `renderToString` is synchronous and we
	// therefore don't execute any effects. To do that we pass an empty
	// array to `options._commit` (`__c`). But we can go one step further
	// and avoid a lot of dirty checks and allocations by setting
	// `options._skipEffects` (`__s`) too.
	const previousSkipEffects = options[SKIP_EFFECTS];
	options[SKIP_EFFECTS] = true;

	// store options hooks once before each synchronous render call
	beforeDiff = options[DIFF];
	afterDiff = options[DIFFED];
	renderHook = options[RENDER];
	ummountHook = options.unmount;

	const parent = h(Fragment, null);
	parent[CHILDREN] = [vnode];

	try {
		const rendered = await _renderToString(
			vnode,
			context || EMPTY_OBJ,
			false,
			undefined,
			parent,
			true,
			undefined
		);

		if (isArray(rendered)) {
			let count = 0;
			let resolved = rendered;

			// Resolving nested Promises with a maximum depth of 25
			while (
				resolved.some(
					(element) => element && typeof element.then === 'function'
				) &&
				count++ < 25
			) {
				resolved = (await Promise.all(resolved)).flat();
			}

			return resolved.join(EMPTY_STR);
		}

		return rendered;
	} finally {
		// options._commit, we don't schedule any effects in this library right now,
		// so we can pass an empty queue to this hook.
		if (options[COMMIT]) options[COMMIT](vnode, EMPTY_ARR);
		options[SKIP_EFFECTS] = previousSkipEffects;
		EMPTY_ARR.length = 0;
	}
}

/**
 * @param {VNode} vnode
 * @param {Record<string, unknown>} context
 */
function renderClassComponent(vnode, context) {
	let type = /** @type {import("preact").ComponentClass<typeof vnode.props>} */ (vnode.type);

	let isMounting = true;
	let c;
	if (vnode[COMPONENT]) {
		isMounting = false;
		c = vnode[COMPONENT];
		c.state = c[NEXT_STATE];
	} else {
		c = new type(vnode.props, context);
	}

	vnode[COMPONENT] = c;
	c[VNODE] = vnode;

	c.props = vnode.props;
	c.context = context;
	// turn off stateful re-rendering:
	c[DIRTY] = true;

	if (c.state == null) c.state = EMPTY_OBJ;

	if (c[NEXT_STATE] == null) {
		c[NEXT_STATE] = c.state;
	}

	if (type.getDerivedStateFromProps) {
		c.state = assign(
			{},
			c.state,
			type.getDerivedStateFromProps(c.props, c.state)
		);
	} else if (isMounting && c.componentWillMount) {
		c.componentWillMount();

		// If the user called setState in cWM we need to flush pending,
		// state updates. This is the same behaviour in React.
		c.state = c[NEXT_STATE] !== c.state ? c[NEXT_STATE] : c.state;
	} else if (!isMounting && c.componentWillUpdate) {
		c.componentWillUpdate();
	}

	if (renderHook) renderHook(vnode);

	return c.render(c.props, c.state, context);
}

/**
 * Recursively render VNodes to HTML.
 * @param {VNode|any} vnode
 * @param {any} context
 * @param {boolean} isSvgMode
 * @param {any} selectValue
 * @param {VNode} parent
 * @param {boolean} asyncMode
 * @param {RendererState | undefined} [renderer]
 * @returns {string | Promise<string> | (string | Promise<string>)[]}
 */
function _renderToString(
	vnode,
	context,
	isSvgMode,
	selectValue,
	parent,
	asyncMode,
	renderer
) {
	// Ignore non-rendered VNodes/values
	if (
		vnode == null ||
		vnode === true ||
		vnode === false ||
		vnode === EMPTY_STR
	) {
		return EMPTY_STR;
	}

	let vnodeType = typeof vnode;
	// Text VNodes: escape as HTML
	if (vnodeType != 'object') {
		if (vnodeType == 'function') return EMPTY_STR;
		return vnodeType == 'string' ? encodeEntities(vnode) : vnode + EMPTY_STR;
	}

	// Recurse into children / Arrays
	if (isArray(vnode)) {
		let rendered = EMPTY_STR,
			renderArray;
		parent[CHILDREN] = vnode;
		for (let i = 0; i < vnode.length; i++) {
			let child = vnode[i];
			if (child == null || typeof child == 'boolean') continue;

			const childRender = _renderToString(
				child,
				context,
				isSvgMode,
				selectValue,
				parent,
				asyncMode,
				renderer
			);

			if (typeof childRender == 'string') {
				rendered = rendered + childRender;
			} else {
				if (!renderArray) {
					renderArray = [];
				}

				if (rendered) renderArray.push(rendered);

				rendered = EMPTY_STR;

				if (isArray(childRender)) {
					renderArray.push(...childRender);
				} else {
					renderArray.push(childRender);
				}
			}
		}

		if (renderArray) {
			if (rendered) renderArray.push(rendered);
			return renderArray;
		}

		return rendered;
	}

	// VNodes have {constructor:undefined} to prevent JSON injection:
	if (vnode.constructor !== undefined) return EMPTY_STR;

	vnode[PARENT] = parent;
	if (beforeDiff) beforeDiff(vnode);

	let type = vnode.type,
		props = vnode.props;

	// Invoke rendering on Components
	if (typeof type == 'function') {
		let cctx = context,
			contextType,
			rendered,
			component;
		if (type === Fragment) {
			// Serialized precompiled JSX.
			if ('tpl' in props) {
				let out = EMPTY_STR;
				for (let i = 0; i < props.tpl.length; i++) {
					out = out + props.tpl[i];

					if (props.exprs && i < props.exprs.length) {
						const value = props.exprs[i];
						if (value == null) continue;

						// Check if we're dealing with a vnode or an array of nodes
						if (
							typeof value == 'object' &&
							(value.constructor === undefined || isArray(value))
						) {
							out =
								out +
								_renderToString(
									value,
									context,
									isSvgMode,
									selectValue,
									vnode,
									asyncMode,
									renderer
								);
						} else {
							// Values are pre-escaped by the JSX transform
							out = out + value;
						}
					}
				}

				return out;
			} else if ('UNSTABLE_comment' in props) {
				// Fragments are the least used components of core that's why
				// branching here for comments has the least effect on perf.
				return '<!--' + encodeEntities(props.UNSTABLE_comment) + '-->';
			}

			rendered = props.children;
		} else {
			contextType = type.contextType;
			if (contextType != null) {
				let provider = context[contextType.__c];
				cctx = provider ? provider.props.value : contextType.__;
			}

			let isClassComponent =
				type.prototype && typeof type.prototype.render == 'function';
			if (isClassComponent) {
				rendered = /**#__NOINLINE__**/ renderClassComponent(vnode, cctx);
				component = vnode[COMPONENT];
			} else {
				vnode[COMPONENT] = component = /**#__NOINLINE__**/ createComponent(
					vnode,
					cctx
				);

				// If a hook invokes setState() to invalidate the component during rendering,
				// re-render it up to 25 times to allow "settling" of memoized states.
				// Note:
				//   This will need to be updated for Preact 11 to use internal.flags rather than component._dirty:
				//   https://github.com/preactjs/preact/blob/d4ca6fdb19bc715e49fd144e69f7296b2f4daa40/src/diff/component.js#L35-L44
				let count = 0;
				while (component[DIRTY] && count++ < 25) {
					component[DIRTY] = false;

					if (renderHook) renderHook(vnode);

					rendered = type.call(component, props, cctx);
				}
				component[DIRTY] = true;
			}

			if (component.getChildContext != null) {
				context = assign({}, context, component.getChildContext());
			}

			if (
				isClassComponent &&
				options.errorBoundaries &&
				(type.getDerivedStateFromError || component.componentDidCatch)
			) {
				// When a component returns a Fragment node we flatten it in core, so we
				// need to mirror that logic here too
				let isTopLevelFragment =
					rendered != null &&
					rendered.type === Fragment &&
					rendered.key == null &&
					rendered.props.tpl == null;
				rendered = isTopLevelFragment ? rendered.props.children : rendered;

				try {
					return _renderToString(
						rendered,
						context,
						isSvgMode,
						selectValue,
						vnode,
						asyncMode,
						renderer
					);
				} catch (err) {
					if (type.getDerivedStateFromError) {
						component[NEXT_STATE] = type.getDerivedStateFromError(err);
					}

					if (component.componentDidCatch) {
						component.componentDidCatch(err, EMPTY_OBJ);
					}

					if (component[DIRTY]) {
						rendered = renderClassComponent(vnode, context);
						component = vnode[COMPONENT];

						if (component.getChildContext != null) {
							context = assign({}, context, component.getChildContext());
						}

						let isTopLevelFragment =
							rendered != null &&
							rendered.type === Fragment &&
							rendered.key == null &&
							rendered.props.tpl == null;
						rendered = isTopLevelFragment ? rendered.props.children : rendered;

						return _renderToString(
							rendered,
							context,
							isSvgMode,
							selectValue,
							vnode,
							asyncMode,
							renderer
						);
					}

					return EMPTY_STR;
				} finally {
					if (afterDiff) afterDiff(vnode);
					vnode[PARENT] = null;

					if (ummountHook) ummountHook(vnode);
				}
			}
		}

		// When a component returns a Fragment node we flatten it in core, so we
		// need to mirror that logic here too
		let isTopLevelFragment =
			rendered != null &&
			rendered.type === Fragment &&
			rendered.key == null &&
			rendered.props.tpl == null;
		rendered = isTopLevelFragment ? rendered.props.children : rendered;

		try {
			// Recurse into children before invoking the after-diff hook
			const str = _renderToString(
				rendered,
				context,
				isSvgMode,
				selectValue,
				vnode,
				asyncMode,
				renderer
			);

			if (afterDiff) afterDiff(vnode);
			// when we are dealing with suspense we can't do this...
			vnode[PARENT] = null;

			if (options.unmount) options.unmount(vnode);

			return str;
		} catch (error) {
			if (!asyncMode && renderer && renderer.onError) {
				let res = renderer.onError(error, vnode, (child) =>
					_renderToString(
						child,
						context,
						isSvgMode,
						selectValue,
						vnode,
						asyncMode,
						renderer
					)
				);

				if (res !== undefined) return res;

				let errorHook = options[CATCH_ERROR];
				if (errorHook) errorHook(error, vnode);
				return EMPTY_STR;
			}

			if (!asyncMode) throw error;

			if (!error || typeof error.then != 'function') throw error;

			const renderNestedChildren = () => {
				try {
					return _renderToString(
						rendered,
						context,
						isSvgMode,
						selectValue,
						vnode,
						asyncMode,
						renderer
					);
				} catch (e) {
					if (!e || typeof e.then != 'function') throw e;

					return e.then(
						() =>
							_renderToString(
								rendered,
								context,
								isSvgMode,
								selectValue,
								vnode,
								asyncMode,
								renderer
							),
						renderNestedChildren
					);
				}
			};

			return error.then(renderNestedChildren);
		}
	}

	// Serialize Element VNodes to HTML
	let s = '<' + type,
		html = EMPTY_STR,
		children;

	for (let name in props) {
		let v = props[name];

		if (typeof v == 'function' && name !== 'class' && name !== 'className') {
			continue;
		}

		switch (name) {
			case 'children':
				children = v;
				continue;

			// VDOM-specific props
			case 'key':
			case 'ref':
			case '__self':
			case '__source':
				continue;

			// prefer for/class over htmlFor/className
			case 'htmlFor':
				if ('for' in props) continue;
				name = 'for';
				break;
			case 'className':
				if ('class' in props) continue;
				name = 'class';
				break;

			// Form element reflected properties
			case 'defaultChecked':
				name = 'checked';
				break;
			case 'defaultSelected':
				name = 'selected';
				break;

			// Special value attribute handling
			case 'defaultValue':
			case 'value':
				name = 'value';
				switch (type) {
					// <textarea value="a&b"> --> <textarea>a&amp;b</textarea>
					case 'textarea':
						children = v;
						continue;

					// <select value> is serialized as a selected attribute on the matching option child
					case 'select':
						selectValue = v;
						continue;

					// Add a selected attribute to <option> if its value matches the parent <select> value
					case 'option':
						if (selectValue == v && !('selected' in props)) {
							s = s + ' selected';
						}
						break;
				}
				break;

			case 'dangerouslySetInnerHTML':
				html = v && v.__html;
				continue;

			// serialize object styles to a CSS string
			case 'style':
				if (typeof v === 'object') {
					v = styleObjToCss(v);
				}
				break;
			case 'acceptCharset':
				name = 'accept-charset';
				break;
			case 'httpEquiv':
				name = 'http-equiv';
				break;

			default: {
				if (NAMESPACE_REPLACE_REGEX.test(name)) {
					name = name.replace(NAMESPACE_REPLACE_REGEX, '$1:$2').toLowerCase();
				} else if (UNSAFE_NAME.test(name)) {
					continue;
				} else if (
					(name[4] === '-' || HTML_ENUMERATED.has(name)) &&
					v != null
				) {
					// serialize boolean aria-xyz or enumerated attribute values as strings
					v = v + EMPTY_STR;
				} else if (isSvgMode) {
					if (SVG_CAMEL_CASE.test(name)) {
						name =
							name === 'panose1'
								? 'panose-1'
								: name.replace(/([A-Z])/g, '-$1').toLowerCase();
					}
				} else if (HTML_LOWER_CASE.test(name)) {
					name = name.toLowerCase();
				}
			}
		}

		// write this attribute to the buffer
		if (v != null && v !== false) {
			if (v === true || v === EMPTY_STR) {
				s = s + ' ' + name;
			} else {
				s =
					s +
					' ' +
					name +
					'="' +
					(typeof v == 'string' ? encodeEntities(v) : v + EMPTY_STR) +
					'"';
			}
		}
	}

	if (UNSAFE_NAME.test(type)) {
		// this seems to performs a lot better than throwing
		// return '<!-- -->';
		throw new Error(`${type} is not a valid HTML tag name in ${s}>`);
	}

	if (html) {
		// dangerouslySetInnerHTML defined this node's contents
	} else if (typeof children === 'string') {
		// single text child
		html = encodeEntities(children);
	} else if (children != null && children !== false && children !== true) {
		// recurse into this element VNode's children
		let childSvgMode =
			type === 'svg' || (type !== 'foreignObject' && isSvgMode);
		html = _renderToString(
			children,
			context,
			childSvgMode,
			selectValue,
			vnode,
			asyncMode,
			renderer
		);
	}

	if (afterDiff) afterDiff(vnode);

	// TODO: this was commented before
	vnode[PARENT] = null;

	if (ummountHook) ummountHook(vnode);

	// Emit self-closing tag for empty void elements:
	if (!html && SELF_CLOSING.has(type)) {
		return s + '/>';
	}

	const endTag = '</' + type + '>';
	const startTag = s + '>';

	if (isArray(html)) return [startTag, ...html, endTag];
	else if (typeof html != 'string') return [startTag, html, endTag];
	return startTag + html + endTag;
}

const SELF_CLOSING = new Set([
	'area',
	'base',
	'br',
	'col',
	'command',
	'embed',
	'hr',
	'img',
	'input',
	'keygen',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

export default renderToString;
export const render = renderToString;
export const renderToStaticMarkup = renderToString;
