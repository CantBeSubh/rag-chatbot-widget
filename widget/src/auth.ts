export function getApiKey(): string {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]');
  for (const script of Array.from(scripts)) {
    const url = new URL(script.src);
    const key = url.searchParams.get('key');
    if (key) return key;
  }
  throw new Error('[RAG Widget] No API key found. Add ?key=YOUR_KEY to the script src.');
}
