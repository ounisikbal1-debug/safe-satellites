# server/services/ â€” AGENT-OWNED business integrations

Write external-integration logic here (call third-party APIs, send email, run
AI, schedule jobs), then call it from `server/routers.ts` procedures. Keep
routers thin â€” one procedure â†’ one service call.

**Always compose the `_core` integration primitives; never reach around them:**

- `_core/fetch` â†’ `outboundFetch(url, { timeoutMs })` for outbound HTTP.
  (Dev-convenience wrapper, not a security boundary â€” see the file header.)
- `_core/email` â†’ `sendEmail({ to, subject, html })` (platform-mediated).
- `_core/llm`   â†’ `complete({ system, prompt })` (metered to the owner).
- `_core/jobs`  â†’ `registerJob(name, handler)` (runs in this app's runtime).
- `_core/storage` â†’ `storagePutUrl(relKey)` for user uploads.

Secrets (external API keys) come from env injected by the platform â€” never
hardcode them. Do not edit anything under `server/_core/`.
