/* eslint-disable no-var, key-spacing, object-curly-spacing, prefer-arrow-callback, semi, keyword-spacing */

// function initPreactIslandElement() {
// 	class PreactIslandElement extends HTMLElement {
// 		connectedCallback() {
// 			var d = this;
// 			if (!d.isConnected) return;

// 			let i = this.getAttribute('data-target');
// 			if (!i) return;

// 			var s,
// 				e,
// 				c = document.createNodeIterator(document, 128);
// 			while (c.nextNode()) {
// 				let n = c.referenceNode;

// 				if (n.data == 'preact-island:' + i) s = n;
// 				else if (n.data == '/preact-island:' + i) e = n;
// 				if (s && e) break;
// 			}
// 			if (s && e) {
// 				requestAnimationFrame(() => {
// 					var p = e.previousSibling;
// 					while (p != s) {
// 						if (!p || p == s) break;
// 						e.parentNode.removeChild(p);
// 						p = e.previousSibling;
// 					}

// 					c = s;
// 					while (d.firstChild) {
// 						s = d.firstChild;
// 						d.removeChild(s);
// 						c.after(s);
// 						c = s;
// 					}

// 					d.parentNode.removeChild(d);
// 				});
// 			}
// 		}
// 	}

// 	customElements.define('preact-island', PreactIslandElement);
// }

// To modify the INIT_SCRIPT, uncomment the above code, modify it, and paste it into https://try.terser.org/.
const INIT_SCRIPT = `class e extends HTMLElement{connectedCallback(){var e=this;if(!e.isConnected)return;let t=this.getAttribute("data-target");if(t){for(var r,a,i=document.createNodeIterator(document,128);i.nextNode();){let e=i.referenceNode;if(e.data=="preact-island:"+t?r=e:e.data=="/preact-island:"+t&&(a=e),r&&a)break}r&&a&&requestAnimationFrame((()=>{for(var t=a.previousSibling;t!=r&&t&&t!=r;)a.parentNode.removeChild(t),t=a.previousSibling;for(i=r;e.firstChild;)r=e.firstChild,e.removeChild(r),i.after(r),i=r;e.parentNode.removeChild(e)}))}}}customElements.define("preact-island",e);`;

export function createInitScript() {
	return `<script>(function(){${INIT_SCRIPT}}())</script>`;
}

/**
 * @param {string} id
 * @param {string} content
 * @returns {string}
 */
export function createSubtree(id, content) {
	return `<preact-island hidden data-target="${id}">${content}</preact-island>`;
}
