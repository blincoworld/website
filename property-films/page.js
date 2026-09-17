(() => {
  'use strict';
  const config = window.PROPERTY_FILMS_CONFIG;
  const form = document.querySelector('#interest-form');
  const error = document.querySelector('#form-error');
  const fields = ['name', 'business_name', 'email', 'phone', 'website', 'property_count', 'photography'];
  const submitButton = form.querySelector('button[type=submit]');
  const submitLabel = submitButton.innerHTML;
  let submissionId = crypto.randomUUID(), started = false, busy = false;
  function event(name, detail = {}) {
    // No personal information is included. Existing analytics can subscribe to this event.
    const data = { event: `property_films_${name}`, ...detail };
    window.dispatchEvent(new CustomEvent('property-films:analytics', { detail: data }));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(data);
  }
  event('page_viewed');
  document.querySelectorAll('[data-cta]').forEach(link => link.addEventListener('click', () => event('cta_clicked', { cta: link.dataset.cta })));
  form.addEventListener('input', e => {
    if (!started) { started = true; event('form_started'); }
    if (fields.includes(e.target.name)) {
      e.target.removeAttribute('aria-invalid');
      document.getElementById(`${e.target.name}-error`).textContent = '';
    }
  });
  function fieldError(name, message) {
    form.elements[name].setAttribute('aria-invalid', 'true');
    document.getElementById(`${name}-error`).textContent = message;
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    error.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    fields.forEach(name => {
      data[name] = data[name].trim();
      form.elements[name].value = data[name];
      form.elements[name].removeAttribute('aria-invalid');
      document.getElementById(`${name}-error`).textContent = '';
      if (!data[name]) fieldError(name, 'Please complete this field.');
    });
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fieldError('email', 'Please enter a valid email address.');
    if (data.phone && (!/^[+\d\s().-]+$/.test(data.phone) || data.phone.replace(/\D/g, '').length < 7)) fieldError('phone', 'Please enter a valid phone number.');
    if (data.website) {
      try {
        if (!/^[a-z][a-z\d+.-]*:/i.test(data.website)) data.website = `https://${data.website}`;
        const url = new URL(data.website);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error();
        data.website = url.href;
        form.elements.website.value = data.website;
      } catch { fieldError('website', 'Please enter a valid website or listing URL.'); }
    }
    const invalid = form.querySelector('[aria-invalid=true]');
    if (invalid) { invalid.focus(); return; }
    const params = new URLSearchParams(location.search);
    Object.assign(data, { submission_id: submissionId, source: params.get('utm_source') || params.get('source') || 'property-films', landing_page: location.origin + location.pathname, campaign: params.get('utm_campaign') || '', referrer: document.referrer });
    busy = true;
    const button = form.querySelector('button[type=submit]');
    button.disabled = true; button.textContent = 'SENDING…';
    try {
      const response = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(20000), credentials: 'omit' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        if (result?.errors) for (const [name, message] of Object.entries(result.errors)) if (fields.includes(name)) fieldError(name, message);
        throw new Error(result?.error || 'We couldn’t send your details just now. Please try again.');
      }
      form.hidden = true;
      const success = document.getElementById('success');
      success.hidden = false; success.focus();
      event('form_submitted_successfully');
      submissionId = crypto.randomUUID();
    } catch (err) {
      error.textContent = err.name === 'TimeoutError' || err.name === 'TypeError' ? 'We couldn’t confirm your submission. Please check your connection and try again — your details are still here.' : err.message;
      form.querySelector('[aria-invalid=true]')?.focus();
    } finally { busy = false; button.disabled = false; button.innerHTML = submitLabel; }
  });
  const video = document.getElementById('showcase');
  const playOverlay = document.getElementById('video-play-overlay');
  const watchExample = document.getElementById('watch-example');

  let played = false;
  let halfway = false;
  let completed = false;

  // The film is always the real video — no placeholder state.
  video.controls = false;

  const startVideo = async () => {
    video.controls = false;

    try {
      if (video.readyState === 0) {
        video.load();
      }

      await video.play();

      if (playOverlay) {
        playOverlay.hidden = true;
      }
    } catch (err) {
      console.error('Could not start example film:', err);

      if (playOverlay) {
        playOverlay.hidden = false;
      }
    }
  };

  if (playOverlay) {
    playOverlay.addEventListener('click', startVideo);
  }

  if (watchExample) {
    watchExample.addEventListener('click', startVideo);
  }

  video.addEventListener('click', () => {
    if (video.paused) {
      startVideo();
    }
  });

  video.addEventListener('play', () => {
    if (playOverlay) playOverlay.hidden = true;

    if (!played) {
      played = true;
      event('example_video_started');
    }
  });

  video.addEventListener('timeupdate', () => {
    if (
      !halfway &&
      video.duration > 0 &&
      video.currentTime / video.duration >= .5
    ) {
      halfway = true;
      event('example_video_50_percent');
    }
  });

  video.addEventListener('ended', () => {
    if (playOverlay) playOverlay.hidden = false;

    if (!completed) {
      completed = true;
      event('example_video_completed');
    }
  });

})();
