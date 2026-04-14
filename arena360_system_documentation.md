# Arena360 System Documentation

> Purpose: a current-state guide to what Arena360 is, what it does, and how the shipped product works today.

## 1. What Arena360 Is

Arena360 is a multi-tenant operations platform for agencies, consultancies, IT service providers, and internal delivery teams that manage clients, projects, financial work, quality issues, and collaboration in one place.

It combines:
- client management
- project delivery
- task execution
- time tracking
- reporting and approvals
- finance and billing
- notifications and automation
- wiki and knowledge sharing
- SLA tracking
- integrations and webhooks
- admin, analytics, and workspace configuration
- a client portal for external stakeholders

The system is designed to reduce tool sprawl. Instead of splitting delivery across spreadsheets, email threads, issue trackers, finance tools, and separate portals, Arena360 gives teams one coordinated workspace with role-aware access.

## 2. What The Platform Helps Organizations Do

Arena360 helps organizations:
- manage client relationships from onboarding through delivery and billing
- coordinate internal staff and external clients in the same deployment without exposing private data
- standardize how work moves through projects, reviews, approvals, and finance
- keep a clear audit trail of important changes
- automate repetitive operational work such as notifications, emails, status changes, user assignment, and webhook dispatch
- generate and review reports with versioned templates and approvals
- monitor operational health through dashboards, alerts, and activity logs
- support multiple organizations with org-level settings, branding, and SSO

## 3. Role Model

Arena360 uses nine roles:

| Role | Type | Typical Purpose |
|---|---|---|
| `SUPER_ADMIN` | Internal | Platform owner, system administrator, and top-level support user |
| `OPS` | Internal | Operations, delivery coordination, and cross-project oversight |
| `PM` | Internal | Project planning, execution, approvals, and team coordination |
| `DEV` | Internal | Delivery execution, task work, and project contribution |
| `QA` | Internal | Testing, findings review, and quality validation |
| `FINANCE` | Internal | Billing, contracts, invoices, and financial oversight |
| `CLIENT_OWNER` | External | Client-side owner with the broadest client portal access |
| `CLIENT_MANAGER` | External | Client-side manager with collaborative visibility |
| `CLIENT_MEMBER` | External | Client-side member with lighter read-focused access |
| `VIEWER` | External | Read-only observer for approved client-visible content |

The platform is role-aware. Different roles see different dashboards, tabs, actions, and data sets, and org-specific overrides can further adjust access.

## 4. Role Capabilities

### SUPER_ADMIN

Super Admins can:
- manage users, roles, permissions, and organization-wide configuration
- edit branding, SSO settings, and workspace templates
- view all major dashboards, analytics, reports, finance, and admin screens
- access clients, projects, findings, notifications, automations, wiki, integrations, and approvals
- review operational alerts, audit logs, and system activity

### OPS

Operations users can:
- manage clients and projects
- coordinate tasks, milestones, recurring work, and delivery follow-up
- review finance surfaces and approval queues
- work with notifications, automations, SLA status, and project-level health
- support client-facing work while retaining internal operational visibility

### PM

Project Managers can:
- create and manage projects
- assign tasks and coordinate team members
- manage milestones, discussions, updates, and readiness workflows
- review reports, findings, timelines, and sprint work
- participate in approvals where the workflow allows it

### DEV

Developers can:
- view their assigned work in dashboards and project tabs
- update tasks, add comments, and track progress
- log time against tasks
- review files, discussions, updates, and findings connected to their work
- use AI-assisted features where enabled

### QA

Quality users can:
- review findings and project quality issues
- validate fixes and inspect evidence
- work with reports, timelines, and task context
- participate in test-oriented workflows and approvals

### FINANCE

Finance users can:
- view finance dashboards and financial KPIs
- manage contracts, invoices, and payment workflows
- review outstanding balances, paid amounts, and due invoices
- participate in approval flows tied to billing and reporting

### CLIENT_OWNER

