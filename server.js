import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3334;
const TASKS_FILE = path.join(__dirname, 'data', 'tasks.json');
const HOME = os.homedir();
const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(HOME, '.openclaw');
const WORKSPACE = path.join(OPENCLAW_DIR, 'workspace');
function getTimezone() {
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    return config.agents?.defaults?.timezone || 'UTC';
  } catch { return 'UTC'; }
}
const OPENCLAW_API_BASE = process.env.OPENCLAW_API || 'http://127.0.0.1:18789';

// --- Timezone Helpers ---
// Get date/time parts in the configured timezone
function getDatePartsInTz(date = new Date(), tz = getTimezone()) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    weekday: 'long',
  }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return {
    year: parseInt(parts.year),
    month: parseInt(parts.month) - 1,
    day: parseInt(parts.day),
    hour: parts.hour === '24' ? 0 : parseInt(parts.hour),
    minute: parseInt(parts.minute),
    second: parseInt(parts.second),
    weekday: parts.weekday,
  };
}

// Get the UTC Date that corresponds to midnight (start of day) in the target timezone
function startOfDayInTz(date = new Date(), tz = getTimezone()) {
  const p = getDatePartsInTz(date, tz);
  // Create a date string in the timezone and parse it
  const localMidnight = `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T00:00:00`;
  // Calculate the offset by comparing local representation to UTC
  const utcNow = date.getTime();
  const localNow = new Date(p.year, p.month, p.day, p.hour, p.minute, p.second).getTime();
  const offset = utcNow - localNow;
  return new Date(new Date(p.year, p.month, p.day, 0, 0, 0, 0).getTime() + offset);
}

function startOfWeekInTz(date = new Date(), tz = getTimezone()) {
  const p = getDatePartsInTz(date, tz);
  const d = new Date(p.year, p.month, p.day);
  const dayOfWeek = d.getDay(); // 0=Sunday
  const weekStartLocal = new Date(p.year, p.month, p.day - dayOfWeek);
  const utcNow = date.getTime();
  const localNow = new Date(p.year, p.month, p.day, p.hour, p.minute, p.second).getTime();
  const offset = utcNow - localNow;
  return new Date(weekStartLocal.getTime() + offset);
}

function startOfMonthInTz(date = new Date(), tz = getTimezone()) {
  const p = getDatePartsInTz(date, tz);
  const utcNow = date.getTime();
  const localNow = new Date(p.year, p.month, p.day, p.hour, p.minute, p.second).getTime();
  const offset = utcNow - localNow;
  return new Date(new Date(p.year, p.month, 1, 0, 0, 0, 0).getTime() + offset);
}
const SKILLS_DIRS = {
  bundled: '/usr/lib/node_modules/openclaw/skills',
  managed: path.join(OPENCLAW_DIR, 'skills'),
  workspace: path.join(WORKSPACE, 'skills'),
};
const OPENCLAW_JSON = path.join(OPENCLAW_DIR, 'openclaw.json');

app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, 'dist')));

// --- Activity Log ---
const ACTIVITY_FILE = path.join(__dirname, 'data', 'activity.json');

function readActivity() {
  try { return JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf-8')); } catch { return []; }
}
function writeActivity(log) {
  // Keep last 200 entries
  while (log.length > 200) log.shift();
  fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(log, null, 2));
}
function logActivity(actor, action, details = {}) {
  const log = readActivity();
  log.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), actor, action, details, timestamp: new Date().toISOString() });
  writeActivity(log);
}

app.get('/api/activity', (req, res) => {
  const log = readActivity();
  const limit = parseInt(req.query.limit) || 50;
  const taskId = req.query.taskId;
  const filtered = taskId ? log.filter(a => a.details?.taskId === taskId) : log;
  res.json(filtered.slice(-limit).reverse());
});

// --- Tasks API ---
function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch { return []; }
}
function writeTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

app.get('/api/tasks', (req, res) => res.json(readTasks()));

