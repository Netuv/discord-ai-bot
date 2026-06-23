/**
 * subrequest.ts — BudgetTracker for Cloudflare Workers subrequest limit
 * v6.0 — Track remaining budget per invocation, warn when low
 */

export class BudgetTracker {
	private remaining: number;
	public readonly label: string;

	constructor(label: string, public readonly max: number = 50) {
		this.remaining = max;
		this.label = label;
	}

	get remainingBudget(): number {
		return this.remaining;
	}

	get consumed(): number {
		return this.max - this.remaining;
	}

	/** Consume n budget. Returns true if still within limit. */
	consume(n: number = 1): boolean {
		this.remaining -= n;
		return this.remaining >= 0;
	}

	/** Check if we can afford n more requests. */
	canAfford(n: number = 1): boolean {
		return this.remaining >= n;
	}

	/** Throw if budget exhausted. */
	assert(needed: number = 1): void {
		if (!this.canAfford(needed)) {
			throw new Error(`[${this.label}] Budget exhausted: need ${needed}, only ${this.remaining} remaining`);
		}
	}

	/** Reset budget for new invocation. */
	reset(): void {
		this.remaining = this.max;
	}

	/** Return summary string for logging. */
	summary(): string {
		return `[${this.label}] ${this.consumed}/${this.max} used, ${this.remaining} remaining`;
	}

	/** Create a child tracker sharing the same budget pool. */
	child(childLabel: string): BudgetTracker {
		const child = new BudgetTracker(childLabel, this.remaining);
		// Wrap consume to sync back to parent
		const origConsume = child.consume.bind(child);
		child.consume = (n: number = 1): boolean => {
			const ok = origConsume(n);
			this.remaining = child.remainingBudget;
			return ok;
		};
		return child;
	}
}

/** Create a fresh tracker per invocation. */
export function createBudget(label: string, max: number = 50): BudgetTracker {
	return new BudgetTracker(label, max);
}
