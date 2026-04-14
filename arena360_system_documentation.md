# Arena360 System Documentation

> Purpose: a detailed, current-state guide to what Arena360 is, what it does, and how each role uses it.

## 1. What Arena360 Is

Arena360 is a multi-tenant operations platform for agencies, consultancies, IT service companies, and internal delivery teams that need to manage clients, projects, finances, quality work, and collaboration in one place.

It brings together:
- client relationship management
- project and task delivery
- time tracking and work planning
- quality findings and reporting
- contract and invoice workflows
- automation, approvals, notifications, and SLA tracking
- admin controls, analytics, wiki knowledge, and workspace templates
- a client portal for external stakeholders

The system is designed to reduce tool sprawl. Instead of keeping delivery in one app, billing in another, and reporting in a spreadsheet, Arena360 gives teams a shared operational workspace with role-aware access.

## 2. What The System Helps Organizations Do

Arena360 helps organizations:
- track work from lead or client onboarding through delivery and billing
- keep internal staff and clients working in the same platform without exposing private data
- standardize how projects, tasks, updates, and approvals flow through the business
- improve visibility into deadlines, risks, finances, and client-facing progress
- keep an audit trail of major actions for operational control
- automate repetitive work such as notifications, emails, status changes, and webhooks
- centralize reports, approvals, and documentation
- support multiple organizations in one deployment with org-level settings and branding

## 3. Product Shape

Arena360 is organized around four main experiences:
- internal dashboards for operations, project managers, development, finance, and admin users
- client dashboards and client-scoped project views
- project detail pages with rich tabs for delivery, collaboration, finance, and reporting
- admin and configuration screens for roles, templates, org settings, integrations, and automation

## 4. Technology Snapshot

Arena360 is built with:
- React 18 + TypeScript on the frontend
- Vite for the client build
- NestJS on the backend
- Prisma with PostgreSQL for data access
- JWT authentication with bcrypt passwords and TOTP 2FA
- Google SSO and SAML SSO
- Resend for transactional email
- Stripe for payment flows
- Socket.IO for live notifications
- Tailwind CSS, Recharts, FullCalendar, and react-frappe-gantt for the UI
- pptxgenjs and pdfkit for report generation
- Swagger support on the API
- local uploads or MinIO-compatible storage for files and exports

## 5. Role Model

Arena360 uses nine roles:
- internal roles: `SUPER_ADMIN`, `OPS`, `PM`, `DEV`, `QA`, `FINANCE`
- client roles: `CLIENT_OWNER`, `CLIENT_MANAGER`, `CLIENT_MEMBER`, `VIEWER`

The platform is role-aware. That means:
- different roles land on different dashboards
- different roles see different tabs in projects
- internal and external users get different data visibility
- permissions can be controlled by role defaults and org-specific overrides

## 6. Role Capabilities

### 6.1 SUPER_ADMIN

The Super Admin has the broadest access and is the top-level platform operator.

They can:
- manage all platform users
- manage roles and role defaults
- edit org settings, branding, and SSO configuration
- view all main dashboards and analytics
- access client, project, finance, reporting, wiki, automation, integrations, and admin screens
- adjust workspace and report templates
- review notifications, approvals, and audit activity
- impersonate users for support and troubleshooting

### 6.2 OPS

Operations users coordinate the day-to-day delivery engine.

They can:
- manage clients and projects
- work across tasks, milestones, team assignment, and delivery follow-up
- review finance data and operational KPIs
- participate in approvals for reports, contracts, and invoices
- view analytics, notifications, automations, and SLA activity
- support client-facing workflows while still seeing internal operational data

### 6.3 PM

Project Managers focus on project execution and delivery coordination.

They can:
- create and manage projects
- assign tasks and track progress
- manage milestones, updates, discussions, and team coordination
- monitor risk, health, and readiness indicators
- review reports, findings, and project progress
- use timelines, sprints, recurring tasks, and calendar views
- participate in approvals where the workflow allows it

### 6.4 DEV

Developers get a focused execution view.

They can:
- view the developer dashboard with task KPIs
- work on assigned tasks
- update task status and collaborate through project updates and discussions
- track time against their tasks
- review findings, files, and project context
- use the AI tools where enabled
- access only the tabs and permissions that match their role and workspace configuration

### 6.5 QA

Quality assurance users focus on testing, validation, and defect handling.