app.post('/api/tasks', (req, res) => {
  const tasks = readTasks();
  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: req.body.title || 'Untitled',
    description: req.body.description || '',
    priority: req.body.priority || 'medium',
    skill: req.body.skill || '',
    skills: Array.isArray(req.body.skills) ? req.body.skills : (req.body.skill ? [req.body.skill] : []),
    status: req.body.status || 'backlog',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    schedule: req.body.schedule || null,
    scheduledAt: req.body.scheduledAt || null,
    result: null,
    startedAt: null,
    error: null,
    order: req.body.order ?? tasks.filter(t => t.status === (req.body.status || 'backlog')).length,
  };
  tasks.push(task);
  writeTasks(tasks);
  logActivity('user', 'task_created', { taskId: task.id, title: task.title });
  res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const wasNotDone = tasks[idx].status !== 'done';
  const allowedFields = ['title', 'description', 'priority', 'skill', 'skills', 'status', 'schedule', 'scheduledAt', 'result', 'startedAt', 'completedAt', 'error', 'order'];
  const updates = {};
  for (const k of allowedFields) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  tasks[idx] = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() };
  if (wasNotDone && tasks[idx].status === 'done') tasks[idx].completedAt = new Date().toISOString();
  if (tasks[idx].status !== 'done') tasks[idx].completedAt = null;
  writeTasks(tasks);
  const actor = req.body._actor || 'user';
  logActivity(actor, 'task_updated', { taskId: req.params.id, title: tasks[idx].title, changes: Object.keys(updates) });
  res.json(tasks[idx]);
});

// Reorder tasks within a column
app.post('/api/tasks/reorder', (req, res) => {
  const { status, order } = req.body;
  if (!status || !Array.isArray(order)) return res.status(400).json({ error: 'status and order[] required' });
  const tasks = readTasks();
  for (let i = 0; i < order.length; i++) {
    const idx = tasks.findIndex(t => t.id === order[i]);
    if (idx !== -1) tasks[idx].order = i;
  }
  writeTasks(tasks);
  res.json({ ok: true });
});

// Task scheduling endpoints

app.post('/api/tasks/:id/run', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tasks[idx].status = 'in-progress';
  tasks[idx].startedAt = new Date().toISOString();
  tasks[idx].updatedAt = new Date().toISOString();
  writeTasks(tasks);
  logActivity('user', 'task_run', { taskId: req.params.id, title: tasks[idx].title });
  res.json({ success: true, message: 'Task queued for execution' });
});

