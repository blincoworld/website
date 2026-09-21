(() => {
  'use strict';

  const panel = document.querySelector('[data-production-availability]');
  if (!panel) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  /*
   * Calendar-driven production availability.
   * Starts at 9 available and progressively reduces to 1.
   * It never represents confirmed bookings; it represents the
   * production capacity we are making available at this point
   * in the current month.
   */
  const progress = (day - 1) / Math.max(daysInMonth - 1, 1);
  const used = 1 + Math.floor(progress * 8);
  const available = 10 - used;

  const monthName = new Intl.DateTimeFormat('en-GB', {
    month: 'long'
  }).format(now);

  panel.querySelector('[data-availability-month]').textContent = monthName;
  panel.querySelector('[data-availability-count]').textContent = available;
  panel.querySelector('[data-availability-text]').textContent =
    available === 1
      ? `production slot still available for ${monthName}.`
      : `production slots still available for ${monthName}.`;

  panel.querySelectorAll('.production-availability-slots span')
    .forEach((slot, index) => {
      slot.classList.toggle('is-used', index < used);
    });
})();
