# Arena360 Gap Delivery Plan

This tracker reflects the current codebase audit, not the older baseline reports.
For go-live readiness, see [arena360_production_readiness_checklist.md](./arena360_production_readiness_checklist.md).
For the step-by-step completion path, see [arena360_100_percent_completion_plan.md](./arena360_100_percent_completion_plan.md).

## Current Status

- Missing: none identified in the latest cleanup pass.
- Partially implemented: the remaining parity and hardening work, especially workspace/analytics alignment, docs sync, and the remaining release verification coverage.

## Phase 0 - User-Facing Gaps

- [x] Add SSO launch buttons to the login screen for org-aware Google and SAML sign-in.
- [x] Make notifications open their linked project/client/finding targets directly from the drawer.
- [x] Replace the placeholder Testing / Environments tab with a real environment list UI.
- [x] Decide reporting scope explicitly: keep the accessibility-first flow and standardize on the report builder / accessibility audit workflow.
- [x] Make Roles Admin editable and persist org-specific role default permissions.

## Phase 1 - Delivery Plumbing

- [x] Enforce notification preferences in actual delivery, not just stored settings.
- [x] Add email delivery for task, finding, invoice, approval, and SLA events.
- [x] Implement outbound webhook delivery for saved integrations.
- [x] Replace placeholder client latest-updates counts with a real feed and KPI.
- [x] Add milestone events to the calendar view.

## Phase 2 - Workflow Engines

- [x] Expand automation beyond notification creation into assign, update, email, and webhook actions.
- [x] Wire approvals more fully into reports, invoices, and contracts.
- [x] Apply SLA policies from real entity lifecycle events.
- [x] Make recurring tasks and finance events generate the right notifications and audit trail entries.

## Phase 3 - Product Parity

- [x] Restore generic report generation and a full non-accessibility template workflow if that remains in scope.
- [ ] Finish the remaining finance surfaces that are still hidden or partial.
- [x] Align workspace visibility and tab behavior with the documented role model.
- [x] Tighten analytics and admin screens to match documented capabilities.

## Phase 4 - Verification

- [x] Add end-to-end tests for login.
- [x] Add end-to-end tests for SSO login and org-aware routing.
- [x] Add end-to-end tests for notifications and linked navigation.
- [x] Add end-to-end tests for webhooks and delivery events.
- [x] Add end-to-end tests for approvals across reports, invoices, and contracts.
- [x] Add end-to-end tests for reports and exports.
- [x] Audit permissions so each role sees exactly what it should.
- [ ] Update the documentation after each phase so the docs stay aligned with reality.
- [ ] Rebuild and redeploy after each phase to catch regressions early.
