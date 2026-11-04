const form = document.getElementById('agency-enquiry-form');
if (form) {
  const fields = form.querySelector('fieldset');
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('agency-form-status');
  if (fields.dataset.enquiryReady === 'true') {
    fields.disabled = false;
    button.disabled = false;
    const submissionId = crypto.randomUUID();
    let snapshot;
    let busy = false;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      const values = new FormData(form);
      const data = { submission_id: submissionId, name: values.get('name'), company: values.get('company'), email: values.get('email'), project_summary: values.get('project_summary'), honeypot: values.get('honeypot'), response_requested: values.has('response_requested') };
      if (snapshot && snapshot !== JSON.stringify(data)) {
        status.textContent = 'An earlier submission could not be confirmed. Restore its details to retry safely, or email piers@piersblinco.com.';
        return;
      }
      busy = true;
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      snapshot = JSON.stringify(data);
      status.textContent = 'Saving your enquiry…';
      try {
        const response = await fetch('/api/enquiries/agency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: snapshot, credentials: 'omit' });
        const result = await response.json();
        if (!response.ok) {
          status.textContent = result.error || 'Your enquiry could not be confirmed. Please email piers@piersblinco.com.';
          if ([400, 413, 415].includes(response.status)) snapshot = undefined;
        } else {
          status.textContent = result.status === 'sent'
            ? "Thanks for getting in touch! Your enquiry has been received successfully. I'll be in touch as soon as possible."
            : result.message;
          fields.disabled = true;
          return;
        }
      } catch {
        status.textContent = 'We could not confirm whether your enquiry was saved. Retry with the same details, or email piers@piersblinco.com.';
      } finally {
        busy = false;
        button.disabled = fields.disabled;
        form.removeAttribute('aria-busy');
      }
    });
  }
}
