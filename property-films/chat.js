(() => {
  'use strict';

  const config = window.PROPERTY_FILMS_CONFIG || {};

  const apiUrl =
    config.chatApiUrl ||
    (config.apiUrl
      ? config.apiUrl.replace(/\/submit(?:\?.*)?$/, '/chat')
      : '');

  const launcher = document.querySelector('#property-chat-launcher');
  const panel = document.querySelector('#property-chat');
  const closeButton = document.querySelector('#property-chat-close');
  const messages = document.querySelector('#property-chat-messages');
  const form = document.querySelector('#property-chat-form');
  const input = document.querySelector('#property-chat-input');
  const sendButton = document.querySelector('#property-chat-send');

  if (
    !apiUrl ||
    !launcher ||
    !panel ||
    !closeButton ||
    !messages ||
    !form ||
    !input ||
    !sendButton
  ) {
    return;
  }

  const STORAGE_KEY = 'property-films-chat-history';
  const MAX_STORED_MESSAGES = 20;

  const SESSION_KEY='property-films-marketing-session';
  let marketingSession=sessionStorage.getItem(SESSION_KEY)||'';
  let marketingCard=null;
  let callbackActive=false;
  let history = [];
  let busy = false;
  let openedOnce = false;

  function loadHistory() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));

      if (!Array.isArray(stored)) return [];

      return stored
        .filter(item =>
          item &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          item.content.trim()
        )
        .slice(-MAX_STORED_MESSAGES);
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(history.slice(-MAX_STORED_MESSAGES))
      );
    } catch {}
  }

  function restoreHistory() {
    const stored = loadHistory();

    if (!stored.length) return;

    history = stored;

    messages.innerHTML = '';

    for (const item of history) {
      addMessage(item.role, item.content);
    }
  }

  function track(name, data = {}) {
    if (typeof window.propertyFilmsEvent === 'function') {
      window.propertyFilmsEvent(name, data);
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }

  function openChat() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');

    requestAnimationFrame(() => {
      panel.classList.add('is-open');
      input.focus();
      scrollToBottom();
    });

    if (!openedOnce) {
      openedOnce = true;
      track('chat_opened');
    }
  }

  function closeChat() {
    panel.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');

    window.setTimeout(() => {
      panel.hidden = true;
    }, 180);

    launcher.focus();
  }

  function addMessage(role, text) {
    const row = document.createElement('div');
    row.className = `property-chat-message property-chat-message-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'property-chat-bubble';
    bubble.textContent = text;

    row.appendChild(bubble);
    messages.appendChild(row);
    scrollToBottom();

    return row;
  }

  function addTyping() {
    const row = document.createElement('div');
    row.className =
      'property-chat-message property-chat-message-assistant property-chat-typing';

    row.setAttribute('aria-label', 'Property Films assistant is typing');

    row.innerHTML = `
      <div class="property-chat-bubble">
        <span></span><span></span><span></span>
      </div>
    `;

    messages.appendChild(row);
    scrollToBottom();

    return row;
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    sendButton.disabled = value;

    if (!value) {
      input.focus();
    }
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2)
    );
  }

  function callbackAvailabilityUrl() {
    return config.apiUrl.replace(
      /\/submit(?:\?.*)?$/,
      '/callback-availability'
    );
  }

  function checkoutUrl() {
    return config.apiUrl.replace(
      /\/submit(?:\?.*)?$/,
      '/checkout'
    );
  }

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function callbackDayLabel(date) {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  }

  const callbackSchedule = {
    1: [
      { value: '09:00-10:00', label: '9–10am', startHour: 9 },
      { value: '10:00-11:00', label: '10–11am', startHour: 10 },
      { value: '11:00-12:00', label: '11am–12pm', startHour: 11 }
    ],
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
    5: [
      { value: '09:00-10:00', label: '9–10am', startHour: 9 },
      { value: '10:00-11:00', label: '10–11am', startHour: 10 },
      { value: '11:00-12:00', label: '11am–12pm', startHour: 11 }
    ]
  };

  function availableWindowsForDate(date, occupied) {
    const schedule = callbackSchedule[date.getDay()] || [];
    const now = new Date();
    const dateValue = localDateValue(date);

    return schedule.filter(option => {
      if (occupied[`${dateValue}|${option.value}`]) {
        return false;
      }

      if (dateValue !== localDateValue(now)) {
        return true;
      }

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

  function addActionContainer() {
    const wrap = document.createElement('div');
    wrap.className = 'property-chat-action-wrap';

    messages.appendChild(wrap);
    scrollToBottom();

    return wrap;
  }

  function field(label, name, type, placeholder, autocomplete) {
    const wrap = document.createElement('label');
    wrap.className = 'property-chat-action-field';

    const title = document.createElement('span');
    title.textContent = label;

    const input = document.createElement('input');
    input.name = name;
    input.type = type;
    input.placeholder = placeholder;
    input.autocomplete = autocomplete;
    input.required = true;

    const error = document.createElement('small');
    error.className = 'property-chat-action-error';

    wrap.append(title, input, error);

    return wrap;
  }

  
function propertyFilmsVisitorId() {
  try {
    let visitorId =
      localStorage.getItem('property_films_visitor_id') || '';

    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem(
        'property_films_visitor_id',
        visitorId
      );
    }

    return visitorId;
  } catch {
    return '';
  }
}

function formatCallbackBooking(booking) {
  const date = new Date(booking.date + 'T12:00:00');

  const prettyDate = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const selectedOption =
    Object.values(callbackSchedule)
      .flat()
      .find(option => option.value === booking.window);

  return {
    prettyDate,
    prettyWindow: selectedOption?.label || booking.window
  };
}

function renderExistingCallbackBooking(booking) {
  const wrap = document.createElement('div');
  wrap.className = 'property-chat-action-wrap';

  const card = document.createElement('div');
  card.className = 'property-chat-action-card';

  const formatted = formatCallbackBooking(booking);

  card.innerHTML = `
    <div class="property-chat-action-title">
      You’re already booked in
    </div>
    <div class="property-chat-action-copy">
      Piers will call you on ${formatted.prettyDate},
      ${formatted.prettyWindow}.
    </div>
    <button
      type="button"
      class="property-chat-action-primary property-chat-change-time"
    >
      Change time
    </button>
  `;

  card
    .querySelector('.property-chat-change-time')
    .addEventListener('click', () => {
      wrap.remove();
      renderCallbackChangeAction();
    });

  wrap.appendChild(card);
  messages.appendChild(wrap);
  scrollToBottom();
}


async function renderCallbackChangeAction() {
  const wrap = addActionContainer();

  wrap.innerHTML = `
    <div class="property-chat-action-card">
      <div class="property-chat-action-title">
        Change callback time
      </div>
      <div class="property-chat-action-copy">
        Choose a new day and time below.
      </div>
      <div class="property-chat-action-loading">
        Checking callback availability…
      </div>
    </div>
  `;

  const card =
    wrap.querySelector('.property-chat-action-card');

  let occupied = {};
  let existingBooking = null;

  try {
    const response = await fetch(
      callbackAvailabilityUrl() +
        '?from=' +
        encodeURIComponent(localDateValue(new Date())) +
        '&visitor_id=' +
        encodeURIComponent(propertyFilmsVisitorId()),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error('Availability request failed');
    }

    const data = await response.json();

    existingBooking = data.existingCallback || null;

    if (!existingBooking) {
      wrap.remove();
      renderCallbackAction();
      return;
    }

    for (const slot of data.occupied || []) {
      if (
        slot &&
        slot.date &&
        slot.window &&
        !(
          slot.date === existingBooking.date &&
          slot.window === existingBooking.window
        )
      ) {
        occupied[`${slot.date}|${slot.window}`] = true;
      }
    }
  } catch (error) {
    console.error(
      'Could not load callback availability:',
      error
    );
  }

  card.querySelector(
    '.property-chat-action-loading'
  ).remove();

  const picker = document.createElement('div');
  picker.className = 'property-chat-callback-picker';

  const dayLabel = document.createElement('div');
  dayLabel.className = 'property-chat-action-label';
  dayLabel.textContent = 'Choose a day';

  const days = document.createElement('div');
  days.className = 'property-chat-action-options';

  const timeLabel = document.createElement('div');
  timeLabel.className = 'property-chat-action-label';
  timeLabel.textContent = 'Choose a time';

  const times = document.createElement('div');
  times.className = 'property-chat-action-options';

  const pickerError = document.createElement('div');
  pickerError.className = 'property-chat-action-error';

  let selectedDate = '';
  let selectedWindow = '';

  function selectButton(container, button) {
    container
      .querySelectorAll('button')
      .forEach(item =>
        item.classList.remove('is-selected')
      );

    button.classList.add('is-selected');
  }

  function renderTimes(date) {
    times.innerHTML = '';
    selectedWindow = '';
    pickerError.textContent = '';

    for (
      const option of
      availableWindowsForDate(date, occupied)
    ) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className =
        'property-chat-action-choice';
      button.textContent = option.label;

      button.addEventListener('click', () => {
        selectButton(times, button);
        selectedWindow = option.value;
        pickerError.textContent = '';
      });

      times.appendChild(button);
    }
  }

  const now = new Date();
  const dates = [];

  let candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  while (dates.length < 5) {
    const windows =
      availableWindowsForDate(candidate, occupied);

    if (
      candidate.getDay() !== 0 &&
      candidate.getDay() !== 6 &&
      windows.length
    ) {
      dates.push(new Date(candidate.getTime()));
    }

    candidate.setDate(candidate.getDate() + 1);
  }

  for (const date of dates) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className =
      'property-chat-action-choice';
    button.textContent = callbackDayLabel(date);

    button.addEventListener('click', () => {
      selectButton(days, button);
      selectedDate = localDateValue(date);
      pickerError.textContent = '';
      renderTimes(date);
    });

    days.appendChild(button);
  }

  picker.append(
    dayLabel,
    days,
    timeLabel,
    times,
    pickerError
  );

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'property-chat-action-primary';
  submit.textContent = 'Change my callback';

  const formError = document.createElement('div');
  formError.className =
    'property-chat-action-error property-chat-action-form-error';

  card.append(picker, submit, formError);

  submit.addEventListener('click', async () => {
    formError.textContent = '';

    if (!selectedDate || !selectedWindow) {
      pickerError.textContent =
        'Please choose a callback day and time.';
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Changing…';

    try {
      const response = await fetch(
        config.apiUrl.replace(
          /\/submit(?:\?.*)?$/,
          '/callback-reschedule'
        ),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            visitor_id: propertyFilmsVisitorId(),
            callback_date: selectedDate,
            callback_window: selectedWindow
          }),
          signal: AbortSignal.timeout(20000),
          credentials: 'omit'
        }
      );

      const result =
        await response.json().catch(() => null);

      if (
        !response.ok ||
        !result ||
        !result.success
      ) {
        throw new Error(
          result?.error ||
          'We couldn’t change your callback just now.'
        );
      }

      const booking = {
        date: selectedDate,
        window: selectedWindow
      };

      const formatted =
        formatCallbackBooking(booking);

      wrap.innerHTML = `
        <div class="property-chat-action-card property-chat-action-success">
          <div class="property-chat-action-title">
            Callback changed
          </div>
          <div class="property-chat-action-copy">
            Piers will now call you on ${formatted.prettyDate},
            ${formatted.prettyWindow}.
          </div>
        </div>
      `;

      history.push({
        role: 'assistant',
        content:
          `Callback changed to ${formatted.prettyDate}, ${formatted.prettyWindow}.`
      });

      saveHistory();
      scrollToBottom();

    } catch (error) {
      formError.textContent =
        error.name === 'TimeoutError' ||
        error instanceof TypeError
          ? 'We couldn’t confirm the change. Please check your connection and try again.'
          : error.message;

      submit.disabled = false;
      submit.textContent = 'Change my callback';
    }
  });

  scrollToBottom();
}

async function renderCallbackAction() {
    const wrap = addActionContainer();

    wrap.innerHTML = `
      <div class="property-chat-action-card">
        <div class="property-chat-action-title">
          Arrange a callback
        </div>
        <div class="property-chat-action-copy">
          Leave your details and choose a convenient time for Piers to call.
        </div>
        <div class="property-chat-action-loading">
          Checking callback availability…
        </div>
      </div>
    `;

    const card = wrap.querySelector('.property-chat-action-card');

    let occupied = {};

    try {
      const response = await fetch(
        callbackAvailabilityUrl() +
          '?from=' +
          encodeURIComponent(localDateValue(new Date())) +
          '&visitor_id=' +
          encodeURIComponent(propertyFilmsVisitorId()),
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        }
      );

      if (!response.ok) {
        throw new Error('Availability request failed');
      }

      const data = await response.json();

      if (data.existingCallback) {
        wrap.remove();
        renderExistingCallbackBooking(
          data.existingCallback
        );
        return;
      }

      for (const slot of data.occupied || []) {
        if (slot && slot.date && slot.window) {
          occupied[`${slot.date}|${slot.window}`] = true;
        }
      }

    } catch (error) {
      console.error(
        'Could not load callback availability:',
        error
      );
    }

    const bookingForm = document.createElement('form');
    bookingForm.className = 'property-chat-callback-form';
    bookingForm.noValidate = true;

    const fields = document.createElement('div');
    fields.className = 'property-chat-action-fields';

    fields.append(
      field(
        'Your name',
        'name',
        'text',
        'Jane Smith',
        'name'
      ),
      field(
        'Business / property',
        'business_name',
        'text',
        'Oak Tree Cottages',
        'organization'
      ),
      field(
        'Email',
        'email',
        'email',
        'jane@example.com',
        'email'
      ),
      field(
        'Phone',
        'phone',
        'tel',
        '07123 456789',
        'tel'
      )
    );

    const picker = document.createElement('div');
    picker.className = 'property-chat-callback-picker';

    const dayLabel = document.createElement('div');
    dayLabel.className = 'property-chat-action-label';
    dayLabel.textContent = 'Choose a day';

    const days = document.createElement('div');
    days.className = 'property-chat-action-options';

    const timeLabel = document.createElement('div');
    timeLabel.className = 'property-chat-action-label';
    timeLabel.textContent = 'Choose a time';

    const times = document.createElement('div');
    times.className = 'property-chat-action-options';

    let selectedDate = '';
    let selectedWindow = '';

    const pickerError = document.createElement('div');
    pickerError.className = 'property-chat-action-error';

    function selectButton(container, button) {
      container
        .querySelectorAll('button')
        .forEach(item => item.classList.remove('is-selected'));

      button.classList.add('is-selected');
    }

    function renderTimes(date) {
      times.innerHTML = '';
      selectedWindow = '';
      pickerError.textContent = '';

      for (
        const option of availableWindowsForDate(date, occupied)
      ) {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'property-chat-action-choice';
        button.textContent = option.label;

        button.addEventListener('click', () => {
          selectButton(times, button);
          selectedWindow = option.value;
          pickerError.textContent = '';
        });

        times.appendChild(button);
      }
    }

    const now = new Date();
    const dates = [];

    let candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    while (dates.length < 5) {
      const windows =
        availableWindowsForDate(candidate, occupied);

      if (
        candidate.getDay() !== 0 &&
        candidate.getDay() !== 6 &&
        windows.length
      ) {
        dates.push(new Date(candidate.getTime()));
      }

      candidate.setDate(candidate.getDate() + 1);
    }

    for (const date of dates) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'property-chat-action-choice';
      button.textContent = callbackDayLabel(date);

      button.addEventListener('click', () => {
        selectButton(days, button);
        selectedDate = localDateValue(date);
        pickerError.textContent = '';
        renderTimes(date);
      });

      days.appendChild(button);
    }

    picker.append(
      dayLabel,
      days,
      timeLabel,
      times,
      pickerError
    );

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'property-chat-action-primary';
    submit.textContent = 'Book my callback';

    const formError = document.createElement('div');
    formError.className =
      'property-chat-action-error property-chat-action-form-error';

    bookingForm.append(
      fields,
      picker,
      submit,
      formError
    );

    card.querySelector(
      '.property-chat-action-loading'
    ).remove();

    card.appendChild(bookingForm);

    bookingForm.addEventListener('submit', async event => {
      event.preventDefault();

      formError.textContent = '';

      const data =
        Object.fromEntries(new FormData(bookingForm));

      let firstInvalid = null;

      bookingForm
        .querySelectorAll('.property-chat-action-field')
        .forEach(wrap => {
          const input = wrap.querySelector('input');
          const error = wrap.querySelector('small');

          input.value = input.value.trim();
          data[input.name] = input.value;
          error.textContent = '';
          input.removeAttribute('aria-invalid');

          if (!input.value) {
            error.textContent = 'Please complete this field.';
            input.setAttribute('aria-invalid', 'true');
            firstInvalid ||= input;
          }
        });

      if (
        data.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
      ) {
        const input = bookingForm.elements.email;
        const error =
          input.closest('label').querySelector('small');

        error.textContent =
          'Please enter a valid email address.';
        input.setAttribute('aria-invalid', 'true');
        firstInvalid ||= input;
      }

      if (
        data.phone &&
        (
          !/^[+\d\s().-]+$/.test(data.phone) ||
          data.phone.replace(/\D/g, '').length < 7
        )
      ) {
        const input = bookingForm.elements.phone;
        const error =
          input.closest('label').querySelector('small');

        error.textContent =
          'Please enter a valid phone number.';
        input.setAttribute('aria-invalid', 'true');
        firstInvalid ||= input;
      }

      if (!selectedDate || !selectedWindow) {
        pickerError.textContent =
          'Please choose a callback day and time.';
      }

      if (
        firstInvalid ||
        !selectedDate ||
        !selectedWindow
      ) {
        firstInvalid?.focus();
        return;
      }

      const params = new URLSearchParams(location.search);

      Object.assign(data, {
        visitor_id: propertyFilmsVisitorId(),
        callback_date: selectedDate,
        callback_window: selectedWindow,
        selected_package: 'unsure',
        cta_source: 'chat',
        form_version: 'callback-v2',
        chat_session_id:marketingSession,
        submission_id: makeId(),
        source:
          params.get('utm_source') ||
          params.get('source') ||
          'property-films',
        landing_page:
          location.origin + location.pathname,
        campaign:
          params.get('utm_campaign') || '',
        referrer: document.referrer
      });

      submit.disabled = true;
      submit.textContent = 'Booking…';

      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(20000),
          credentials: 'omit'
        });

        const result =
          await response.json().catch(() => null);

        if (
          !response.ok ||
          !result ||
          !result.success
        ) {
          throw new Error(
            result?.error ||
            'We couldn’t book your callback just now. Please try again.'
          );
        }

        track('form_submitted_successfully', {
          package: data.selected_package
        });

        callbackActive=false;
        track('callback_submitted', {
          package: data.selected_package
        });

        const date = new Date(
          selectedDate + 'T12:00:00'
        );

        const prettyDate =
          date.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          });

        const selectedOption =
          Object.values(callbackSchedule)
            .flat()
            .find(
              option =>
                option.value === selectedWindow
            );

        const prettyTime =
          selectedOption?.label || selectedWindow;

        wrap.innerHTML = `
          <div class="property-chat-action-card property-chat-action-success">
            <div class="property-chat-action-title">
              Callback booked
            </div>
            <div class="property-chat-action-copy">
              Piers will call you on ${prettyDate}, ${prettyTime}.
            </div>
          </div>
        `;

        addMessage(
          'assistant',
          `Perfect — you're booked in. Piers will call you on ${prettyDate}, ${prettyTime}.`
        );

        history.push({
          role: 'assistant',
          content:
            `Callback booked for ${prettyDate}, ${prettyTime}.`
        });

        saveHistory();

        scrollToBottom();

      } catch (error) {
        formError.textContent =
          error.name === 'TimeoutError' ||
          error instanceof TypeError
            ? 'We couldn’t confirm your callback. Please check your connection and try again.'
            : error.message;

      } finally {
        submit.disabled = false;
        submit.textContent = 'Book my callback';
      }
    });

    scrollToBottom();
  }

  function packageDetails(key, propertyCount) {
    const count = Number(propertyCount);

    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 20
    ) {
      return null;
    }

    const packages = {
      essential: {
        name: 'Property Film',
        basePrice: 495,
        additionalPrice: 195
      },
      signature: {
        name: 'Property Film + Social',
        basePrice: 795,
        additionalPrice: 295
      },
      content: {
        name: 'Property Film + Content',
        basePrice: 1495,
        additionalPrice: null
      }
    };

    const details = packages[key];

    if (!details) {
      return null;
    }

    if (key === 'content' && count !== 1) {
      return null;
    }

    const total =
      details.basePrice +
      (count - 1) * (details.additionalPrice || 0);

    return {
      ...details,
      propertyCount: count,
      total,
      price: new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0
      }).format(total)
    };
  }

  function renderCheckoutAction(data) {
    const details =
      packageDetails(data.package, data.propertyCount);

    if (!details) {
      return;
    }

    const count = details.propertyCount;

    const propertyLabel =
      count === 1
        ? '1 property'
        : `${count} properties`;

    const wrap = addActionContainer();

    wrap.innerHTML = `
      <div class="property-chat-action-card">
        <div class="property-chat-action-title">
          ${details.name}
        </div>
        <div class="property-chat-checkout-price">
          ${details.price}
        </div>
        <div class="property-chat-action-copy">
          ${propertyLabel}. Secure checkout. You're covered by the Love Your Film Guarantee.
        </div>
        <button
          type="button"
          class="property-chat-action-primary"
        >
          Reserve my production slot
        </button>
        <div class="property-chat-action-error property-chat-action-form-error"></div>
      </div>
    `;

    const button =
      wrap.querySelector('.property-chat-action-primary');

    const error =
      wrap.querySelector('.property-chat-action-form-error');

    button.addEventListener('click', async () => {
      if (button.disabled) return;

      button.disabled = true;
      button.textContent = 'Opening secure checkout…';
      error.textContent = '';

      track('checkout_started', {
        package: data.package,
        property_count: count,
        value: details.total
      });

      try {
        const response = await fetch(checkoutUrl(), {
          method: 'POST',
          credentials: 'omit',
          signal: AbortSignal.timeout(30000),
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': makeId()
          },
          body: JSON.stringify({
            package: data.package,
            propertyCount: count,
            seasonal: false,
            funnel_source: 'chat'
          })
        });

        const result =
          await response.json().catch(() => null);

        if (!response.ok || !result) {
          throw new Error(
            result?.error ||
            'Unable to open secure checkout. Please try again.'
          );
        }

        if (
          !result.checkoutUrl ||
          new URL(result.checkoutUrl).origin !==
            'https://checkout.stripe.com'
        ) {
          throw new Error(
            'Unable to open secure checkout. Please try again.'
          );
        }

        window.location.assign(result.checkoutUrl);

      } catch (checkoutError) {
        error.textContent =
          checkoutError.name === 'TimeoutError' ||
          checkoutError instanceof TypeError
            ? 'We couldn’t connect to secure checkout. Please try again.'
            : checkoutError.message;

        button.disabled = false;
        button.textContent =
          'Reserve my production slot';
      }
    });

    scrollToBottom();
  }

  function rememberMarketingSession(data) {
    if(data.sessionId){marketingSession=data.sessionId;try{sessionStorage.setItem(SESSION_KEY,marketingSession);}catch{}}
  }
  function renderMarketing(data) {
    if(!data.marketingOffer && data.action!=='marketing_email')return;
    if(marketingCard?.isConnected)return;
    const wrap=addActionContainer();
    marketingCard=wrap;
    const card=document.createElement('div');card.className='property-chat-action-card';wrap.append(card);
    const offer=data.marketingOffer||{};
    const copy=document.createElement('p');copy.textContent=offer.offer||'What email address would you like me to use?';card.append(copy);
    const wording=document.createElement('p');wording.textContent=offer.wording||data.wording;card.append(wording);
    const error=document.createElement('p');error.setAttribute('role','status');card.append(error);
    const controls=document.createElement('div');card.append(controls);
    async function decide(action,email){
      if(busy)return;
      setBusy(true);error.textContent='';
      try {
        const response=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:marketingSession,marketingAction:action,email})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'Please try again.');
        rememberMarketingSession(result);
        if(result.action==='marketing_email'){showEmail();copy.textContent=result.reply;}
        else {wrap.remove();marketingCard=null;addMessage('assistant',result.reply);history.push({role:'assistant',content:result.reply});saveHistory();}
      }catch(e){error.textContent=e.message;}finally{setBusy(false);}
    }
    function showEmail(){
      controls.replaceChildren();
      const capture=document.createElement('form'),label=document.createElement('label'),field=document.createElement('input'),submit=document.createElement('button');
      label.className='property-chat-action-field';const title=document.createElement('span');title.textContent='Email address';label.append(title);field.type='email';field.required=true;field.maxLength=254;field.autocomplete='email';field.name='marketing_email';label.append(field);
      submit.type='submit';submit.className='property-chat-action-primary';submit.textContent='Subscribe to updates';capture.append(label,submit);controls.append(capture);
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='No thanks';cancel.addEventListener('click',()=>decide('decline'));controls.append(cancel);
      capture.addEventListener('submit',e=>{e.preventDefault();if(capture.reportValidity())decide('email',field.value);});
      field.focus();
    }
    if(data.action==='marketing_email')showEmail();
    else {
      const accept=document.createElement('button');accept.type='button';accept.className='property-chat-action-primary';accept.textContent=offer.email?'Yes — use '+offer.email:'Yes, keep me updated';accept.addEventListener('click',()=>decide('accept',offer.email));
      const decline=document.createElement('button');decline.type='button';decline.textContent='No thanks';decline.addEventListener('click',()=>decide('decline'));controls.append(accept,decline);
    }
    scrollToBottom();
  }

  function handleSalesAction(data) {
    if (data.action === 'callback') {
      callbackActive=true;
      marketingCard?.remove();marketingCard=null;
      renderCallbackAction();
      return;
    }

    if (data.action === 'callback_change') {
      callbackActive=true;
      marketingCard?.remove();marketingCard=null;
      renderCallbackChangeAction();
      return;
    }

    if (data.action === 'checkout') {
      renderCheckoutAction(data);
    }
  }

  async function sendMessage(message) {
    if (!message || busy) return;

    const previousHistory = history.slice();

    addMessage('user', message);

    history.push({
      role: 'user',
      content: message
    });

    saveHistory();

    track('chat_message_sent');

    input.value = '';
    input.style.height = 'auto';

    setBusy(true);
    const typing = addTyping();

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          history: previousHistory,
          sessionId:marketingSession,
          callbackActive
        })
      });

      let data = {};

      try {
        data = await response.json();
      } catch (_) {}

      typing.remove();

      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Chat request failed');
      }

      rememberMarketingSession(data);
      addMessage('assistant', data.reply);

      handleSalesAction(data);
      renderMarketing(data);

      history.push({
        role: 'assistant',
        content: data.reply
      });

      saveHistory();

      track('chat_reply_received');

    } catch (error) {
      typing.remove();

      addMessage(
        'assistant',
        'Sorry, I’m having trouble answering right now. You can still use Tell Me More below and we’ll get back to you.'
      );

      track('chat_error');
      console.error('Property Films chat error:', error);

    } finally {
      setBusy(false);
    }
  }

  restoreHistory();

  launcher.addEventListener('click', () => {
    if (panel.hidden) {
      openChat();
    } else {
      closeChat();
    }
  });

  closeButton.addEventListener('click', closeChat);

  form.addEventListener('submit', event => {
    event.preventDefault();

    const message = input.value.trim();

    if (!message) return;

    sendMessage(message);
  });

  input.addEventListener('keydown', event => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height =
      Math.min(input.scrollHeight, 120) + 'px';
  });

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      !panel.hidden
    ) {
      closeChat();
    }
  });

})();
