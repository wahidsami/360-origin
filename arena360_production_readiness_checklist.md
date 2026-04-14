# Arena360 Production Readiness Checklist

> Purpose: a practical go-live checklist based on the current repo state, not the older MVP-era reports.

## Current Verdict

Arena360 is now **feature-rich and close to production**, but I would still classify it as **pre-production / late beta** until the items below are green.

The remaining risk is no longer core product capability. It is mostly:
- verification coverage
- operational hardening
- documentation alignment
- parity cleanup for a few remaining product surfaces

## Must-Have Before Real Production

- [x] Run end-to-end tests for the critical journeys: login, SSO, notifications, webhooks, approvals, reports, client portal, and finance.
- [x] Audit permissions for every role and custom-permission override.
- [x] Reconcile docs with the live codebase so the system is described accurately.
- [ ] Confirm backup and restore for database and file storage with a real drill, not only documented commands.
- [ ] Verify production secrets, env vars, and public URLs are cleanly separated from local/dev defaults.
- [ ] Confirm migrations can be applied and rolled back safely in a release window.
- [ ] Add monitoring and alerting for API errors, failed jobs, auth failures, and webhook/email delivery failures.
- [ ] Smoke-test the deployment path end to end on the target VPS/Coolify environment.

## Strongly Recommended Before Scaling

- [x] Finish the remaining product-parity items in the live tracker, especially any report/workspace/admin surface that is still partial.
- [ ] Run a basic load test or concurrency smoke test on the heaviest flows.
- [ ] Review rate limiting, audit logging, and sensitive-data redaction under real traffic.
- [ ] Validate Arabic/RTL screens and the client portal on the same release candidate.

## Safe To Defer

- [ ] Native mobile app.
- [ ] Optional extra payment providers.
- [ ] Optional satisfaction survey and advanced analytics extras.

## What Is Already In Good Shape

- [x] Core auth, 2FA, and org-aware SSO.
- [x] Main dashboards for internal, finance, and client users.
- [x] CRM, project management, tasks, milestones, time tracking, and recurring work.
- [x] Reports, approvals, finance, notifications, automations, wiki, SLA, and integrations.
- [x] Production build succeeds.
- [x] Backend has a Jest test harness and at least basic e2e coverage.

## Practical Go-Live Rule

If we can check every item in **Must-Have Before Real Production**, then I would be comfortable calling Arena360 production-ready for a controlled real-world rollout.

Until then, it is a strong production candidate, but not a fully hardened launch.
