export class DeleteClassroomCommand {
  constructor(
    public readonly schoolId: string,
    public readonly id: string,
  ) {}
}