app.get('/api/tasks/queue', (req, res) => {
  const tasks = readTasks();
  const now = new Date();
  const queue = tasks.filter(t => {
    // Pick up in-progress tasks that were triggered by "Run Now" but not yet executed
    if (t.status === 'in-progress' && !t.pickedUp) return true;
    if (t.status !== 'todo') return false;
    // All todo tasks are eligible — if it's in todo, execute it
    if (!t.schedule) return true;
    if (t.schedule === 'asap' || t.schedule === 'next-heartbeat') return true;
    if (t.schedule !== 'asap' && t.schedule !== 'next-heartbeat') {
      return new Date(t.schedule) <= now;
    }
    return true;
  });
  queue.sort((a, b) => {
    const oa = a.order ?? 999999;
    const ob = b.order ?? 999999;
    if (oa !== ob) return oa - ob;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
  res.json(queue);
});

app.post('/api/tasks/:id/pickup', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tasks[idx].pickedUp = true;
  tasks[idx].status = 'in-progress';
  tasks[idx].startedAt = tasks[idx].startedAt || new Date().toISOString();
  tasks[idx].updatedAt = new Date().toISOString();
  writeTasks(tasks);
  logActivity('bot', 'task_pickup', { taskId: req.params.id, title: tasks[idx].title });
  res.json(tasks[idx]);
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tasks[idx].status = 'done';
  tasks[idx].completedAt = new Date().toISOString();
  tasks[idx].updatedAt = new Date().toISOString();
  tasks[idx].result = req.body.result || null;
  if (req.body.error) tasks[idx].error = req.body.error;
  writeTasks(tasks);
  logActivity('bot', 'task_completed', { taskId: req.params.id, title: tasks[idx].title, hasError: !!req.body.error });
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  let tasks = readTasks();
  const deleted = tasks.find(t => t.id === req.params.id);
  tasks = tasks.filter(t => t.id !== req.params.id);
  writeTasks(tasks);
  if (deleted) logActivity('user', 'task_deleted', { taskId: req.params.id, title: deleted.title });
  res.json({ ok: true });
});

// --- Time API ---
app.get('/api/time', (req, res) => {
  const now = new Date();
  const tz = getTimezone();
  const p = getDatePartsInTz(now, tz);
  res.json({
    timezone: tz,
    iso: now.toISOString(),
    local: now.toLocaleString('en-US', { timeZone: tz }),
    weekday: p.weekday,
    year: p.year,
    month: p.month + 1,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    second: p.second,
  });
});

// --- Usage API ---
app.get('/api/usage', (req, res) => {
  const now = new Date();
  const sessionsDir = path.join(OPENCLAW_DIR, 'agents', 'main', 'sessions');

  let tokensToday = 0, tokensWeek = 0, tokensMonth = 0;
  let costToday = 0, costWeek = 0, costMonth = 0;
  const sessionsToday = new Set(), sessionsWeek = new Set(), sessionsMonth = new Set();

  const tz = getTimezone();
  const todayStart = startOfDayInTz(now, tz);
  const weekStart = startOfWeekInTz(now, tz);
  const monthStart = startOfMonthInTz(now, tz);
  
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtime < monthStart) continue;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const usage = entry.message?.usage || entry.usage;
          if (usage?.cost?.total) {
            const tokens = (usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0);
            const cost = usage.cost.total;
            const ts = new Date(entry.timestamp || stat.mtime);
            
            if (ts >= monthStart) { tokensMonth += tokens; costMonth += cost; sessionsMonth.add(file); }
            if (ts >= weekStart) { tokensWeek += tokens; costWeek += cost; sessionsWeek.add(file); }
            if (ts >= todayStart) { tokensToday += tokens; costToday += cost; sessionsToday.add(file); }
          }
        } catch {}
      }
    }
  } catch {}

  const tomorrowReset = new Date(todayStart); tomorrowReset.setDate(tomorrowReset.getDate() + 1);
  const nextWeekReset = new Date(weekStart); nextWeekReset.setDate(nextWeekReset.getDate() + 7);
  const nextMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Calculate session window (last 5 hours)
  const sessionWindowStart = new Date(now - 5 * 3600000);
  let tokensSession = 0, costSession = 0;
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtime < sessionWindowStart) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          const u = entry.message?.usage || entry.usage;
          if (u?.cost?.total) {
            const ts = new Date(entry.timestamp || stat.mtime);
            if (ts >= sessionWindowStart) {
              tokensSession += (u.input || 0) + (u.output || 0) + (u.cacheRead || 0);
              costSession += u.cost.total;
            }
          }
        } catch {}
      }
    }
  } catch {}

  // Session window resets ~5h from window start
  const sessionResetTime = new Date(sessionWindowStart.getTime() + 5 * 3600000);
  const sessionResetIn = formatDuration(Math.max(0, sessionResetTime - now));

  const config = readOpenclawJson();
  const model = (config.agents?.defaults?.model?.primary || 'unknown').replace('anthropic/', '');

  // Estimate percentages based on Anthropic Max plan limits (configurable)
  // These are approximate token limits per window
  const SESSION_LIMIT = 45000000;   // ~45M tokens per 5h session window
  const WEEKLY_LIMIT = 180000000;   // ~180M tokens per week (all models)

  const sessionPct = Math.min(100, Math.round((tokensSession / SESSION_LIMIT) * 100));
  const weeklyPct = Math.min(100, Math.round((tokensWeek / WEEKLY_LIMIT) * 100));

  res.json({
    model,
    timezone: tz,
    tiers: [
      {
        label: 'Current session',
        percent: sessionPct,
        resetsIn: sessionResetIn,
        tokens: tokensSession,
        cost: costSession,
      },
      {
        label: 'Current week (all models)',
        percent: weeklyPct,
        resetsIn: formatDuration(nextWeekReset - now),
        tokens: tokensWeek,
        cost: costWeek,
      },
    ],
    details: {
      today: { tokens: tokensToday, cost: costToday, sessions: sessionsToday.size },
      week: { tokens: tokensWeek, cost: costWeek, sessions: sessionsWeek.size },
      month: { tokens: tokensMonth, cost: costMonth, sessions: sessionsMonth.size },
    },
  });
});

