# Operator is not a value of UserRole

`UserRole` is `ADMIN | TEACHER`, and every row that carries it is scoped to exactly one School. An Operator — someone running Chomreab itself, across every School — does not belong to any School, so adding `SUPERADMIN` to the same enum would mean the `users` table holds rows with a null `school_id`. Every School-scoped query would then need to explicitly exclude them, and the one place a leak would matter most — an Operator's own account — becomes the one place a forgotten exclusion leaks into a tenant's data.

Operator access is a separate authorization path, checked before tenant scoping applies at all, not a role variant within it.
