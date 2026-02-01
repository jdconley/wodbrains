export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; textContent?: string; attrs?: Record<string, string> },
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts?.className) el.className = opts.className;
  if (opts?.textContent) el.textContent = opts.textContent;
  if (opts?.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}
