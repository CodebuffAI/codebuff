export interface ScreenshotMessage {
  type: 'vly-screenshot-request' | 'vly-screenshot-response' | 'vly-screenshot-error';
  requestId?: string;
  dataUrl?: string;
  error?: string;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
}

const CAPTURE_DELAY_MS = 10000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function initScreenshotListener() {
  // Load html2canvas-pro from CDN (supports modern CSS like oklch)
  if (typeof (window as any).html2canvas === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@2.0.4/dist/html2canvas-pro.min.js';
    script.async = true;
    document.head.appendChild(script);
  }

  // Listen for screenshot requests from parent
  window.addEventListener('message', async (event) => {
    const message = event.data as ScreenshotMessage;

    if (message.type !== 'vly-screenshot-request') return;

    try {
      // Wait for html2canvas to load
      if (typeof (window as any).html2canvas === 'undefined') {
        throw new Error('html2canvas not loaded yet');
      }
      const html2canvas = (window as any).html2canvas;

      await delay(CAPTURE_DELAY_MS);

      // Capture screenshot
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        scale: 0.5,
        width: window.innerWidth,
        height: window.innerHeight,
      });

      // Convert to blob and data URL
      const format = message.format || 'jpeg';
      const quality = message.quality || 0.85;
      const mimeType = `image/${format}`;

      canvas.toBlob((blob: Blob | null) => {
        if (!blob) {
          throw new Error('Failed to convert canvas to blob');
        }

        const reader = new FileReader();
        reader.onload = () => {
          window.parent.postMessage({
            type: 'vly-screenshot-response',
            requestId: message.requestId,
            dataUrl: reader.result as string,
          } as ScreenshotMessage, '*');
        };
        reader.onerror = () => {
          throw new Error('FileReader error');
        };
        reader.readAsDataURL(blob);
      }, mimeType, quality);

    } catch (error) {

      window.parent.postMessage({
        type: 'vly-screenshot-error',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ScreenshotMessage, '*');
    }
  });
}
