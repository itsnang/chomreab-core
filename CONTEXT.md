# Attendance

A school and tutoring-centre attendance system. Teachers mark a daily roster; parents are notified on Telegram. This repo is the API; `attendance-admin` is the admin and teacher web client and shares this vocabulary.

## Language

### People

**Admin**:
A staff member who manages classrooms, students, teacher accounts and school settings.
_Avoid_: owner, principal, manager

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
The association between a Telegram chat and a student, created when a parent redeems a linking code.
_Avoid_: subscription, connection, pairing

### Accounts

**Temporary password**:
The password generated when an admin creates a teacher account, which the teacher must replace before reaching the app.
_Avoid_: initial password, default password
