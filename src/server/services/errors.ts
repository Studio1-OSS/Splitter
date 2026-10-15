/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