Client owners can:
- access the client dashboard
- view client-visible project status and updates
- review shared files, milestones, and reports
- see finance summaries that are allowed to client roles
- participate in approvals when configured

### CLIENT_MANAGER

Client managers can:
- review client portal data for assigned projects
- follow delivery progress and client-visible updates
- collaborate on shared items where permissions allow it
- monitor status without internal-only data exposure

### CLIENT_MEMBER

Client members can:
- view a lighter client portal
- follow approved updates, milestones, and shared files
- stay informed without internal editing access

### VIEWER

Viewers can:
- consume read-only client-visible content
- view approved reports and project status
- avoid management or editing responsibilities

## 5. Core Platform Modules

### 5.1 Authentication And Access Control

Arena360 supports:
- email and password login
- invite-based onboarding
- forgot password and reset password flows
- 2FA with TOTP
- org-aware Google SSO
- org-aware SAML SSO
- role-based route protection
- org-scoped access control
- rate limiting on sensitive auth routes
- organization-aware login and branding

### 5.2 Organization And Tenant Management

Arena360 supports:
- organization creation and setup
- organization slug lookup for public login branding
- organization logo and color settings
- organization SSO configuration
- organization-level role permission overrides
- onboarding status and onboarding dismissal controls

### 5.3 Dashboards

Arena360 provides role-specific dashboards for:
- Super Admin and operations users
- project managers
- developers
- finance users
- client users

Dashboard content can include:
- clients and project counts
- revenue and outstanding balance
- overdue tasks
- projects at risk
- pending approvals
- latest project updates
- finance KPIs
- due soon work
- client-visible progress

### 5.4 Client Management

Client management includes:
- client creation, editing, archiving, restoring, and deletion
- billing profile fields
- contact information and notes
- client members and client-side roles
- client revenue and outstanding balance tracking
- client-scoped files and activity
- project associations

### 5.5 Project Management

Projects are the center of Arena360. Each project can contain:
- overview and readiness information
- tasks
- milestones
- updates
- files
- findings
- reports
- financials
- team members
- discussions
- activity
- timeline
- sprints
- recurring tasks
- testing and environments

Project work now uses workspace and tab configuration so internal, finance, and client audiences see the correct surfaces for their role and template.

### 5.6 Task Management

Task management supports:
- task creation and editing
- status, priority, assignee, due date, and label fields
- milestone and sprint association
- task dependencies
- recurring task generation
- workflow movement through the delivery lifecycle
- task-linked time tracking

### 5.7 Time Tracking

Time tracking supports:
- logging minutes against tasks
- billable and non-billable entries
- task-scoped and project-scoped review
- personal time entry review
- operational visibility for work allocation

### 5.8 Milestones, Calendar, Timeline, And Sprints

Arena360 supports:
- milestone creation and progress tracking
- project calendar views with task and milestone events
- timeline/Gantt-style delivery views
- sprint creation and sprint task assignment
- recurring task scheduling and automated creation

### 5.9 Updates, Discussions, And Activity

These surfaces support collaboration and visibility:
- project updates with internal or client visibility
- threaded project discussions
- reply trails
- activity feeds for major project actions
- dashboard surfaces that show recent updates

### 5.10 Files

File management supports:
- file upload by client, project, or finding context
- internal and client visibility
- categorized files
- secure download access
- file metadata and attribution

### 5.11 Findings And Quality

The findings module supports:
- issue logging
- severity levels
- status workflows
- evidence attachments
- comments and discussion
- assignment and remediation
- timeline history

### 5.12 Reporting

Arena360 reporting supports:
- report templates and template versions
- generic report categories and subcategories
- project report creation
- preview and export
- approval workflows
- client-visible and internal report visibility
- downloadable PDF output

The reporting system is no longer a shell. It now supports real template management, generic report workflow, approvals, and export paths.

### 5.13 Financial Management

The finance module supports:
- contracts
- invoices
- payment intent creation
- payment status tracking
- finance dashboards
- client financial summaries
- finance approvals

