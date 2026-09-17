import { checkoutConfig } from '../packages/checkout-config.mjs?v=live-20260914';

const buttons = [...document.querySelectorAll('[data-checkout]')];
const errorBox = document.querySelector('#checkout-error');
const errorMessage = errorBox.querySelector('[data-error-message]');

let busy = false;
const retryKeys = new Map();

function setButtonsDisabled(disabled) {
  buttons.forEach(button => {
    button.disabled = disabled;
  });
}

async function openCheckout(button) {
  if (busy) return;

  const packageName = button.dataset.checkout;

  if (!['essential', 'signature'].includes(packageName)) return;

  const state = {
    package: packageName,
    propertyCount: 1,
    seasonal: false
  };

  const stateKey = JSON.stringify(state);

  if (!retryKeys.has(stateKey)) {
    retryKeys.set(stateKey, crypto.randomUUID());
  }

  const originalLabel = button.textContent;

  busy = true;
  setButtonsDisabled(true);
  errorBox.hidden = true;

  button.textContent = 'Opening secure checkout…';

  try {
    const response = await fetch(checkoutConfig.apiUrl, {
      method: 'POST',
      credentials: 'omit',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': retryKeys.get(stateKey)
      },
      body: stateKey
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || 'Unable to open secure checkout. Please try again.'
      );
    }

    if (
      !result.checkoutUrl ||
      new URL(result.checkoutUrl).origin !== 'https://checkout.stripe.com'
    ) {
      throw new Error('Unable to open secure checkout. Please try again.');
    }

    window.location.assign(result.checkoutUrl);

  } catch (error) {
    errorMessage.textContent =
      error.name === 'TimeoutError' || error instanceof TypeError
        ? "We couldn't connect to secure checkout. Please try again."
        : error.message;

    errorBox.hidden = false;
    errorBox.focus({ preventScroll: true });
    errorBox.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'center'
    });

    busy = false;
    setButtonsDisabled(false);
    button.textContent = originalLabel;
  }
}

buttons.forEach(button => {
  button.addEventListener('click', () => openCheckout(button));
});
