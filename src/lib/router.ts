import { useSyncExternalStore } from 'react'

/**
 * Minimal History-API router. Clean paths (/plugin, /cartridge-os) work on
 * refresh because Vite dev/preview history-fallback to index.html and
 * Cloudflare Pages serves index.html for unmatched paths as long as no
 * public/404.html exists — do not add one.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

export function navigate(path: string): void {
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path)
  }
  // pushState doesn't fire popstate; dispatch it so usePath subscribers re-read.
  window.dispatchEvent(new PopStateEvent('popstate'))
}
