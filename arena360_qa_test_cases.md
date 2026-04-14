# Arena360 QA Test Cases

## Purpose
This document defines the baseline QA suite for Arena360. It is written against the current shipped product and is intended to validate:

- Authentication and access control
- Role-based feature visibility
- Client and project management
- Delivery workflows, reporting, finance, and approvals
- Notifications, automation, integrations, and SLA behavior
- Admin and production-readiness paths

## How To Use
- Run the smoke cases first on every release candidate.
- Run the role cases for each target role during permission audits.
- Run the module cases whenever a related feature is changed.
- Treat the production checks as release gates before deploying to Coolify or another live environment.

## Test Data Assumptions
- At least one organization exists with internal users and client users.
- A super-admin user exists.
- Sample clients, projects, tasks, findings, invoices, contracts, reports, and templates exist.
- At least one org has Google SSO and one org has SAML SSO configured.
- At least one project has milestones, recurring tasks, files, updates, and approvals.

## Smoke Test Suite

| ID | Area | Preconditions | Steps | Expected Result |
|---|---|---|---|---|
| SMK-01 | App boot | Valid production build deployed | Open the app root URL | App loads without console-blocking errors and routes to login or dashboard as appropriate. |
| SMK-02 | Login | Valid internal user exists | Log in with valid email and password | User lands on the correct dashboard and session is established. |
| SMK-03 | Logout | User is logged in | Log out | Session is cleared and the user returns to login. |
| SMK-04 | Sidebar | Logged-in user with role | Open the sidebar/navigation | Only allowed sections are visible for that role. |
| SMK-05 | Client portal | Client user exists | Log in as client user | Client dashboard and client-visible content load successfully. |
| SMK-06 | Finance route | Finance access exists | Open `/app/finance` | Finance dashboard loads and access is enforced correctly. |
| SMK-07 | Project workspace | Accessible project exists | Open a project details page | Tabs and project content render without placeholders or broken states. |
| SMK-08 | Reports | Report template exists | Open report library or report workspace | Reports load, preview, and export controls appear correctly. |
| SMK-09 | Notifications | Notifications exist | Open the notifications drawer | Notifications render and linked items can be opened. |
| SMK-10 | Build/deploy | Fresh deployment candidate | Run the app deployment smoke test | API health and readiness endpoints return success. |

## Authentication And Access Control

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| AUTH-01 | Email/password login | Any user | User account exists | Log in with valid credentials | User is authenticated and redirected to the correct landing page. |
| AUTH-02 | Invalid login | Any user | None | Log in with wrong password | Login is rejected with a safe error message. |
| AUTH-03 | 2FA login | User with 2FA enabled | 2FA secret configured | Log in and enter the OTP | Login completes only after valid OTP confirmation. |
| AUTH-04 | Forgot password | Any user | Valid email exists | Request a password reset | Reset email or reset flow is triggered successfully. |
| AUTH-05 | Reset password | Any user | Reset token exists | Submit a new password via reset flow | Password is updated and the token cannot be reused. |
| AUTH-06 | Google SSO start | Internal user | Org has Google SSO configured | Click Google SSO from login | Redirect goes to Google with the org context preserved. |
| AUTH-07 | SAML SSO start | Internal user | Org has SAML configured | Click SAML SSO from login | Redirect goes to the SAML identity provider. |
| AUTH-08 | SAML callback | Internal user | Valid SAML response exists | Submit the SAML callback payload | User is authenticated and redirected to the auth callback. |
| AUTH-09 | Invite acceptance | New user | Invite token exists | Open invite link and complete setup | Account is activated and user is logged in or redirected correctly. |
| AUTH-10 | Session expiry | Any user | Session is old or invalid | Refresh the app or navigate after expiry | User is returned to login without exposing protected data. |
| AUTH-11 | Org isolation | Internal user | Multiple orgs exist | Try accessing another org’s record by URL | Access is denied or data is filtered to the current org. |
| AUTH-12 | Route protection | Client user | Restricted route exists | Open an internal-only route directly | User is blocked or redirected to an allowed page. |

## Role And Permission Matrix

