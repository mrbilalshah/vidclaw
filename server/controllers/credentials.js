import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CREDS_DIR = path.join(os.homedir(), '.openclaw', 'credentials');

// Validate name is a safe slug
function validName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export async function listCredentials(req, res) {
  try {
    await fs.mkdir(CREDS_DIR, { recursive: true });
    const entries = await fs.readdir(CREDS_DIR);
    const results = await Promise.all(
      entries.map(async (name) => {
        try {
          const stat = await fs.stat(path.join(CREDS_DIR, name));
          if (!stat.isFile()) return null;
          return { name, exists: true, modifiedAt: stat.mtime.toISOString() };
        } catch { return null; }
      })
    );
    res.json(results.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function putCredential(req, res) {
  const { name } = req.params;
  const { value } = req.body || {};
  if (!validName(name)) return res.status(400).json({ error: 'Invalid credential name. Use only letters, numbers, hyphens, underscores.' });
  if (typeof value !== 'string' || !value) return res.status(400).json({ error: 'Value is required.' });
  try {
    await fs.mkdir(CREDS_DIR, { recursive: true });
    const filePath = path.join(CREDS_DIR, name);
    await fs.writeFile(filePath, value, { mode: 0o600 });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteCredential(req, res) {
  const { name } = req.params;
  if (!validName(name)) return res.status(400).json({ error: 'Invalid credential name.' });
  try {
    await fs.unlink(path.join(CREDS_DIR, name));
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found.' });
    res.status(500).json({ error: err.message });
  }
}
