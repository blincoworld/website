import '../packages/packages.js';
let callback;
try { callback = JSON.parse(sessionStorage.getItem('property-films-callback')); } catch {}
const arrived = new URLSearchParams(location.hash.slice(1)).get('callback');
if (['essential', 'signature', 'content', 'bespoke', 'unsure'].includes(arrived)) {
  callback = { package: arrived, at: Date.now() };
  try { sessionStorage.setItem('property-films-callback', JSON.stringify(callback)); } catch {}
  history.replaceState(null, '', location.pathname);
}
if (callback && ['essential', 'signature', 'content', 'bespoke', 'unsure'].includes(callback.package) && Number.isFinite(callback.at) && Date.now() - callback.at >= 0 && Date.now() - callback.at < 86400000) {
  document.querySelector('#callback-heading').innerHTML = 'THANKS.<br>WE’VE GOT YOUR DETAILS.';
  document.querySelector('#callback-message').textContent = 'We’ll take a look at your property and get back to you as soon as we can.';
  document.querySelector('#callback-reassurance').textContent = 'No pressure — your callback request is already in.';
  document.querySelector('#bespoke-note').hidden = callback.package !== 'bespoke';
}
window.propertyFilmsEvent('post_enquiry_pricing_viewed');