They can:
- view the developer-style operational dashboard
- track findings and project quality issues
- review task and project progress
- work with reports and verification flows
- inspect timelines and updates tied to quality work
- participate in workflow and approval steps where allowed

### 6.6 FINANCE

Finance users handle billing and financial oversight.

They can:
- view the finance dashboard
- inspect outstanding amounts, paid invoices, overdue invoices, and active contracts
- review client and project finance summaries
- manage invoice and contract workflows
- participate in approvals
- review finance-related notifications and audit entries
- work with financial tabs and finance-visible project data

### 6.7 CLIENT_OWNER

Client owners are the top external users for a client organization.

They can:
- access the client dashboard
- view active projects and upcoming milestones
- see client-visible updates
- review shared files
- access reports and financial summaries allowed to client roles
- participate in approvals when configured
- view the client portal without internal-only operational data

### 6.8 CLIENT_MANAGER

Client managers are collaborative external users with broader client visibility.

They can:
- view the client dashboard
- track project progress and client-visible updates
- open shared files and relevant reports
- see project milestones and selected financial context
- collaborate on discussions and reviews where permitted
- monitor delivery status for their organization

### 6.9 CLIENT_MEMBER

Client members have lighter visibility into the client portal.

They can:
- view a reduced dashboard
- follow client-visible updates and selected project progress
- open approved shared files and reports
- monitor milestones and basic project status
- stay informed without internal editing controls

### 6.10 VIEWER

Viewers are read-only external stakeholders.

They can:
- view dashboard content that is allowed to them
- observe selected project status and shared information
- consume approved files, reports, and updates
- avoid any management or editing responsibility

## 7. Core Modules

### 7.1 Authentication and Access Control

Arena360 supports:
- email and password login
- 2FA with TOTP
- forgot-password and reset-password flows
- invite-based onboarding
- org-aware SSO entry points for Google and SAML
- role-based route protection
- org-scoped access control
- impersonation for Super Admin support work
- rate-limited sensitive auth routes

### 7.2 Organization and Tenant Management

Arena360 is built for organization-scoped operation.

It supports:
- org creation and setup
- org settings for name, slug, logo, and colors
- org usage and management screens
- org-level SSO configuration
- role-default permissions and org-specific overrides

### 7.3 Dashboards

The dashboard changes by role.

Internal dashboards can show:
- client counts
- project counts
- revenue and financial KPIs
- overdue tasks
- latest updates
- projects at risk
- pending approvals
- quick-access tools

Developer dashboards can show:
- open tasks
- due soon tasks
- in-review tasks
- overdue tasks

Finance dashboards can show:
- outstanding balances
- invoices due
- paid revenue
- active contracts

Client dashboards can show:
- active projects
- next milestones
- latest client-visible updates
- pending approvals
- shared files
- my projects

### 7.4 Client Management

Client management covers the full client lifecycle.

It supports:
- client listing, filtering, and search
- client creation and editing
- archive and restore flows
- client profile data such as contact person, industry, website, and address
- billing profile data such as currency, VAT number, and tax ID
- client members and member roles
- client-scoped files
- client revenue and outstanding balance tracking
- client activity and project association

### 7.5 Project Management

Project management is the center of the product.

Projects support:
- create, edit, archive, and view workflows
- status and health tracking
- budget and date fields
- tags and metadata
- role-aware project visibility
- full project detail pages

Project tabs currently include:
- Overview
- Tasks
- Milestones
- Updates
- Files
- Findings
- Reports
- Financials
- Team
- Discussions
- Activity
- Timeline
- Sprints
- Recurring Tasks
- Testing / Environments

### 7.6 Task Management

Task management supports:
- task creation and editing
- status tracking
- priority levels
- assignees
- due dates
- labels
- milestone links
- sprint links
- task dependencies
- recurring task generation
- kanban-style workflows

### 7.7 Time Tracking

Time tracking supports:
- logging minutes against tasks
- billable and non-billable work
- viewing time entries per project or task
- supporting internal productivity reporting
- tying time to delivery and billing context

### 7.8 Milestones, Timeline, Calendar, and Sprints

These surfaces help teams plan and sequence delivery.

They support:
- milestone creation and management
- milestone status and completion tracking
- timeline views for project work
- calendar views that include tasks and milestones
- sprint creation and task assignment
- recurring task scheduling

### 7.9 Updates, Discussions, and Activity

These features support collaboration and status visibility.

