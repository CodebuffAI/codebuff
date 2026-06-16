# Freebuff Web Gravity Production Evidence

Production environment tested:

- Freebuff Web: <https://freebuff.com/web>
- Created project: <https://freebuff.com/web/project/stale-cameras-bathe>
- Generated app: <https://stale-cameras-bathe.freebuff.dev/>
- Evidence assets: <https://github.com/CodebuffAI/freebuff-private/releases/tag/freebuff-web-gravity-evidence-2026-06-16-1239>

## Screenshots

### Project Creation And Gravity Search

![Project created and Gravity searches running](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-web-gravity-project-created.png)

### Gravity Recommendations

![Gravity recommendations with tracked setup links](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-web-gravity-recommendations.png)

### Runtime Error After Generation

![Runtime error after generated project](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-web-runtime-error-after-generation.png)

### Generated App Loaded

![Generated app loaded](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-generated-app-loaded.png)

### Waitlist Submission Count Increment

![Waitlist submission count increment](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-waitlist-submit-count-increment.png)

### Integrations Catalog

![Integrations catalog populated from Gravity](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-integrations-catalog.png)

### Resend Search

![Resend catalog search result](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-resend-search.png)

### Resend Integration Running

![Resend integration running with high token count](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-resend-integration-running.png)

### Resend Integration Complete With Runtime Error

![Resend integration complete with runtime error still visible](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-resend-integration-complete-runtime-error.png)

### Implicit Gravity Test

![Implicit Gravity test without mentioning Gravity by name](https://github.com/CodebuffAI/freebuff-private/releases/download/freebuff-web-gravity-evidence-2026-06-16-1239/freebuff-implicit-gravity-test.png)

## Notes

- Gravity Index recommendations and attribution links worked in production.
- The Integrations catalog loaded 519 services and supported search/filtering.
- The Resend catalog `Integrate` CTA submitted an agent prompt with `gravity_index`, a `search_id`, and `integrated_slug: "resend"`, then the run showed `Reporting integration`.
- The generated app loaded and the waitlist form incremented the displayed count after submission.
- The production run still showed `Cannot read properties of null (reading 'useMemo')`.
- Web agent runs reached multi-million-token counts during project generation and integration, indicating a likely web-specific performance issue.
- A separate production prompt that did not mention Gravity by name still triggered service lookup activity (`Finding services`) and service recommendation behavior.
- This branch hardens the Freebuff Web system prompt to lean into implicit Gravity lookups and adds React/runtime/style guardrails intended to prevent invalid hook calls and broken preview styles.
