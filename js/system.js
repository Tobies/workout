// "System" UI primitives — the Solo-Leveling blue window frames, dialogs and
// notifications. Pure DOM, no framework.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// A "System window": bracketed, glowing frame with an optional title bar.
export function systemWindow(title, children, opts = {}) {
  const inner = el('div', { class: 'sys-inner' }, children);
  const body = title
    ? [el('div', { class: 'sys-title' }, [el('span', { class: 'sys-dot' }), title]), inner]
    : [inner];
  return el('div', { class: `sys-window ${opts.class || ''}` }, body);
}

// Full-screen modal dialog styled as a System notification.
// actions: [{ label, kind: 'primary'|'ghost', onClick }]
export function systemDialog({ title = 'הודעת מערכת', bodyNodes = [], actions = [], dismissible = false }) {
  const overlay = el('div', { class: 'sys-overlay' });
  const actionRow = el(
    'div',
    { class: 'sys-actions' },
    actions.map((a) =>
      el('button', {
        class: `btn ${a.kind === 'ghost' ? 'btn-ghost' : 'btn-primary'}`,
        text: a.label,
        onClick: () => {
          if (a.onClick) a.onClick();
        },
      })
    )
  );

  const win = systemWindow(`⚠ ${title}`, [
    ...bodyNodes,
    actions.length ? actionRow : null,
  ], { class: 'sys-dialog' });

  overlay.appendChild(win);
  if (dismissible) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }
  document.body.appendChild(overlay);

  // Trigger entrance animation.
  requestAnimationFrame(() => overlay.classList.add('show'));

  return {
    close() {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
    },
    el: overlay,
  };
}

// Brief notification banner ("ping" from the System).
export function notify(message, ms = 2600) {
  let host = document.getElementById('sys-toasts');
  if (!host) {
    host = el('div', { id: 'sys-toasts', class: 'sys-toasts' });
    document.body.appendChild(host);
  }
  const t = el('div', { class: 'sys-toast', text: message });
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, ms);
}
