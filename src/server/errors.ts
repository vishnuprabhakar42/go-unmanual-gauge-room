/** An expected, user-facing failure (validation, business rule). Its message is shown to the user. */
export class UserError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "UserError";
  }
}
