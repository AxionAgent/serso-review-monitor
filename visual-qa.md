# Visual QA notes

The final visual pass verified:

- Landing page: branded teal/leaf experience with clear workspace and customer-flow CTAs.
- Public QR page: mobile-first layout, branch locked to QR (`Singkawang` for `/r/SGK`), touch-sized star controls, server-backed settings copy, and inline validation area.
- Admin reviews: live seeded review rows, branch and status filters, rating display, status workflow, and CSV export action.
- Admin workspace: responsive sidebar, sticky top bar, alert center, KPI cards, chart surfaces, and branded skeleton loading state for cold database queries.

The live backend probe verified that `/r/SGK` resolves to an active Singkawang QR, invalid codes return `state: invalid`, the dashboard aggregates seeded plus acceptance-test rows, and negative-review counts follow the any-rating-at-or-below-threshold rule.
