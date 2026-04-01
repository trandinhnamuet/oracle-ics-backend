import * as fs from 'fs';
import * as path from 'path';

export interface MailLogEntry {
  to: string | string[];
  from: string;
  subject: string;
  messageId?: string;
  status: 'sent' | 'error';
  error?: string;
}

/**
 * Append one NDJSON line to logs/mail-YYYY-MM-DD.log.
 * Safe to call fire-and-forget — never throws.
 */
export function appendMailLog(entry: MailLogEntry): void {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const logFile = path.join(logDir, `mail-${date}.log`);

    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (_) {
    // Không để lỗi ghi log ảnh hưởng luồng gửi mail
  }
}
