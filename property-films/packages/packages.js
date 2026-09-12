import { selectPackage, money } from './catalog.mjs';
const preview = document.querySelector('#checkout-preview');
for (const card of document.querySelectorAll('[data-package]')) {
  const checkbox = card.querySelector('input');
  const button = card.querySelector('[data-choose]');
  const count = card.querySelector('[data-property-count]');
  const selection = () => selectPackage(card.dataset.package, checkbox.checked, count ? Number(count.value) : 1);
  function update() {
    const chosen = selection();
    card.querySelector('[data-total]').textContent = money(chosen.total);
    card.querySelector('[data-total-label]').textContent = checkbox.checked ? 'Total with Seasonal' : 'Package total';
    card.querySelector('[data-breakdown]').textContent = checkbox.checked ? `${money(chosen.lineItems[0].amount)} package + ${money(chosen.lineItems[1].amount)} seasonal` : (count ? `${chosen.propertyCount} ${chosen.propertyCount === 1 ? 'property' : 'properties'} · base package only` : 'Base package only');
    preview.hidden = true;
  }
  function onChange() {
    update();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) card.querySelector('[data-total]').animate([{ opacity: .4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180 });
  }
  checkbox.addEventListener('change', onChange);
  count?.addEventListener('change', onChange);
  button.disabled = false;
  update();
  button.addEventListener('click', () => {
    const chosen = selection();
    // TODO: send only packageKey, propertyCount and seasonal to a server checkout endpoint.
    // Server must validate the selection and calculate the property pricing and map the selection to real Stripe
    // Price IDs. Never trust browser amounts; no payment request is made here.
    preview.querySelector('[data-preview]').textContent = `${chosen.name}${count ? ` (${chosen.propertyCount} ${chosen.propertyCount === 1 ? 'property' : 'properties'})` : ''}${chosen.seasonal ? ' + Seasonal content (four refreshes over 12 months)' : ' — base package only'}: ${money(chosen.total)}.`;
    preview.hidden = false;
    preview.focus({ preventScroll: true });
    preview.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  });
}
