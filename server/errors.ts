/** An error with an HTTP status; the app turns it into `{ error: message }` with that status. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