The contract workflow now includes a Saudi-law-aware agreement builder that:
- captures the counterparty legal name, representative, signer, jurisdiction, governing law, payment terms, and term summary
- lets admins toggle optional clauses such as confidentiality, data protection, intellectual property, termination, force majeure, and notices
- generates a bilingual or single-language PDF agreement automatically after save
- stores the generated agreement as a downloadable file asset tied to the contract
- preserves the draft payload so the agreement can be reopened and adjusted later
- is intended for internal review and legal sign-off before execution

### 5.14 Notifications

Notifications support:
- in-app notification center
- unread counts and mark-read actions
- linked navigation into the relevant project or entity
- email delivery for supported event categories
- per-user notification preferences
- operational alerts for failures and runtime issues

### 5.15 Automation And Integrations

Automation supports:
- create notification
- send email
- dispatch webhook
- update status
- assign user

Integrations support:
- Slack notifications
- GitHub issue creation
- outbound webhooks with event filtering and signatures

### 5.16 Wiki And Knowledge Base

The wiki module supports:
- wiki page creation and editing
- page versioning
- internal knowledge capture
- article retrieval by slug or id

### 5.17 SLA Management

The SLA layer supports:
- policy configuration
- entity scoping
- tracker creation
- breach monitoring
- lifecycle-driven status updates

### 5.18 Analytics And Admin

Analytics and admin surfaces support:
- portfolio and project health
- task and delivery summaries
- finance summaries
- findings severity and closure trends
- user administration
- editable role permissions
- workspace templates
- report templates
- organization settings
- integration management

### 5.19 Workspace Templates And Environments

Arena360 supports:
- project workspace templates
- client workspace assignments
- role-aware tab visibility
- testing/environments management on projects
- editable environment access records

### 5.20 Audit And Operational Safety

Arena360 includes:
- automatic audit logging for mutating actions
- before/after snapshots
- request IDs, IP addresses, and user agents
- sensitive-field redaction in audit entries
- operational alerts for API failures, auth failures, job failures, email failures, and webhook failures
- backup and restore drill scripts
- deployment smoke-test script
- verified migration flow on a disposable clone

## 6. Key End-To-End Workflows

### 6.1 Login And Onboarding

Users can:
- log in with email and password
- complete 2FA if enabled
- use Google or SAML SSO where configured
- accept an invite and activate an account
- reset a forgotten password

### 6.2 Project Delivery

Teams can:
- create a project
- assign members
- add tasks, milestones, files, findings, and updates
- track time and dependencies
- review reports and approvals
- move the project through delivery and billing stages

### 6.3 Reporting

Users can:
- create template versions
- assign templates to clients
- build project reports
- preview and approve reports
- publish or export report outputs

### 6.4 Finance

Finance and project teams can:
- create contracts and invoices
- generate payment intents
- track overdue and paid invoices
- review finance dashboards and summaries
- use approvals for controlled financial work

### 6.5 Notifications And Alerts

The platform can:
- create in-app notifications
- send email for supported notification categories
- dispatch webhook payloads
- emit live socket updates
- surface operational failures to internal staff as alerts

## 7. What The System Looks Like In Practice

The current shipped product is:
- role-aware
- multi-tenant
- operationally rich
- finance-aware
- client-portal friendly
- reporting-capable
- automation-enabled
- audit-friendly
- production-hardened with verified backups, smoke checks, and migration safety

The most important remaining optional work is not core product capability. It is:
- broader load testing
- client portal RTL validation on the same release candidate
- any future mobile app work

## 8. Summary

Arena360 is now a real operational platform, not an MVP shell.

It combines:
- client management
- project execution
- task and milestone control
- time tracking
- findings and QA
- reporting and approvals
- finance and billing
- notifications and automation
- wiki, SLA, analytics, and admin controls
- client portal access

The result is a coordinated system for organizations that need to manage delivery, visibility, accountability, and client communication from one place.
