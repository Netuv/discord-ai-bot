import { traceLog } from './trace-logger';
import { AppError, ErrorCode } from './errors';

export class BudgetTracker {
  private used = 0;
  private readonly max: number;

  constructor(max = 50) {
    this.max = max;
  }

  consume(count = 1, label?: string): void {
    this.used += count;
    if (label) {
      traceLog('debug', 'Budget', `Consumed ${count} (${label}): ${this.used}/${this.max}`);
    }
    if (this.used > this.max) {
      throw new AppError(
        ErrorCode.BUDGET_EXHAUSTED,
        `Subrequest budget exceeded: ${this.used}/${this.max}`,
        false
      );
    }
  }

  get remaining(): number {
    return this.max - this.used;
  }

  get snapshot(): { used: number; max: number; remaining: number } {
    return { used: this.used, max: this.max, remaining: this.remaining };
  }
}
