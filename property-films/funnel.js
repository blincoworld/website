// Integration hook only: no tracking request, cookie, contact data or public activity feed.
window.propertyFilmsEvent = (name, detail = {}) => {
  const data = { event: `property_films_${name}`, funnel_version: 'callback-v1' };
  if (['essential', 'signature', 'bespoke', 'unsure'].includes(detail.package)) data.package = detail.package;
  window.dispatchEvent(new CustomEvent('property-films:analytics', { detail: data }));
  if (Array.isArray(window.dataLayer)) window.dataLayer.push(data);
};
