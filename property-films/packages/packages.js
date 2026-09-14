import { selectPackage, money } from './catalog.mjs';
import { checkoutConfig } from './checkout-config.mjs';
const preview = document.querySelector('#checkout-preview');
let busy = false;
const retryKeys = new Map();
if (checkoutConfig.enabled) document.querySelector('.package-note').textContent = 'Secure checkout — payment is processed by Stripe.';
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
  button.addEventListener('click', async () => {
    if (busy) return;
    const chosen = selection();
    if (checkoutConfig.enabled) {
      busy = true;
      const buttons = [...document.querySelectorAll('[data-choose]')];
      buttons.forEach(b => b.disabled = true);
      const label = button.textContent;
      button.textContent = 'Opening secure checkout…';
      const state = { package: card.dataset.package === 'multi-property' ? 'multi' : card.dataset.package, propertyCount: chosen.propertyCount, seasonal: chosen.seasonal };
      const stateKey = JSON.stringify(state);
      if (!retryKeys.has(stateKey)) retryKeys.set(stateKey, crypto.randomUUID());
      try {
        const response = await fetch(checkoutConfig.apiUrl, {
          method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(30000),
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': retryKeys.get(stateKey) },
          body: stateKey,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to open secure checkout. Please try again.');
        if (!result.checkoutUrl || new URL(result.checkoutUrl).origin !== 'https://checkout.stripe.com') throw new Error('Unable to open secure checkout. Please try again.');
        window.location.assign(result.checkoutUrl);
        return;
      } catch (error) {
        preview.querySelector('[data-preview]').textContent = error.name === 'TimeoutError' || error instanceof TypeError
          ? 'We couldn’t connect to secure checkout. Please try again; your selection has been kept.' : error.message;
        preview.querySelector('h2').textContent = 'Checkout could not open';
        preview.querySelector('[data-preview]').nextElementSibling.hidden = true;
        preview.hidden = false;
        preview.focus({ preventScroll: true });
        preview.scrollIntoView({ block: 'center' });
      } finally {
        busy = false;
        buttons.forEach(b => b.disabled = false);
        button.textContent = label;
      }
      return;
    }
    preview.querySelector('[data-preview]').textContent = `${chosen.name}${count ? ` (${chosen.propertyCount} ${chosen.propertyCount === 1 ? 'property' : 'properties'})` : ''}${chosen.seasonal ? ' + Seasonal content (four refreshes over 12 months)' : ' — base package only'}: ${money(chosen.total)}.`;
    preview.hidden = false;
    preview.focus({ preventScroll: true });
    preview.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  });
}
