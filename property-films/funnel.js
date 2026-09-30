// Lightweight Property Films funnel events.
// Page views are recorded by Business OS without cookies or personal data.
window.propertyFilmsEvent = (name, detail = {}) => {
  const data = {
    event: `property_films_${name}`,
    funnel_version: 'callback-v2'
  };

  if (
    ['essential', 'signature', 'content', 'bespoke', 'unsure']
      .includes(detail.package)
  ) {
    data.package = detail.package;
  }

  window.dispatchEvent(
    new CustomEvent('property-films:analytics', { detail: data })
  );

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(data);
  }

  if (name === 'page_viewed') {
    fetch(
      'https://business-os.pbwebonlinesales.workers.dev/api/property-business/property-films/event',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: 'page_viewed',
          source: new URLSearchParams(location.search).get('source') || '',
          referrer: document.referrer || ''
        }),
        keepalive: true
      }
    ).catch(() => {});
  }
};