| ID | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|
| RBAC-01 | SUPER_ADMIN | User exists | Open admin screens, finance, analytics, integrations, templates | Full allowed surfaces are visible and usable. |
| RBAC-02 | OPS | User exists | Open finance, approvals, alerts, dashboards, templates | Ops sees internal operational tools and cannot access disallowed platform controls. |
| RBAC-03 | PM | User exists | Open project workspace, approvals, reports, tasks, calendar | PM sees project delivery tools and allowed admin-lite surfaces. |
| RBAC-04 | DEV | User exists | Open assigned projects, tasks, time tracking, discussions, updates | Dev sees execution tools and no forbidden finance/admin edit controls. |
| RBAC-05 | FINANCE | User exists | Open finance dashboard, invoices, contracts, approvals | Finance sees billing and payment surfaces and cannot manage unrelated admin actions. |
| RBAC-06 | CLIENT_OWNER | User exists | Open client portal and shared project surfaces | Client owner sees client-visible data only. |
| RBAC-07 | CLIENT_MANAGER | User exists | Open client portal, reports, updates, files | Client manager can collaborate within allowed scope. |
| RBAC-08 | CLIENT_MEMBER | User exists | Open client portal | Client member sees read-only or limited collaboration content. |
| RBAC-09 | VIEWER | User exists | Open allowed pages | Viewer has read-only access with no edit controls. |
| RBAC-10 | Permission overrides | Role permissions customized | Change role permissions in admin | UI and backend authorization both reflect the stored permissions. |

## Dashboard And Navigation

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| NAV-01 | Admin dashboard | Internal user | Internal role | Open the internal dashboard | KPIs, updates, approvals, and project data load correctly. |
| NAV-02 | Client dashboard | Client user | Client-visible projects exist | Open the client dashboard | Client summary cards and latest updates render. |
| NAV-03 | Finance navigation | FINANCE/OPS/PM/SUPER_ADMIN | Finance access exists | Use sidebar or route to open finance | Finance section is visible and functional. |
| NAV-04 | Project tabs | Project member | Project has multiple tabs enabled | Open each visible tab | Tabs match the registry and role permissions. |
| NAV-05 | Notifications drawer | Logged-in user | Notifications exist | Open the notifications drawer and click an item | Drawer opens the linked destination instead of acting as a dead list. |
| NAV-06 | Org branding | Any org with logo | Branding configured | Open login and dashboard | The org logo appears consistently where configured. |

## Client Management

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| CLI-01 | Create client | OPS/PM/SUPER_ADMIN | User has permission | Create a new client | Client is created with correct org linkage and audit trail. |
| CLI-02 | Edit client | OPS/PM/SUPER_ADMIN | Client exists | Update client details | Changes persist and reflect in client views. |
| CLI-03 | Archive/restore client | OPS/PM/SUPER_ADMIN | Client exists | Archive then restore a client | Visibility changes correctly without data loss. |
| CLI-04 | Client members | Internal admin | Client exists | Add/remove client members | Membership changes are reflected in portal access. |
| CLI-05 | Client financial summary | FINANCE/OPS | Client has invoices/contracts | Open the client details finance area | Outstanding balances and billing summaries are accurate. |

## Project Workspace

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| PROJ-01 | Create project | PM/OPS/SUPER_ADMIN | Client exists | Create a project | Project is created and visible to permitted members. |
| PROJ-02 | Project overview | Project member | Project exists | Open project overview | Status, progress, and summary fields are accurate. |
| PROJ-03 | Workspace tabs | Project member | Project has tasks, files, updates, reports, financials, team, discussions, timeline, sprints, recurring tasks, testing/environments | Open each tab | Each tab loads real content and obeys visibility rules. |
| PROJ-04 | Environments tab | Internal project member | Environments exist | View, add, edit, delete environments | CRUD works and changes are saved. |
| PROJ-05 | Team tab | PM/SUPER_ADMIN | Project has team members | Add and remove members | Membership updates persist and affect access. |
| PROJ-06 | Timeline | Project member | Events exist | Open timeline | Milestones, tasks, and relevant events render in chronological order. |
| PROJ-07 | Sprints | PM/DEV | Sprint data exists | View sprint details and membership | Sprint information matches the project data. |
| PROJ-08 | Recurring tasks | PM/SUPER_ADMIN | Recurring template exists | Open recurring task tab and edit template | Template updates persist and future runs are updated. |

## Delivery And Task Execution

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| DEL-01 | Create task | PM/DEV/OPS | Project exists | Create a task | Task is stored with the correct project and status. |
| DEL-02 | Assign task | PM/OPS | Task and assignee exist | Assign a task to a user | Task assignee updates and notification/audit trail is created. |
| DEL-03 | Move task status | Project member | Task exists | Move task through workflow states | Status changes persist and activity is logged. |
| DEL-04 | Task dependencies | PM/DEV | Dependent tasks exist | Create or update a dependency | Dependency graph is respected in UI and data. |
| DEL-05 | Time tracking | DEV/PM | Task exists | Log billable and non-billable time | Entries save and show on task/project reporting surfaces. |
| DEL-06 | Recurring task run | PM/SUPER_ADMIN | Active recurring template due now | Let the scheduler run | New task is created, next run advances, and notifications/activity are emitted. |
| DEL-07 | Milestone creation | PM/OPS | Project exists | Create milestone with due date | Milestone appears in project and calendar views. |
| DEL-08 | Calendar integration | Internal user | Tasks and milestones exist | Open calendar | Task and milestone events are visible and navigable. |

