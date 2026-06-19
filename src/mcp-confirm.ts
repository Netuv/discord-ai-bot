/**
 * MCP Confirmation Queue — Sistem konfirmasi untuk aksi admin
 * 
 * Setiap aksi berbahaya (ban, kick, delete, dll) akan masuk antrian
 * dan WAJIB dikonfirmasi via tool `confirm-action` atau `cancel-action`.
 */

export interface PendingAction {
  code: string;
  action: string;          // "ban-user", "kick-user", dll
  params: Record<string, any>;
  description: string;     // Deskripsi untuk dikonfirmasi user
  timestamp: number;
  confirmCount: number;    // Berapa kali dikonfirmasi (untuk multi-confirm)
  requiredConfirms: number; // Berapa konfirmasi diperlukan (default 1)
}

const pendingActions = new Map<string, PendingAction>();
const MAX_ACTIONS = 50;    // Max antrian
const TIMEOUT_MS = 5 * 60 * 1000; // 5 menit

// ─── Generasi kode ─────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Queue Management ──────────────────────────────────────

export function queueAction(
  action: string,
  params: Record<string, any>,
  description: string,
  requiredConfirms: number = 1
): PendingAction {
  // Bersihkan expired
  cleanup();

  if (pendingActions.size >= MAX_ACTIONS) {
    throw new Error("Antrian penuh! Konfirmasi atau batalkan aksi yang tertunda dulu.");
  }

  let code: string;
  do { code = generateCode(); } while (pendingActions.has(code));

  const entry: PendingAction = {
    code,
    action,
    params,
    description,
    timestamp: Date.now(),
    confirmCount: 0,
    requiredConfirms,
  };

  pendingActions.set(code, entry);
  return entry;
}

export function getPendingAction(code: string): PendingAction | undefined {
  return pendingActions.get(code);
}

export function confirmAction(code: string): { success: boolean; entry?: PendingAction; message: string } {
  const entry = pendingActions.get(code);
  if (!entry) {
    return { success: false, message: `Kode "${code}" tidak ditemukan atau sudah kadaluarsa.` };
  }

  entry.confirmCount++;

  if (entry.confirmCount >= entry.requiredConfirms) {
    // Konfirmasi cukup, hapus dari antrian
    pendingActions.delete(code);
    return { success: true, entry, message: `✅ Aksi "${entry.action}" dikonfirmasi!` };
  }

  // Masih perlu konfirmasi tambahan
  const sisa = entry.requiredConfirms - entry.confirmCount;
  return {
    success: true,
    entry,
    message: `⚠️ ${entry.confirmCount}/${entry.requiredConfirms} konfirmasi. Masih perlu ${sisa}x konfirmasi lagi.`,
  };
}

export function cancelAction(code: string): boolean {
  const exists = pendingActions.has(code);
  if (exists) pendingActions.delete(code);
  return exists;
}

export function listPendingActions(): PendingAction[] {
  cleanup();
  return Array.from(pendingActions.values())
    .sort((a, b) => b.timestamp - a.timestamp);
}

function cleanup() {
  const now = Date.now();
  for (const [code, entry] of pendingActions) {
    if (now - entry.timestamp > TIMEOUT_MS) {
      pendingActions.delete(code);
    }
  }
}

// ─── Format untuk ditampilkan ──────────────────────────────

export function formatPendingAction(entry: PendingAction): string {
  const waktu = new Date(entry.timestamp).toLocaleTimeString("id-ID");
  const sisa = Math.max(0, Math.ceil((TIMEOUT_MS - (Date.now() - entry.timestamp)) / 60000));
  return (
    `• **${entry.action}** — Kode: \`${entry.code}\`\n` +
    `  ${entry.description}\n` +
    `  ⏰ ${waktu} (sisa ${sisa} menit)`
  );
}
