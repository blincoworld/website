import { checkoutConfig } from '../packages/checkout-config.mjs';
const label = document.querySelector('#payment-label');
const message = document.querySelector('#payment-message');
const id = new URLSearchParams(location.search).get('session_id');
try {
  if (!/^cs_test_[A-Za-z0-9]+$/.test(id || '')) throw new Error('We couldn’t find a valid payment reference. Please check the link from Checkout.');
  const response = await fetch(`${checkoutConfig.apiUrl}-status?session_id=${encodeURIComponent(id)}`, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('We couldn’t check your payment just now. Please refresh this page or contact us before trying another payment.');
  const result = await response.json();
  if (!result.paid) throw new Error('Your payment has not been confirmed yet. Please refresh this page shortly or contact us for help.');
  label.textContent = 'PAYMENT RECEIVED';
  message.textContent = 'Thank you — your Property Films order is confirmed.';
  // The high-entropy Session reference is a capability, never a trusted purchase description.
  // Keep it out of intake HTTP URLs/referrers; intake exchanges it for a short-lived token.
  document.querySelector('#intake-link').href = `/property-films/intake#session_id=${encodeURIComponent(id)}`;
  document.querySelector('#confirmed').hidden = false;
  document.querySelector('#test-note').hidden = !result.testMode;
} catch (error) {
  label.textContent = 'PAYMENT CONFIRMATION';
  message.textContent = error instanceof TypeError || error.name === 'TimeoutError' ? 'We couldn’t check your payment. Please refresh or contact us before trying another payment.' : error.message;
}