## Collaboration And Content

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| COL-01 | Project updates | PM/OPS | Project exists | Create a project update | Update appears in the project feed and client feed where visible. |
| COL-02 | Discussions | Project member | Discussion enabled | Create a discussion and reply | Messages persist with author and timestamp data. |
| COL-03 | Files upload | Project member | Upload permission exists | Upload a shared file | File is stored with the correct visibility and scope. |
| COL-04 | File visibility | Client user | Client-visible file exists | Open client portal files | Client sees only allowed shared files. |
| COL-05 | Wiki page | Internal user | Wiki enabled | Create and edit a wiki page | Versioned wiki content saves and renders correctly. |

## Findings, QA, And Approvals

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| QA-01 | Create finding | QA/PM/OPS | Project exists | Create a finding with severity and evidence | Finding is saved, auditable, and visible on the project. |
| QA-02 | Update finding | QA/PM/OPS | Finding exists | Edit status, comments, or evidence | Changes persist and update activity/logs. |
| QA-03 | Finding workflow | QA/PM/OPS | Finding exists | Move finding through remediation states | State transitions are valid and reflected everywhere. |
| APPR-01 | Request approval | PM/OPS | Report or invoice exists | Request approval | Approval request is created and routed correctly. |
| APPR-02 | Approve item | Allowed reviewer | Pending approval exists | Approve the item | Status changes to approved and the audit trail is updated. |
| APPR-03 | Reject item | Allowed reviewer | Pending approval exists | Reject the item with a reason | Status changes to rejected and the reason is retained. |
| APPR-04 | Approval visibility | Client/internal reviewer | Approval exists | View approvals list | User sees only approvals in scope. |

## Reporting

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| REP-01 | Report library | Internal user | Templates exist | Open the report library | Templates, versions, and categories are listed correctly. |
| REP-02 | Generic report template | Admin/editor | Generic templates enabled | Create a non-accessibility template | Template is saved and previewable. |
| REP-03 | Accessibility report flow | QA/internal user | Accessibility template exists | Create a report from the accessibility flow | Report entries, preview, and export work end to end. |
| REP-04 | Report preview | Any allowed user | Report exists | Open preview | Preview matches the stored report data. |
| REP-05 | Report export PDF | Allowed reviewer | Report exists | Export to PDF | PDF is generated and downloadable. |
| REP-06 | Report export history | Internal user | Exports exist | Open export history/download latest | Latest export is available and linked correctly. |
| REP-07 | Client-visible reports | Client user | Client-visible report exists | Open client reports | Client sees only published/allowed reports. |
| REP-08 | Report approval | Allowed reviewer | Report pending approval | Approve or reject report | Report status updates and is traceable. |

## Finance

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| FIN-01 | Finance dashboard | FINANCE/OPS/PM/SUPER_ADMIN | Finance data exists | Open finance dashboard | Revenue, contracts, invoices, and balances load correctly. |
| FIN-02 | Contract CRUD | FINANCE/OPS | Client/project exists | Create, edit, and delete a contract | Contract records persist and produce audit entries. |
| FIN-02A | Agreement AI assist | PM/OPS/SUPER_ADMIN | Project exists and AI is configured | Type rough text into the long-form agreement fields and click Enhance with AI | The service, payment, term, and special terms fields are rewritten into polished draft language. |
| FIN-02B | Agreement builder | PM/OPS/SUPER_ADMIN | Project exists | Fill the agreement builder fields and save a contract | A Saudi-law-aware agreement PDF is generated automatically and linked to the contract. |
| FIN-02C | Agreement download | PM/OPS/FINANCE | Contract has generated PDF | Open the contract and download the agreement | The PDF opens or downloads successfully and matches the saved contract details. |
| FIN-03 | Invoice CRUD | FINANCE/OPS | Contract/project exists | Create and update an invoice | Invoice status and amounts are correct. |
| FIN-04 | Invoice payment | FINANCE/OPS | Invoice exists | Create payment intent or mark paid | Payment status updates and finance totals refresh. |
| FIN-05 | Outstanding balances | FINANCE/OPS/PM | Client has unpaid invoices | Open client finance summary | Outstanding balances are accurate. |
| FIN-06 | Finance notifications | FINANCE/OPS | Finance event occurs | Trigger invoice/contract event | Relevant users receive notifications and audit logs are written. |