// --- OpenClaw Proxy API ---
// Helper: fetch from OpenClaw API, handling HTML responses gracefully
async function fetchOpenclawJson(endpoint) {
  const url = `${OPENCLAW_API_BASE}${endpoint}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OpenClaw returned ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    // OpenClaw returned an HTML page, not a JSON API — skip it
    throw new Error(`Endpoint ${endpoint} returns HTML (web page), not JSON API`);
  }
  return await response.json();
}

// Try multiple known OpenClaw API endpoints for usage data
app.get('/api/openclaw/usage', async (req, res) => {
  // Try common JSON API paths that OpenClaw might expose
  const candidates = ['/api/usage', '/api/v1/usage', '/api/status', '/status'];
  for (const ep of candidates) {
    try {
      const data = await fetchOpenclawJson(ep);
      return res.json({ ...data, _source: ep });
    } catch {}
  }
  // All candidates failed — report it cleanly
  res.status(502).json({
    error: 'No JSON usage API found on OpenClaw',
    detail: `Tried ${candidates.join(', ')} on ${OPENCLAW_API_BASE}. The /usage endpoint returns HTML (a web page), not a JSON API.`,
    hint: 'Usage data is still available from local session file scanning.',
  });
});

app.get('/api/openclaw/status', async (req, res) => {
  try {
    const data = await fetchOpenclawJson('/api/status');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Could not reach OpenClaw API', detail: e.message });
  }
});

// Generic OpenClaw API proxy for any endpoint
app.get('/api/openclaw/proxy/*', async (req, res) => {
  const endpoint = '/' + req.params[0];
  try {
    const data = await fetchOpenclawJson(endpoint);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Could not reach OpenClaw API', detail: e.message });
  }
});

// --- Models API ---
app.get('/api/models', (req, res) => {
  try {
    const config = readOpenclawJson();
    const modelsConfig = config.agents?.defaults?.models || {};
    const primary = config.agents?.defaults?.model?.primary;
    const fallbacks = config.agents?.defaults?.model?.fallbacks || [];
    // Collect unique models from config
    const models = new Set([primary, ...fallbacks, ...Object.keys(modelsConfig)].filter(Boolean));
    res.json([...models]);
  } catch {
    res.json([]);
  }
});

app.post('/api/model', (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  try {
    const config = readOpenclawJson();
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    config.agents.defaults.model.primary = model;
    writeOpenclawJson(config);
    res.json({ success: true, model });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// --- Heartbeat API ---
const HEARTBEAT_FILE = path.join(__dirname, 'data', 'heartbeat.json');

app.get('/api/heartbeat', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8'));
    res.json(data);
  } catch {
    res.json({ lastHeartbeat: null });
  }
});

app.post('/api/heartbeat', (req, res) => {
  const data = { lastHeartbeat: Date.now() };
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(data));
  res.json(data);
});

// --- Skills API ---
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w\s]*?):\s*(.+)$/);
    if (m) fm[m[1].trim().toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

function readOpenclawJson() {
  try { return JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8')); } catch { return {}; }
}

function writeOpenclawJson(data) {
  fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(data, null, 2));
}

function scanSkills() {
  const config = readOpenclawJson();
  const entries = config.skills?.entries || {};
  const skills = [];
  for (const [source, dir] of Object.entries(SKILLS_DIRS)) {
    try {
      const dirs = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const d of dirs) {
        const skillPath = path.join(dir, d.name);
        const mdPath = path.join(skillPath, 'SKILL.md');
        let fm = {}, hasMetadata = false;
        try {
          const content = fs.readFileSync(mdPath, 'utf-8');
          fm = parseFrontmatter(content);
          hasMetadata = Object.keys(fm).length > 0;
        } catch {}
        const id = d.name;
        const entry = entries[id];
        skills.push({
          id,
          name: fm.name || d.name,
          description: fm.description || '',
          source,
          enabled: entry?.enabled !== undefined ? entry.enabled : true,
          path: skillPath,
          hasMetadata,
        });
      }
    } catch {}
  }
  return skills;
}

app.get('/api/skills', (req, res) => {
  res.json(scanSkills());
});

app.post('/api/skills/:id/toggle', (req, res) => {
  const config = readOpenclawJson();
  if (!config.skills) config.skills = {};
  if (!config.skills.entries) config.skills.entries = {};
  const enabled = req.body.enabled !== undefined ? req.body.enabled : !(config.skills.entries[req.params.id]?.enabled ?? true);
  config.skills.entries[req.params.id] = { ...(config.skills.entries[req.params.id] || {}), enabled };
  writeOpenclawJson(config);
  const skill = scanSkills().find(s => s.id === req.params.id);
  res.json(skill || { id: req.params.id, enabled });
});

app.post('/api/skills/create', (req, res) => {
  const { name, description, instructions } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const dir = path.join(SKILLS_DIRS.workspace, name);
  fs.mkdirSync(dir, { recursive: true });
  const md = `---\nname: ${name}\ndescription: ${description || ''}\n---\n\n${instructions || ''}`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), md);
  const skill = scanSkills().find(s => s.id === name && s.source === 'workspace');
  res.json(skill || { id: name, name, source: 'workspace' });
});

app.get('/api/skills/:id/content', (req, res) => {
  const all = scanSkills();
  const skill = all.find(s => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: 'Not found' });
  try {
    const content = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf-8');
    res.json({ content });
  } catch { res.status(404).json({ error: 'No SKILL.md' }); }
});

app.delete('/api/skills/:id', (req, res) => {
  const all = scanSkills();
  const skill = all.find(s => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: 'Not found' });
  if (skill.source !== 'workspace') return res.status(403).json({ error: 'Can only delete workspace skills' });
  fs.rmSync(skill.path, { recursive: true, force: true });
  res.json({ ok: true });
});

// --- Files API ---
const EXCLUDED = new Set(['node_modules', '.git']);

app.get('/api/files', (req, res) => {
  const reqPath = req.query.path || '';
  const fullPath = path.join(WORKSPACE, reqPath);
  if (!fullPath.startsWith(WORKSPACE)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
      .filter(e => {
        if (EXCLUDED.has(e.name)) return false;
        if (reqPath === 'dashboard' && e.name === 'node_modules') return false;
        return true;
      })
      .map(e => ({ name: e.name, isDirectory: e.isDirectory(), path: path.join(reqPath, e.name) }))
      .sort((a, b) => b.isDirectory - a.isDirectory || a.name.localeCompare(b.name));
    res.json(entries);
  } catch { res.json([]); }
});

app.get('/api/files/content', (req, res) => {
  const reqPath = req.query.path || '';
  const fullPath = path.join(WORKSPACE, reqPath);
  if (!fullPath.startsWith(WORKSPACE)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content, path: reqPath });
  } catch { res.status(404).json({ error: 'Not found' }); }
});

app.get('/api/files/download', (req, res) => {
  const reqPath = req.query.path || '';
  const fullPath = path.join(WORKSPACE, reqPath);
  if (!fullPath.startsWith(WORKSPACE)) return res.status(403).json({ error: 'Forbidden' });
  res.download(fullPath);
});

// --- Calendar API ---
// Convert an ISO timestamp to a YYYY-MM-DD string in the configured timezone
function isoToDateInTz(isoStr, tz = getTimezone()) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD format
}

app.get('/api/calendar', (req, res) => {
  const memoryDir = path.join(WORKSPACE, 'memory');
  const data = {};
  try {
    const files = fs.readdirSync(memoryDir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
    for (const f of files) {
      const date = f.replace('.md', '');
      data[date] = data[date] || { memory: false, tasks: [] };
      data[date].memory = true;
    }
  } catch {}
  const tasks = readTasks();
  for (const t of tasks) {
    if (t.completedAt) {
      // Convert UTC timestamp to local date in America/New_York
      const date = isoToDateInTz(t.completedAt);
      data[date] = data[date] || { memory: false, tasks: [] };
      data[date].tasks.push(t.title);
    }
  }
  res.json(data);
});

// --- Soul / Workspace File APIs ---
const SOUL_TEMPLATES = [
  { name: 'Minimal Assistant', description: 'Bare bones, helpful, no personality', content: '# SOUL.md\nBe helpful. Be concise. No fluff.' },
  { name: 'Friendly Companion', description: 'Warm, conversational, uses emoji', content: "# SOUL.md - Who You Are\nYou're warm, friendly, and genuinely care about helping. Use emoji naturally (not excessively). Be conversational — talk like a smart friend, not a manual. Have opinions, crack jokes when appropriate, and remember: helpfulness > formality." },
  { name: 'Technical Expert', description: 'Precise, detailed, code-focused', content: "# SOUL.md - Who You Are\nYou are a senior technical consultant. Be precise, thorough, and opinionated about best practices. Prefer code examples over explanations. Flag anti-patterns when you see them. Don't sugarcoat — if something is wrong, say so directly. Efficiency matters." },
  { name: 'Creative Partner', description: 'Imaginative, brainstormy, enthusiastic', content: "# SOUL.md - Who You Are\nYou're a creative collaborator — curious, imaginative, and always looking for unexpected angles. Brainstorm freely. Suggest wild ideas alongside safe ones. Get excited about good concepts. Push creative boundaries while staying grounded in what's achievable." },
  { name: 'Stern Operator', description: 'No-nonsense, military-efficient, dry humor', content: "# SOUL.md - Who You Are\nMission first. Be direct, efficient, and zero-waste in communication. No pleasantries unless earned. Dry humor is acceptable. Report status clearly. Flag risks immediately. You don't ask permission for routine ops — you execute and report. Save the small talk for after the job's done." },
  { name: 'Sarcastic Sidekick', description: 'Witty, slightly snarky, still helpful', content: "# SOUL.md - Who You Are\nYou're helpful, but you're not going to pretend everything is sunshine and rainbows. Deliver assistance with a side of wit. Be sarcastic when it's funny, never when it's cruel. You still get the job done — you just have commentary while doing it. Think dry British humor meets competent engineer." },
];

function readHistoryFile(histPath) {
  try { return JSON.parse(fs.readFileSync(histPath, 'utf-8')); } catch { return []; }
}

function appendHistory(histPath, content) {
  const history = readHistoryFile(histPath);
  history.push({ timestamp: new Date().toISOString(), content });
  while (history.length > 20) history.shift();
  fs.mkdirSync(path.dirname(histPath), { recursive: true });
  fs.writeFileSync(histPath, JSON.stringify(history, null, 2));
  return history;
}

app.get('/api/soul', (req, res) => {
  const fp = path.join(WORKSPACE, 'SOUL.md');
  try {
    const content = fs.readFileSync(fp, 'utf-8');
    const stat = fs.statSync(fp);
    res.json({ content, lastModified: stat.mtime.toISOString() });
  } catch { res.json({ content: '', lastModified: null }); }
});

app.put('/api/soul', (req, res) => {
  const fp = path.join(WORKSPACE, 'SOUL.md');
  const histPath = path.join(__dirname, 'data', 'soul-history.json');
  try {
    const old = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : '';
    if (old) appendHistory(histPath, old);
    fs.writeFileSync(fp, req.body.content);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/soul/history', (req, res) => {
  res.json(readHistoryFile(path.join(__dirname, 'data', 'soul-history.json')));
});

app.post('/api/soul/revert', (req, res) => {
  const fp = path.join(WORKSPACE, 'SOUL.md');
  const histPath = path.join(__dirname, 'data', 'soul-history.json');
  const history = readHistoryFile(histPath);
  const idx = req.body.index;
  if (idx < 0 || idx >= history.length) return res.status(400).json({ error: 'Invalid index' });
  try {
    const current = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : '';
    if (current) appendHistory(histPath, current);
    const content = history[idx].content;
    fs.writeFileSync(fp, content);
    res.json({ success: true, content });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/soul/templates', (req, res) => {
  res.json(SOUL_TEMPLATES);
});

// Generic workspace file API
app.get('/api/workspace-file', (req, res) => {
  const name = req.query.name;
  if (!name || name.includes('/') || name.includes('..')) return res.status(400).json({ error: 'Invalid name' });
  const fp = path.join(WORKSPACE, name);
  try {
    const content = fs.readFileSync(fp, 'utf-8');
    const stat = fs.statSync(fp);
    res.json({ content, lastModified: stat.mtime.toISOString() });
  } catch { res.json({ content: '', lastModified: null }); }
});

app.put('/api/workspace-file', (req, res) => {
  const name = req.query.name;
  if (!name || name.includes('/') || name.includes('..')) return res.status(400).json({ error: 'Invalid name' });
  const fp = path.join(WORKSPACE, name);
  const histPath = path.join(__dirname, 'data', `${name}-history.json`);
  try {
    const old = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : '';
    if (old) appendHistory(histPath, old);
    fs.writeFileSync(fp, req.body.content);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/workspace-file/history', (req, res) => {
  const name = req.query.name;
  if (!name || name.includes('/') || name.includes('..')) return res.status(400).json({ error: 'Invalid name' });
  res.json(readHistoryFile(path.join(__dirname, 'data', `${name}-history.json`)));
});

// --- Settings API ---
app.get('/api/settings', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    const heartbeatEvery = config?.agents?.defaults?.heartbeat?.every || '30m';
    const timezone = config?.agents?.defaults?.timezone || 'UTC';
    res.json({ heartbeatEvery, timezone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { heartbeatEvery, timezone } = req.body;

    // Validate heartbeat
    const allowedHeartbeats = ['5m', '10m', '15m', '30m', '1h'];
    if (heartbeatEvery && !allowedHeartbeats.includes(heartbeatEvery)) {
      return res.status(400).json({ error: 'Invalid heartbeat value' });
    }

    // Validate timezone
    if (timezone) {
      const valid = Intl.supportedValuesOf('timeZone');
      if (!valid.includes(timezone)) {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
    }

    const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};

    const heartbeatChanged = heartbeatEvery && heartbeatEvery !== config.agents.defaults.heartbeat?.every;

    if (heartbeatEvery) {
      if (!config.agents.defaults.heartbeat) config.agents.defaults.heartbeat = {};
      config.agents.defaults.heartbeat.every = heartbeatEvery;
    }
    if (timezone) {
      config.agents.defaults.timezone = timezone;
    }

    fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(config, null, 2));

    const details = {};
    if (heartbeatEvery) details.heartbeatEvery = heartbeatEvery;
    if (timezone) details.timezone = timezone;
    logActivity('dashboard', 'settings_updated', details);

    // Only restart OpenClaw when heartbeat changes
    if (heartbeatChanged) {
      const { exec: execCb } = await import('child_process');
      execCb('openclaw gateway restart', (err) => {
        if (err) console.error('Failed to restart openclaw:', err.message);
      });
    }

    res.json({ ok: true, restarted: !!heartbeatChanged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