They support:
- posting project updates
- marking updates as internal or client-visible
- viewing latest updates in dashboards
- threaded project discussions
- reply threads and collaboration trails
- activity feeds for major project actions

### 7.10 Files

File management supports:
- uploads at client, project, or finding scope
- categorized file storage
- internal or client visibility
- downloads and presigned access
- file metadata and attribution

### 7.11 Findings and QA

The findings module supports:
- issue logging
- severity levels
- status management
- evidence uploads
- comments and timelines
- assignment and remediation tracking
- AI analysis when enabled

### 7.12 Reporting

Arena360 reporting supports:
- report list and search
- report generation
- report templates and template versions
- client template assignment
- report exports
- downloadable outputs for project work
- approvals around reports where required

### 7.13 Financial Management

The finance module supports:
- contracts
- invoices
- payment tracking
- payment integration
- finance dashboards
- financial summaries on client and project pages
- approvals on finance-related workflows

### 7.14 Notifications

Notifications support:
- in-app notification center
- notification counts
- linked navigation targets
- client and internal delivery paths
- email delivery for supported event categories
- user preferences
- notification history and read state

### 7.15 Automation and Integrations

Arena360 supports workflow automation and external system integration.

Automation can:
- create notifications
- send email
- dispatch webhooks
- update statuses
- assign users

Integrations can:
- connect with external services such as Slack, GitHub, and webhooks where configured
- respond to project and operational events

### 7.16 Wiki

The wiki module supports:
- page creation and editing
- page versioning
- internal knowledge capture
- searchable documentation content

### 7.17 SLA

The SLA layer supports:
- policy configuration
- tracker creation
- breach checks
- lifecycle-driven status updates
- operational follow-up on overdue work

### 7.18 Analytics and Admin

Analytics support:
- portfolio health
- task completion
- financial summaries
- findings severity and closure metrics

Admin surfaces support:
- user management
- role editing
- role permissions
- org and workspace templates
- report templates
- integrations
- automation rules

### 7.19 Workspace Templates and Tab Visibility

Arena360 uses workspace configuration to control what tabs appear for which role and which audience.

This supports:
- internal and client-specific workspace behavior
- read-only versus interactive tab states
- template-driven project layouts
- safer role-based presentation without exposing everything everywhere

## 8. What Each Role Typically Sees In Practice

### SUPER_ADMIN
- full dashboards and admin views
- all clients and projects
- finance, reports, automation, wiki, integrations, analytics
- role and org settings

### OPS
- operational dashboard
- clients, projects, finance, approvals, analytics
- delivery coordination and workflow control

### PM
- projects, tasks, milestones, updates, team, reports, discussions
- project-level finance visibility where allowed
- timeline, sprint, recurring work, and readiness views

### DEV
- assigned tasks and project context
- updates, discussions, files, findings, and time tracking
- limited internal visibility focused on execution

### QA
- findings, validation work, task context, and project quality surfaces
- reporting and review-driven workflows

### FINANCE
- financial dashboards and finance tabs
- contracts, invoices, approvals, and client finance context

### CLIENT_OWNER / CLIENT_MANAGER / CLIENT_MEMBER / VIEWER
- client dashboard
- client-visible project updates
- shared files
- visible reports and milestones
- approved financial or collaboration views as configured

## 9. How Arena360 Fits Into An Organization

Arena360 works best when an organization needs:
- one system for delivery and client communication
- one source of truth for project status
- role-based separation between internal and external users
- financial visibility tied to projects
- quality tracking tied to delivery
- automation for repetitive coordination work
- auditability for management and support

It is especially useful for:
- digital agencies
- software consultancies
- IT service providers
- product delivery teams with multiple client accounts

## 10. Current Product State

The platform is feature-rich and much more than an MVP.

At the same time, the current repo still treats some work as go-live hardening rather than finished launch polish. The most important remaining work is:
- end-to-end testing
- permissions audit
- deployment and backup verification
- production monitoring and alerting
- final parity cleanup on the remaining tracked items

That means Arena360 is a strong production candidate, but the safest way to describe it today is:
- more complete than an MVP
- close to production
- still needing final operational hardening before broad rollout

## 11. Summary

Arena360 is a unified operating system for client delivery teams.

It combines:
- client management
- project execution
- time and milestone tracking
- reporting and finance
- notifications and automation
- analytics and admin control
- a client portal for external stakeholders

The result is a platform that helps organizations manage work, visibility, accountability, and client communication from one coordinated system.
