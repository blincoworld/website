# Property Films packages

Route: `/property-films/packages` (static host redirects to trailing slash).

The existing landing page's inline CSS was extracted verbatim to `property-films/shared.css`; both pages use it. `style.css` is an older unused asset and is intentionally untouched. The landing page markup and scripts are otherwise unchanged.

Package deliverables are editable in `property-films/packages/index.html`. Pricing/selection logic lives in `catalog.mjs`, with initial no-JavaScript prices in the HTML. Update both when changing prices; browser tests verify their agreement.

Run from the website repository:

```
node --test tests/property-packages.test.mjs
python3 tests/serve-property-films.py
# In another terminal:
node tests/property-packages-browser.mjs
node tests/property-films-release-smoke.mjs
```

Browser checks need installed Chrome and default to the local preview on 8792; set `PROPERTY_FILMS_TEST_URL=https://piersblinco.com` for production read-only checks. They cover ten price combinations at 320/375/412/768/1024/1440px, selection summary, resetting upgrades, keyboard operation, both route forms and browser exceptions. Screenshots go to `/tmp/property-packages-*.png`. Existing release smoke tests run without any submission flag.

No Stripe IDs, requests, backend changes . The CTA previews the selection. Future checkout should send only `packageKey`, integer `propertyCount` and boolean `seasonal` to a server which validates them and calculates the property pricing and maps to real Stripe prices, with the seasonal upgrade kept separate. Browser amounts are for display only. Server must own prices and create the session; webhook verification should confirm payment before fulfilment.

Before Stripe: confirm Multi-Property deliverables and whether four refreshes apply per property or across the portfolio; seasonal scheduling and guarantee scope; real Price IDs and additional-property pricing mapping, success/cancel destinations and the paid customer's property-details intake.

Final advertised pricing: Essential £495; Signature £795; Multi-Property £795 for one, £1,190 for two, £1,585 for three. Seasonal upgrades stay £295 / £495 / £795 respectively; Multi-Property seasonal is a flat upgrade, not per property. No VAT wording is displayed. Website publication is explicitly approved; checkout remains a preview with no payment requests.
