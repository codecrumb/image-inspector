// ── Copy feedback helper ──────────────────────────────────────────────────
export function showCopyFeedback(el, text) {
  navigator.clipboard.writeText(text).then(() => {
    el.classList.remove('copy-flash');
    void el.offsetWidth;
    el.classList.add('copy-flash');
    el.addEventListener('animationend', () => el.classList.remove('copy-flash'), { once: true });
    const old = el.querySelector('.copy-tip');
    if (old) old.remove();
    const tip = document.createElement('span');
    tip.className = 'copy-tip';
    tip.textContent = 'Copied!';
    el.appendChild(tip);
    setTimeout(() => tip.remove(), 1200);
  });
}

// ── Click-to-copy stat cells ──────────────────────────────────────────────
document.getElementById('statsGrid').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-copyid]');
  if (!cell) return;
  const statEl = document.getElementById(cell.dataset.copyid);
  if (!statEl) return;
  const text = statEl.textContent.trim();
  if (!text || text === '—') return;
  showCopyFeedback(cell, text);
});
