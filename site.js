// A shuffled queue keeps every off-screen brand ahead of recently removed ones.
// Images preload before fading; a failed load leaves the current slot intact.
const grid = document.querySelector('.brand-grid');
const pause = document.querySelector('#brand-pause');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (grid && pause) {
  const slots = [...grid.querySelectorAll('img')];
  let queue = [], timer, generation = 0, busy = false, paused = false;
  const allowed = () => !document.hidden && !reducedMotion.matches && !paused;
  const shuffle = items => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function rotate() {
    if (!allowed() || busy || !queue.length) return;
    busy = true;
    const version = generation;
    const next = queue[0];
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const preload = new Image();
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Logo load timed out')), 8000);
        preload.onload = () => { clearTimeout(timeout); resolve(); };
        preload.onerror = () => { clearTimeout(timeout); reject(new Error('Logo unavailable')); };
        preload.src = next.src;
      });
      if (version !== generation || !allowed()) return;
      slot.classList.add('is-changing');
      await wait(400);
      if (version !== generation || !allowed()) return;
      queue.shift();
      queue.push({ src: slot.getAttribute('src'), name: slot.alt });
      slot.src = next.src;
      slot.alt = next.name;
      slot.classList.remove('is-changing');
      await wait(400);
    } catch {
      // Retry other brands first, with no blank frame or unhandled rejection.
      if (version === generation && queue[0] === next) queue.push(queue.shift());
    } finally {
      slot.classList.remove('is-changing');
      busy = false;
    }
  }
  function syncRotation() {
    clearInterval(timer);
    generation++;
    slots.forEach(slot => slot.classList.remove('is-changing'));
    pause.textContent = paused ? 'Resume logo rotation' : 'Pause logo rotation';
    pause.setAttribute('aria-pressed', String(paused));
    pause.hidden = reducedMotion.matches || !queue.length;
    if (allowed() && queue.length) timer = setInterval(rotate, 3500);
  }
  pause.addEventListener('click', () => { paused = !paused; syncRotation(); });
  document.addEventListener('visibilitychange', syncRotation);
  reducedMotion.addEventListener('change', syncRotation);
  fetch('/brands.json').then(response => {
    if (!response.ok) throw new Error('Brand manifest unavailable');
    return response.json();
  }).then(brands => {
    const visible = new Set(slots.map(slot => slot.getAttribute('src')));
    const unique = new Map(brands.map(brand => [brand.src, brand]));
    queue = shuffle([...unique.values()].filter(brand => !visible.has(brand.src)));
    syncRotation();
  }).catch(() => { /* The six initial static logos remain usable without JS. */ });
}
