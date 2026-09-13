# One deployment per school

Rollcall serves a single school per deployment. There is no tenancy: no table carries a school id, and `SchoolSettingsEntity` is pinned to one row by `SCHOOL_SETTINGS_ID = 'default'`. Telegram reinforces it — `telegram.webhookSecret` is a single environment value, so the webhook has no way to tell one school's messages from another's.

This was true by accident before it was true by decision. Writing it down so nobody reads the absence of a `schoolId` column as an oversight and starts adding one piecemeal.

## Consequences

The buyer is a single tutoring-centre or school owner, for whom one deployment is a reasonable unit. Onboarding a second customer means a second deployment, so the thing worth investing in is a scriptable deploy, not a tenancy model.

Going multi-school later is a real project, not a migration: every table needs scoping, each school needs its own Telegram bot (the token already lives in school settings, so that part is half-built), and the webhook needs to route by bot rather than validating one shared secret.
