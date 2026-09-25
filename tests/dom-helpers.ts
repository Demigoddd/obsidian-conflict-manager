/*
 * The subset of Obsidian's DOM helpers the views use, on top of happy-dom.
 * Import it first in tests running with "@vitest-environment happy-dom".
 */
interface IElementInfo {
  cls?: string | string[];
  text?: string;
  type?: string;
}

const build = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  info?: IElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  const options = typeof info === 'string' ? { cls: info } : (info ?? {});

  if (options.cls) {
    const classes = Array.isArray(options.cls) ? options.cls : options.cls.split(' ');
    el.classList.add(...classes.filter(Boolean));
  }
  if (options.text !== undefined) el.textContent = options.text;
  if (options.type) el.setAttribute('type', options.type);

  callback?.(el);
  return el;
};

// Obsidian's own hide/show write the inline display style, which the plugin lint rule forbids
const setVisible = (el: HTMLElement, visible: boolean) => {
  if (visible) el.style.removeProperty('display');
  // eslint-disable-next-line obsidianmd/no-static-styles-assignment
  else el.style.setProperty('display', 'none');
};

Object.assign(HTMLElement.prototype, {
  createEl<K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    info?: IElementInfo | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ) {
    return this.appendChild(build(tag, info, callback));
  },
  createDiv(this: HTMLElement, info?: IElementInfo | string) {
    return this.appendChild(build('div', info));
  },
  createSpan(this: HTMLElement, info?: IElementInfo | string) {
    return this.appendChild(build('span', info));
  },
  empty(this: HTMLElement) {
    while (this.firstChild) this.removeChild(this.firstChild);
  },
  setText(this: HTMLElement, text: string) {
    this.textContent = text;
  },
  addClass(this: HTMLElement, ...classes: string[]) {
    this.classList.add(...classes);
  },
  removeClass(this: HTMLElement, ...classes: string[]) {
    this.classList.remove(...classes);
  },
  toggle(this: HTMLElement, show: boolean) {
    setVisible(this, show);
  },
  hide(this: HTMLElement) {
    setVisible(this, false);
  },
  show(this: HTMLElement) {
    setVisible(this, true);
  },
});

Object.defineProperty(Node.prototype, 'doc', {
  get(this: Node) {
    return this.ownerDocument;
  },
});

// The banner fades in; the animation itself is irrelevant to the tests
if (typeof HTMLElement.prototype.animate !== 'function') {
  Object.assign(HTMLElement.prototype, { animate: () => ({}) });
}

Object.assign(globalThis, {
  createEl: build,
  createDiv: (info?: IElementInfo | string) => build('div', info),
  createSpan: (info?: IElementInfo | string) => build('span', info),
});

// Lets pending promise callbacks run, e.g. the file reads inside renderDiff
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
