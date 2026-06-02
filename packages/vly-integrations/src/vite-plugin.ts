import type { Plugin } from 'vite';

/**
 * VLY Vite Plugin
 *
 * Injects the @vly-ai/integrations runtime into the page.
 * This includes:
 * - HMR error reporting
 * - Other VLY platform integrations
 *
 * Usage in vite.config.ts:
 * ```typescript
 * import { vlyPlugin } from '@vly-ai/integrations';
 *
 * export default defineConfig({
 *   plugins: [vlyPlugin()],
 * });
 * ```
 */
export function vlyPlugin(): Plugin {
  return {
    name: 'vly-plugin',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: `import '@vly-ai/integrations';`,
            injectTo: 'head',
          },
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: `
// Vite compile-time errors (syntax errors, failed transforms, bad imports)
if (import.meta.hot) {
  import.meta.hot.on('vite:error', (payload) => {
    window.parent.postMessage({
      type: 'vly-vite-hmr-error',
      error: {
        message: payload.err?.message || String(payload.err || payload),
        stack: payload.err?.stack,
        plugin: payload.err?.plugin,
        loc: payload.err?.loc,
      },
      timestamp: Date.now(),
    }, '*');
  });
  import.meta.hot.on('vite:beforeFullReload', () => {
    window.parent.postMessage({
      type: 'vly-vite-hmr-success',
      timestamp: Date.now(),
    }, '*');
  });
}

// Runtime errors (ReferenceError, TypeError, etc.)
window.addEventListener('error', (event) => {
  window.parent.postMessage({
    type: 'vly-vite-hmr-error',
    error: {
      message: event.message,
      stack: event.error?.stack || '',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
    timestamp: Date.now(),
  }, '*');
});

// Unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  window.parent.postMessage({
    type: 'vly-vite-hmr-error',
    error: {
      message: error?.message || String(error),
      stack: error?.stack || '',
    },
    timestamp: Date.now(),
  }, '*');
});`,
            injectTo: 'head',
          },
        ];
      },
    },
  };
}
