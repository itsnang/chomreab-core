export class GetStudentsQuery {
  constructor(
    public readonly classroomId?: string,
    /** Admin screens opt in to show students who have left; everything else
     *  sees only the active roll. */
    public readonly includeInactive = false,
  ) {}
}
