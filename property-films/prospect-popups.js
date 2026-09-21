(() => {
  'use strict';

  const popup = document.querySelector('#prospect-popup');
  if (!popup) return;

  const nameEl = popup.querySelector('[data-prospect-name]');
  const locationEl = popup.querySelector('[data-prospect-location]');
  const closeButton = popup.querySelector('[data-prospect-close]');

  const endpoint =
    'https://business-os.pbwebonlinesales.workers.dev/api/property-business/property-films/prospect-names';

  let businesses = [];
  let index = 0;
  let showTimer;
  let hideTimer;
  let closed = false;

  try {
    closed = sessionStorage.getItem('property-films-prospect-popup-closed') === '1';
  } catch {}

  if (closed) return;

  function cleanName(value) {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function hide() {
    popup.classList.remove('is-visible');

    if (!closed && businesses.length) {
      showTimer = setTimeout(showNext, 11000);
    }
  }

  function showNext() {
    if (closed || !businesses.length) return;

    const business = businesses[index];
    index = (index + 1) % businesses.length;

    if (index === 0) shuffle(businesses);

    nameEl.textContent = cleanName(business.name);
    const contextLines = [
      'One of the properties we’re introducing Property Films to',
      'Another holiday-let business on our Property Films introduction list',
      'Property Films is being introduced to businesses like this',
      'Part of the holiday-let businesses we’re currently reaching out to',
      'Another property we’re introducing to cinematic Property Films'
    ];

    const context = contextLines[Math.floor(Math.random() * contextLines.length)];

    locationEl.textContent = business.county
      ? `${context} · ${business.county}`
      : context;

    popup.classList.add('is-visible');

    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 6500);
  }

  closeButton.addEventListener('click', () => {
    closed = true;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    popup.classList.remove('is-visible');

    try {
      sessionStorage.setItem('property-films-prospect-popup-closed', '1');
    } catch {}
  });

  fetch(endpoint, {
    credentials: 'omit',
    signal: AbortSignal.timeout(8000)
  })
    .then(response => {
      if (!response.ok) throw new Error('Prospect feed unavailable');
      return response.json();
    })
    .then(data => {
      businesses = shuffle(
        (Array.isArray(data.businesses) ? data.businesses : [])
          .filter(item => item && typeof item.name === 'string' && item.name.trim())
      );

      if (businesses.length) {
        showTimer = setTimeout(showNext, 4500);
      }
    })
    .catch(() => {
      // Decorative enhancement only. Fail silently.
    });
})();
