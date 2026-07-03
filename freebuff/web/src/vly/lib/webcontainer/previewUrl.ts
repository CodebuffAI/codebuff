"use client";

type Listener = (url: string | null) => void;

let currentPreviewUrl: string | null = null;
const listeners = new Set<Listener>();

export function getWebContainerPreviewUrl(): string | null {
  return currentPreviewUrl;
}

export function setWebContainerPreviewUrl(url: string | null): void {
  currentPreviewUrl = url;
  for (const listener of listeners) {
    listener(url);
  }
}

export function subscribeToWebContainerPreviewUrl(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