## Notifications, Automation, And Integrations

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| NOTIF-01 | In-app notifications | Any user | Notification exists | Open notifications drawer | Notification is visible, readable, and markable as read. |
| NOTIF-02 | Linked navigation | Any user | Notification has a linkUrl | Click the notification | User is taken to the linked entity or page. |
| NOTIF-03 | Email delivery | User with email enabled | Email event occurs | Trigger an email-worthy event | Email is sent for supported categories. |
| NOTIF-04 | Notification preferences | User with preferences set | Preferences stored | Trigger different event types | Delivery respects the configured preferences. |
| AUTO-01 | Automation create notification | Internal user | Rule exists | Trigger the rule | Notification is created from automation. |
| AUTO-02 | Automation send email | Internal user | Email rule exists | Trigger the rule | Email action runs successfully. |
| AUTO-03 | Automation webhook | Internal user | Webhook rule exists | Trigger the rule | Outgoing webhook is dispatched and recorded. |
| AUTO-04 | Automation assign | Internal user | Assign rule exists | Trigger the rule | Target entity is assigned to the configured user. |
| AUTO-05 | Automation update status | Internal user | Status rule exists | Trigger the rule | Entity status updates correctly. |
| INT-01 | Webhook config CRUD | SUPER_ADMIN/OPS | Integration module enabled | Create, edit, and delete a webhook config | Config is stored and available for dispatch. |
| INT-02 | Webhook delivery failure | Internal user | Invalid webhook endpoint exists | Trigger webhook delivery | Failure is logged and surfaced in operational alerts. |

## Admin And Configuration

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| ADM-01 | Users admin | SUPER_ADMIN | Users exist | Create, edit, disable, and invite users | User management persists and routes are protected. |
| ADM-02 | Roles admin | SUPER_ADMIN | Roles exist | Edit role permissions and save | New permissions are enforced by backend guards. |
| ADM-03 | Workspace templates | SUPER_ADMIN | Template module enabled | Edit workspace templates and visibility | Template changes affect project tab availability. |
| ADM-04 | Report templates | SUPER_ADMIN | Templates exist | Edit template categories/versions | Template library reflects the saved version state. |
| ADM-05 | Org settings | SUPER_ADMIN | Org exists | Update settings and branding | Settings persist and affect the user experience. |
| ADM-06 | SSO config | SUPER_ADMIN | Org SSO available | Configure Google or SAML SSO | Login flow reflects the saved config. |
| ADM-07 | Audit logs | SUPER_ADMIN/OPS | System activity exists | Open audit log views | Audit entries match the action history. |

## SLA, Analytics, And System Health

| ID | Area | Role | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| SLA-01 | SLA creation | OPS/SUPER_ADMIN | SLA module enabled | Create an SLA policy | SLA policy is stored and visible in admin surfaces. |
| SLA-02 | SLA tracker start | Any module event | SLA-linked entity exists | Create or update a tracked item | SLA tracker starts or updates correctly. |
| SLA-03 | SLA completion | Any module event | Tracked item reaches terminal state | Close the item | SLA tracker marks the item as resolved or met. |
| ANA-01 | Analytics dashboard | Internal user | Analytics data exists | Open analytics views | KPIs and charts load with org-scoped data. |
| ANA-02 | Client summary | Client user | Client data exists | Open client dashboard analytics cards | Visible metrics are correct and client-safe. |
| SYS-01 | Operational alerts | Internal user | Alerting trigger exists | Trigger a failing auth/email/webhook/job path | Alert is created for internal recipients and audit log is recorded. |
| SYS-02 | Backup/restore drill | Admin/operator | Backup artifacts available | Perform a backup and restore rehearsal | Recovery plan succeeds and data integrity is preserved. |
| SYS-03 | Deployment smoke | Release candidate | New build deployed | Run API health and readiness checks | Health endpoints return success and deployment is valid. |

## Recommended Release Gates
- Pass all smoke tests.
- Pass all authentication and permission cases.
- Pass all finance, reporting, and approval cases.
- Pass all notification, automation, and integration cases.
- Pass the production checks, including backup/restore rehearsal and deployment smoke validation.

## Notes
- This document should be updated whenever a module changes behavior.
- Any feature marked in the product docs must have at least one matching QA case here.
- If a case is intentionally unsupported, the docs and the test matrix should be updated together.
