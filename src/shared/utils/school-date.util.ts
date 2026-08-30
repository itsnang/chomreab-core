const SCHOOL_TIMEZONE_OFFSET_HOURS = 7; // Cambodia (ICT, UTC+7)

/** "Today" in the school's local timezone, as YYYY-MM-DD. Backend has no
 *  browser clock, so this fixed offset stands in for the frontend's
 *  local-time computation (correct for a Cambodia-based deployment). */
export function getSchoolToday(): string {
  const now = new Date();
  const shifted = new Date(
    now.getTime() + SCHOOL_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000,
  );
  return shifted.toISOString().slice(0, 10);
}
