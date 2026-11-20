// Criptografia das credenciais de integração (AES-256-GCM).
// Em produção, defina ENCRYPTION_KEY (32 bytes em base64). Em desenvolvimento,
// uma chave é gerada e guardada em data/.encryption-key.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadKey() {
  if (process.env.ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) throw new Error('ENCRYPTION_KEY precisa ter 32 bytes em base64.');
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Defina ENCRYPTION_KEY em produção para proteger as credenciais das integrações.');
  }
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', '.encryption-key');
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
}

const KEY = loadKey();

export function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}
