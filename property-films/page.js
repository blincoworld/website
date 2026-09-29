(() => {
  'use strict';
  const config = window.PROPERTY_FILMS_CONFIG;
  const form = document.querySelector('#interest-form');
  const error = document.querySelector('#form-error');
  const fields = ['name', 'business_name', 'email', 'phone', 'selected_package', 'callback_date', 'callback_window'];
  const submitButton = form.querySelector('button[type=submit]');
  const submitLabel = submitButton.innerHTML;
  function makeSubmissionId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.floor(Math.random() * 16);

      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var values = new Uint8Array(1);
        window.crypto.getRandomValues(values);
        r = values[0] % 16;
      }

      var v = c === 'x' ? r : (r & 3) | 8;
      return v.toString(16);
    });
  }

  let submissionId = makeSubmissionId(), started = false, busy = false;
  const event = typeof window.propertyFilmsEvent === 'function'
    ? window.propertyFilmsEvent
    : () => {};
  event('page_viewed');
  const modal = document.querySelector('#interest-modal');
  const modalDialog = modal
    ? modal.querySelector('.interest-modal-dialog')
    : null;
  let opened = false;
  let previousFocus = null;

  const callbackDays = document.querySelector('#callback-days');
  const callbackTimes = document.querySelector('#callback-times');

  const callbackSchedule = {
    // Monday
    1: [
      { value: '09:00-10:00', label: '9–10am', startHour: 9 },
      { value: '10:00-11:00', label: '10–11am', startHour: 10 },
      { value: '11:00-12:00', label: '11am–12pm', startHour: 11 }
    ],

    // Tuesday, Wednesday, Thursday
    2: [
      { value: '09:00-10:00', label: '9–10am', startHour: 9 },
      { value: '10:00-11:00', label: '10–11am', startHour: 10 },
      { value: '11:00-12:00', label: '11am–12pm', startHour: 11 },
      { value: '13:00-14:00', label: '1–2pm', startHour: 13 },
      { value: '14:00-15:00', label: '2–3pm', startHour: 14 }
    ],
    3: [
      { value: '09:00-10:00', label: '9–10am', startHour: 9 },
      { value: '10:00-11:00', label: '10–11am', startHour: 10 },
      { value: '11:00-12:00', label: '11am–12pm', startHour: 11 },
      { value: '13:00-14:00', label: '1–2pm', startHour: 13 },
      { value: '14:00-15:00', label: '2–3pm', startHour: 14 }
    ],
    4: [
      { value: '09:00-10:00', label: '9–10am', startHour: 9 },
      { value: '10:00-11:00', label: '10–11am', startHour: 10 },
      { value: '11:00-12:00', label: '11am–12pm', startHour: 11 },
      { value: '13:00-14:00', label: '1–2pm', startHour: 13 },
      { value: '14:00-15:00', label: '2–3pm', startHour: 14 }
    ],

    // Friday
    5: [
      { value: '09:00-10:00', label: '9–10am', startHour: 9 },
      { value: '10:00-11:00', label: '10–11am', startHour: 10 },
      { value: '11:00-12:00', label: '11am–12pm', startHour: 11 }
    ]
  };

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function callbackDayLabel(date) {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  }

  function availableWindowsForDate(date) {
    const daySchedule = callbackSchedule[date.getDay()] || [];
    const now = new Date();

    if (localDateValue(date) !== localDateValue(now)) {
      return daySchedule.slice();
    }

    // Same-day callbacks need at least 30 minutes' notice.
    return daySchedule.filter(function(option) {
      const slotStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        option.startHour,
        0,
        0,
        0
      );

      return slotStart.getTime() - now.getTime() >= 30 * 60 * 1000;
    });
  }

  function makeChoiceButton(label, value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'callback-choice';
    button.textContent = label;
    button.dataset.value = value;
    button.setAttribute('aria-pressed', 'false');
    return button;
  }

  function selectChoice(container, button) {
    container.querySelectorAll('.callback-choice').forEach(function(choice) {
      choice.classList.remove('is-selected');
      choice.setAttribute('aria-pressed', 'false');
    });

    button.classList.add('is-selected');
    button.setAttribute('aria-pressed', 'true');
  }

  function renderCallbackTimes(date) {
    callbackTimes.innerHTML = '';
    form.elements.callback_window.value = '';

    availableWindowsForDate(date).forEach(function(option) {
      const button = makeChoiceButton(option.label, option.value);

      button.addEventListener('click', function() {
        selectChoice(callbackTimes, button);
        form.elements.callback_window.value = option.value;
        form.elements.callback_window.removeAttribute('aria-invalid');
        document.getElementById('callback_window-error').textContent = '';

        if (!started) {
          started = true;
          event('form_started');
        }
      });

      callbackTimes.appendChild(button);
    });
  }

  function renderCallbackPicker() {
    if (!callbackDays || !callbackTimes) return;

    callbackDays.innerHTML = '';
    callbackTimes.innerHTML = '';

    form.elements.callback_date.value = '';
    form.elements.callback_window.value = '';

    const now = new Date();
    const dates = [];
    let candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    while (dates.length < 5) {
      const day = candidate.getDay();
      const windows = availableWindowsForDate(candidate);

      if (day !== 0 && day !== 6 && windows.length) {
        dates.push(new Date(candidate.getTime()));
      }

      candidate.setDate(candidate.getDate() + 1);
    }

    dates.forEach(function(date) {
      const value = localDateValue(date);
      const button = makeChoiceButton(
        callbackDayLabel(date),
        value
      );

      button.addEventListener('click', function() {
        selectChoice(callbackDays, button);
        form.elements.callback_date.value = value;
        form.elements.callback_date.removeAttribute('aria-invalid');
        document.getElementById('callback_date-error').textContent = '';

        renderCallbackTimes(date);

        if (!started) {
          started = true;
          event('form_started');
        }
      });

      callbackDays.appendChild(button);
    });
  }

  renderCallbackPicker();

  function openForm(link) {
    previousFocus = document.activeElement;

    const packageInterest =
      link && link.dataset && link.dataset.package
        ? link.dataset.package
        : 'unsure';
    form.elements.selected_package.value = packageInterest;

    if (link && link.dataset && link.dataset.package) {
      event('package_selected', { package: packageInterest });
    }

    if (!opened) {
      opened = true;
      event('callback_form_opened');
    }

    modal.hidden = false;
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      modal.classList.add('is-open');
      form.elements.name.focus();
    });
  }

  function closeForm() {
    if (!modal || modal.hidden) return;

    modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');

    window.setTimeout(() => {
      modal.hidden = true;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    }, 180);
  }

  document.querySelectorAll('a[href="#enquiry"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      openForm(link);
    });
  });

  if (modal) {
    modal.querySelectorAll('[data-modal-close]').forEach(button => {
      button.addEventListener('click', closeForm);
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && !modal.hidden) {
      closeForm();
    }
  });

  if (modalDialog) {
    modalDialog.addEventListener('click', e => {
      e.stopPropagation();
    });
  }

  form.addEventListener('focusin', () => {
    if (!opened) {
      opened = true;
      event('callback_form_opened');
    }
  });
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
    const invalid = form.querySelector('[aria-invalid=true]');
    if (invalid) { invalid.focus(); return; }
    const params = new URLSearchParams(location.search);
    Object.assign(data, { form_version: 'callback-v2', submission_id: submissionId, source: params.get('utm_source') || params.get('source') || 'property-films', landing_page: location.origin + location.pathname, campaign: params.get('utm_campaign') || '', referrer: document.referrer });
    busy = true;
    const button = form.querySelector('button[type=submit]');
    button.disabled = true; button.textContent = 'SENDING…';
    try {
      const response = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(20000), credentials: 'omit' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || !result.success) {
        if (result && result.errors) {
          for (const [name, message] of Object.entries(result.errors)) {
            if (fields.includes(name)) fieldError(name, message);
          }
        }
        throw new Error(
          result && result.error
            ? result.error
            : 'We couldn’t send your details just now. Please try again.'
        );
      }
      event('form_submitted_successfully', { package: data.selected_package });
      event('callback_submitted', { package: data.selected_package });
      try { sessionStorage.setItem('property-films-callback', JSON.stringify({ package: data.selected_package, at: Date.now() })); } catch {}
      window.location.assign('/property-films/next-steps/#callback=' + encodeURIComponent(data.selected_package));
    } catch (err) {
      error.textContent = err.name === 'TimeoutError' || err.name === 'TypeError' ? 'We couldn’t confirm your submission. Please check your connection and try again — your details are still here.' : err.message;
      const firstInvalid = form.querySelector('[aria-invalid=true]');
      if (firstInvalid) firstInvalid.focus();
    } finally { busy = false; button.disabled = false; button.innerHTML = submitLabel; }
  });
  const video = document.getElementById('showcase');
  const playOverlay = document.getElementById('video-play-overlay');
  const watchExample = document.getElementById('watch-example');

  let played = false;
  let halfway = false;
  let completed = false;

  // The film is always the real video — no placeholder state.
  const startVideo = async () => {

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
