# Attendance

A school and tutoring-centre attendance system. Teachers mark a daily roster; parents are notified on Telegram. This repo is the API; `attendance-admin` is the admin and teacher web client and shares this vocabulary.

## Language

### Tenancy

**School**:
One school or tutoring centre operating one Chomreab account, and the boundary every other record belongs to. "School" is used loosely here to mean either kind of institution — there is no separate term for a tutoring centre.
_Avoid_: tenant, organization, account, customer

### People

**Admin**:
A staff member who manages classrooms, students, teacher accounts and school settings, scoped to one School. The person who signs a School up is simply its first Admin — there is no separate "owner" role.
_Avoid_: owner, principal, manager

**Operator**:
Someone who runs Chomreab itself, across every School — extending a trial, confirming a payment received outside the normal flow, and the like. Not a member of any School, and deliberately not a value of the same role enum as Admin/Teacher: a School-scoped query must never be able to accidentally include a row that belongs to no School.
_Avoid_: superadmin, platform admin, staff (as in Chomreab's own staff)

**Teacher**:
A staff member who marks attendance for the classrooms assigned to them.
_Avoid_: instructor, staff member

**Parent**:
A guardian who receives attendance messages about a student. A parent has no account and never signs in.
_Avoid_: guardian, family, parent user

**Student**:
A child enrolled in exactly one classroom.
_Avoid_: pupil, child, learner

**Inactive student**:
A student who has left. They are off every roster and counted nowhere current, and their attendance history is retained.
_Avoid_: deleted, archived, removed, former student

### Teaching

**Classroom**:
A named group of students that attendance is taken against, optionally carrying a grade label and one assigned teacher.
_Avoid_: class, group, section, course

**Roster**:
The students of one classroom on one date, each with their attendance for that day.
_Avoid_: register, attendance sheet, list

### Attendance

**Attendance record**:
One student's status for one classroom on one date.
_Avoid_: mark, entry

**Attendance status**:
One of present, late or absent. A student with no record for the day is unmarked; unmarked is the absence of a record, not a fourth status.
_Avoid_: state, attendance state

**Note**:
Free text a teacher attaches to an attendance record to explain it.
_Avoid_: comment, reason, remark

**Audit log entry**:
A record that a student's status was changed on a date, by whom, and what it was before.
_Avoid_: history, change log, revision

### Parent linking

**Linking code**:
A short, expiring code an admin generates for a student and gives to that student's parent, redeemed either by typing it or by tapping an invite link built from it. Single-use when redeemed in a private chat; redeemable more than once when used to add the bot to a family group, so a second household or a re-added bot doesn't need a new one.
_Avoid_: invite code, pairing code, token

**Parent link**:
The association between a Telegram chat and a student, created when a parent redeems a linking code. One chat may hold Parent links to students at different Schools — a parent with children at two institutions is ordinary, not an edge case — so every message names the School it's about.
_Avoid_: connection, pairing

### Accounts

**Temporary password**:
The password generated when an admin creates a teacher account, which the teacher must replace before reaching the app.
_Avoid_: initial password, default password

### Billing

**Trial**:
The 30 days after a School signs up during which the product is fully usable and nothing has been paid. A property of the School itself (when it ends), not a state of a Subscription — a School that never converts has no Subscription and no Invoice, ever.
_Avoid_: free plan, trialing

**Subscription**:
The paid relationship between a School and Chomreab, billed monthly by default or annually at a discount. Begins to exist only at first payment — before that, "does this School have a Subscription" is simply false, not a Subscription in some earlier state.
_Avoid_: plan, account (in the billing sense)

**Active student count**:
The number of Students with status active on a School, counted fresh at the moment an Invoice is generated. What a Subscription is billed against. A School can lower its next bill by deactivating leavers before that moment — that's by design, not a loophole.
_Avoid_: seat count, usage, student count (ambiguous with the roster sense)

**Invoice**:
A request for one billing period's payment, generated at the start of that period from the active student count, and settled by a Payment.
_Avoid_: bill, receipt

**Payment**:
A completed transfer confirmed by CutLuy's webhook and applied to settle one Invoice. Never inferred from a checkout redirect — only the signed webhook confirms money actually moved.
_Avoid_: transaction, charge

**Grace period**:
The 7 days after an Invoice's due date during which a Subscription stays active before lapsing. Exists because nothing renews automatically — a missed monthly QR scan is expected to be forgetfulness more often than refusal.
_Avoid_: grace days, buffer

**Lapsed**:
A Subscription whose grace period has passed with its Invoice unpaid. A lapsed School keeps full use of the app — marking, history, reports — but parent notifications stop, since the notification is the thing being paid for. There is no separate voluntary-cancellation flow: a School that wants to stop simply stops paying and lapses the same way a forgetful one does. That's a deliberate scope cut, not an oversight — worth revisiting if a School ever asks to leave outright.
_Avoid_: suspended, expired
