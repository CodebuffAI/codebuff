import { initScreenshotListener } from './screenshot';

function isVlyPlatform(): boolean {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;
  return (
    hostname.endsWith('.vly.ai') ||
    hostname.endsWith('.vly.sh') ||
    hostname.includes('localhost') || // For dev
    hostname.includes('127.0.0.1')
  );
}

export function initVly() {
  if (!isVlyPlatform()) {
    return;
  }
  initScreenshotListener();
}

// Auto-initialize on import
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVly);
  } else {
    initVly();
  }
}

export { initScreenshotListener } from './screenshot';
export type { ScreenshotMessage } from './screenshot';
