# Multi-tenant shared deployment, superseding one-deployment-per-school

ADR-0005 chose one deployment per School because onboarding was manual and the buyer was a single owner. Self-serve signup means a School must exist the moment someone submits a form, which a manual Railway deploy cannot do in real time. Every table gains a `school_id`; access is enforced by a scoped-repository helper every handler must go through, backed by a leak test per module — not Postgres row-level security, which would need every request to run inside a transaction that sets the current School, and connection pooling risks handing one School's session to the next request. The trade-off is real: RLS makes a forgotten scope impossible rather than merely tested against, but at this codebase's size a second enforcement layer costs more than the discipline it buys.

Reopening automated per-school provisioning is the honest alternative if the shared-schema discipline ever proves too costly to maintain.
