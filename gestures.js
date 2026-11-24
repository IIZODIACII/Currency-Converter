// Swipe-left-to-remove and drag-to-reorder for the converter rows (pointer events: touch + mouse).

/** Swiping `card` left past ~35% of its width calls onRemove(). */
export function attachSwipe(li, card, { onRemove }) {
  let startX = 0; let startY = 0; let tracking = false; let swiping = false; let dx = 0;

  const reset = () => {
    card.style.transition = '';
    card.style.transform = '';
    li.classList.remove('swiping', 'armed');
  };

  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.grip, .copy')) return;
    if (e.pointerType === 'mouse' && e.target.closest('input')) return; // let mouse users select text
    startX = e.clientX; startY = e.clientY; dx = 0;
    tracking = true; swiping = false;
  });

  card.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!swiping) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { tracking = false; return; } // it's a scroll
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiping = true;
        card.setPointerCapture(e.pointerId);
        li.classList.add('swiping');
        document.activeElement?.blur?.();
      } else return;
    }
    const x = Math.min(0, dx);
    card.style.transform = `translateX(${x}px)`;
    li.classList.toggle('armed', -x > li.offsetWidth * 0.35);
  });

  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!swiping) return;
    // Swallow the click that follows a swipe so it doesn't focus the input.
    card.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    setTimeout(() => { swiping = false; }, 0);
    if (li.classList.contains('armed')) {
      card.style.transition = 'transform .18s ease-in';
      card.style.transform = 'translateX(-110%)';
      setTimeout(onRemove, 180);
    } else {
      card.style.transition = 'transform .2s ease-out';
      card.style.transform = '';
      setTimeout(reset, 200);
    }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', () => { tracking = false; swiping = false; reset(); });
}

/** Dragging `handle` moves `li` among its siblings (never above the `.home` row); onDrop() saves. */
export function attachDrag(li, handle, { onDrop }) {
  const list = () => li.parentElement;
  const gap = () => parseFloat(getComputedStyle(list()).rowGap) || 0;
  const canGoAbove = (node) => node && !node.classList.contains('home');

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let startY = e.clientY;
    let moved = false;
    li.classList.add('dragging');

    const move = (ev) => {
      let dy = ev.clientY - startY;
      const next = li.nextElementSibling;
      const prev = li.previousElementSibling;
      if (dy > 0 && next && dy > (next.offsetHeight + gap()) / 2) {
        const step = next.offsetHeight + gap();
        next.after(li); startY += step; dy -= step; moved = true;
      } else if (dy < 0 && canGoAbove(prev) && -dy > (prev.offsetHeight + gap()) / 2) {
        const step = prev.offsetHeight + gap();
        prev.before(li); startY -= step; dy += step; moved = true;
      }
      // Don't let the row visually leave the list area above the home row.
      if (dy < 0 && !canGoAbove(li.previousElementSibling)) dy = Math.max(dy, -8);
      li.style.transform = `translateY(${dy}px)`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      li.classList.remove('dragging');
      li.style.transform = '';
      if (moved) onDrop();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  // Keyboard: focus the handle and use the arrow keys.
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && canGoAbove(li.previousElementSibling)) li.previousElementSibling.before(li);
    else if (e.key === 'ArrowDown' && li.nextElementSibling) li.nextElementSibling.after(li);
    else return;
    e.preventDefault();
    handle.focus();
    onDrop();
  });
}
