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

// Visit counting (D-210 in the Back Office's DECISIONS.md): one ping per page load, no cookies. ?notrack=1 saves a
// setting in this browser so its visits aren't counted (the site owner's own); ?notrack=0 removes it. Automated
// browsers don't send it. A failed ping changes nothing on the page.
(() => {
  const params = new URLSearchParams(location.search);
  const flag = params.get('notrack');
  try {
    if (flag === '1') localStorage.setItem('pb-notrack', '1');
    if (flag === '0') localStorage.removeItem('pb-notrack');
    if (flag !== null || localStorage.getItem('pb-notrack') === '1') return;
  } catch { if (flag !== null) return; }
  if (navigator.webdriver) return;
  const ping = { p: location.pathname };
  try { if (document.referrer) ping.r = new URL(document.referrer).hostname; } catch { /* no referrer */ }
  // Reserved for tracked links (?r=<code>): sent as given, not used yet.
  if (params.get('r')) ping.c = params.get('r').slice(0, 64);
  try {
    fetch('/api/v', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ping), keepalive: true, credentials: 'omit' }).catch(() => {});
  } catch { /* never affects the page */ }
})();

// The contact form (D-211). Sent as JSON to /api/enquiry (the site's Worker passes it to the Back Office). Cloudflare
// Turnstile loads only once someone starts using the form. Anything that goes wrong ends in a clear message, and if the
// form can't be used it says to email instead.
const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  const EMAIL = 'piers@piersblinco.com';
  const status = contactForm.querySelector('#contact-status');
  const submit = contactForm.querySelector('.contact-submit');
  const siteKey = contactForm.dataset.sitekey || '';
  const fields = ['name', 'email', 'phone', 'business', 'need', 'message'];
  let token = '', widget = null, turnstileState = 'idle', sending = false;

  const say = (kind, text, withEmail = false) => {
    status.className = `contact-status ${kind}`;
    status.replaceChildren(document.createTextNode(text));
    if (withEmail) {
      const a = document.createElement('a');
      a.href = `mailto:${EMAIL}`;
      a.textContent = EMAIL;
      status.append(' ', a, '.');
    }
  };
  const fallback = text => say('error', `${text} Please email me instead at`, true);
  const fieldError = (name, message) => {
    const input = contactForm.elements[name];
    const error = contactForm.querySelector(`#cf-${name}-error`);
    if (!input || !error) return;
    error.textContent = message || '';
    error.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  };
  const clearErrors = () => fields.forEach(f => fieldError(f, ''));

  function loadTurnstile() {
    if (turnstileState !== 'idle' || !siteKey) return;
    turnstileState = 'loading';
    window.pbTurnstileReady = () => {
      try {
        widget = window.turnstile.render('#cf-turnstile', {
          sitekey: siteKey, appearance: 'interaction-only', action: 'contact',
          callback: t => { token = t; },
          'expired-callback': () => { token = ''; },
          'error-callback': () => { token = ''; turnstileState = 'failed'; }
        });
        turnstileState = 'ready';
      } catch { turnstileState = 'failed'; }
    };
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=pbTurnstileReady';
    script.async = true;
    script.onerror = () => { turnstileState = 'failed'; };
    document.head.append(script);
  }
  contactForm.addEventListener('focusin', loadTurnstile);
  contactForm.addEventListener('pointerdown', loadTurnstile);

  /** Waits up to 15 seconds for Turnstile's token (it usually arrives while the form is being filled in). */
  async function waitForToken() {
    for (let i = 0; i < 75 && !token && turnstileState !== 'failed'; i++) await new Promise(r => setTimeout(r, 200));
    return token;
  }

  function check(data) {
    const errors = {};
    if (!data.name.trim()) errors.name = 'Please tell me your name.';
    if (!data.email.trim()) errors.email = 'Please give an email address so I can reply.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) errors.email = 'That email address doesn’t look right.';
    if (data.phone.trim() && (!/^[0-9+()\-. ]+$/.test(data.phone.trim()) || (data.phone.match(/\d/g) || []).length < 6)) errors.phone = 'That phone number doesn’t look right.';
    if (!data.need) errors.need = 'Please choose what you need.';
    if (!data.message.trim()) errors.message = 'Please write a short message.';
    return errors;
  }

  contactForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    clearErrors();
    const data = Object.fromEntries(fields.map(f => [f, contactForm.elements[f].value]));
    const errors = check(data);
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([f, m]) => fieldError(f, m));
      say('error', 'Please check the highlighted fields.');
      contactForm.elements[Object.keys(errors)[0]].focus();
      return;
    }
    if (!siteKey) return fallback('Sorry, the form isn’t available right now.');
    sending = true;
    submit.disabled = true;
    say('pending', 'Sending…');
    try {
      loadTurnstile();
      const turnstile = await waitForToken();
      if (!turnstile) return fallback('Sorry, the spam check couldn’t run in your browser, so the form can’t be sent.');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      let res, body = null;
      try {
        res = await fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', signal: controller.signal,
          body: JSON.stringify({ ...data, website: contactForm.elements.website.value, turnstile, path: location.pathname }) });
        body = await res.json().catch(() => null);
      } finally { clearTimeout(timer); }
      if (res.ok && body && body.ok) {
        const done = document.createElement('div');
        done.className = 'contact-done';
        done.tabIndex = -1;
        const heading = document.createElement('h3');
        heading.textContent = 'Thanks, your message has been sent.';
        const p = document.createElement('p');
        p.textContent = 'I’ll be in touch within one working day. You should also get a short confirmation email.';
        done.append(heading, p);
        contactForm.replaceWith(done);
        done.focus();
        return;
      }
      token = '';
      if (widget !== null) try { window.turnstile.reset(widget); } catch { /* reloads on next try */ }
      if (res.status === 400 && body && body.fields && Object.keys(body.fields).length) {
        Object.entries(body.fields).forEach(([f, m]) => fieldError(f, m));
        say('error', 'Please check the highlighted fields.');
      } else if (res.status === 403) say('error', 'The spam check didn’t pass. Please try sending again.');
      else if (res.status === 429) fallback('Sorry, too many messages have been sent from your connection.');
      else fallback('Sorry, the form isn’t working right now.');
    } catch {
      fallback('Sorry, your message couldn’t be sent.');
    } finally {
      sending = false;
      submit.disabled = false;
    }
  });
}
