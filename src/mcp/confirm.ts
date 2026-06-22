/**
 * confirm.ts — Confirmation queue for admin actions
 * v5.0 — In-memory queue with 5min TTL, 6-char codes, max 50 pending
 */

export interface PendingAction { code: string; action: string; params: Record<string, unknown>; description: string; timestamp: number; confirmCount: number; requiredConfirms: number; }

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_PENDING = 50;
const TTL_MS = 5 * 60 * 1000;

const pendingMap = new Map<string, PendingAction>();

function generateCode(): string {
	let code = '';
	for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	return code;
}

function cleanup(): void {
	const now = Date.now();
	for (const [code, entry] of pendingMap) { if (now - entry.timestamp > TTL_MS) pendingMap.delete(code); }
}

export function queueAction(action: string, params: Record<string, unknown>, description: string, requiredConfirms = 1): PendingAction {
	cleanup();
	if (pendingMap.size >= MAX_PENDING) throw new Error('Pending action queue full. Confirm or cancel existing actions first.');
	let code: string;
	do { code = generateCode(); } while (pendingMap.has(code));
	const entry: PendingAction = { code, action, params, description, timestamp: Date.now(), confirmCount: 0, requiredConfirms };
	pendingMap.set(code, entry);
	return entry;
}

export function confirmAction(code: string): { success: boolean; message: string; entry?: PendingAction } {
	cleanup();
	const entry = pendingMap.get(code);
	if (!entry) return { success: false, message: `❌ Code "${code}" tidak valid atau sudah kedaluwarsa.` };
	entry.confirmCount++;
	if (entry.confirmCount >= entry.requiredConfirms) {
		pendingMap.delete(code);
		return { success: true, message: `✅ Action "${entry.description}" confirmed!`, entry };
	}
	return { success: false, message: `⏳ ${entry.confirmCount}/${entry.requiredConfirms} confirmations (need ${entry.requiredConfirms}). Gunakan code: ${code}` };
}

export function cancelAction(code: string): boolean {
	cleanup();
	return pendingMap.delete(code);
}

export function listPendingActions(): PendingAction[] {
	cleanup();
	return Array.from(pendingMap.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export function formatPendingAction(entry: PendingAction): string {
	return `**${entry.action}** [${entry.code}] — ${entry.description} (${Math.round((Date.now() - entry.timestamp) / 1000)}s ago)`;
}
