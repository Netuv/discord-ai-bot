/**
 * engine.ts — Pure cron parsing + matching
 * v6.0 — No side effects, no I/O
 */

/** Parse a cron field into array of matching numbers. */
function parseField(field: string, min: number, max: number): number[] {
	const vals: number[] = [];
	for (const part of field.split(',')) {
		const m = part.match(/^(\d+|\*)(?:-(\d+))?(?:\/(\d+))?$/);
		if (!m) continue;
		const step = parseInt(m[3]) || 1;
		if (m[1] === '*') {
			for (let i = min; i <= max; i += step) vals.push(i);
		} else {
			const s = parseInt(m[1]);
			const e = m[2] ? parseInt(m[2]) : s;
			for (let i = s; i <= e; i += step) vals.push(i);
		}
	}
	return [...new Set(vals)].sort((a, b) => a - b);
}

/** Check if a cron expression matches the given date (defaults to now). */
export function cronMatches(cron: string, date: Date = new Date()): boolean {
	try {
		const parts = cron.trim().split(/\s+/);
		if (parts.length !== 5) return false;
		const [min, hr, dom, mon, dow] = parts.map((p, i) =>
			parseField(p, [0, 0, 1, 1, 0][i], [59, 23, 31, 12, 6][i]),
		);
		return (
			min.includes(date.getUTCMinutes()) &&
			hr.includes(date.getUTCHours()) &&
			dom.includes(date.getUTCDate()) &&
			mon.includes(date.getUTCMonth() + 1) &&
			dow.includes(date.getUTCDay())
		);
	} catch {
		return false;
	}
}
