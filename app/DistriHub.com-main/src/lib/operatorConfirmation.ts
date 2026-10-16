type Attempt = { context: string };

export class OperatorConfirmationGate {
  private pending: Attempt | null = null;
  begin(context: string): Attempt | null {
    if (this.pending) return null;
    this.pending = { context };
    return this.pending;
  }
  current(attempt: Attempt, context: string): boolean {
    return this.pending === attempt && attempt.context === context;
  }
  finish(attempt: Attempt): void {
    if (this.pending === attempt) this.pending = null;
  }
  invalidate(): void { this.pending = null; }
}
