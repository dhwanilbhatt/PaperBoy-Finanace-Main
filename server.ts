import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { isSqlConfigured } from './src/db/index.ts';
import { createAnalystNote, getNotesForUser } from './src/db/users.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  getLiveGoogleMarketState,
  getRecentSyncRunsFromSql,
  hydrateMarketCacheFromSql,
  runGoogleMarketSync,
  setGoogleSyncIntervalMinutes,
  startGoogleMarketScheduler,
} from './src/server/googleMarketTracker.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap() {
  const app = express();
  app.use(express.json());

  // Live Google Search grounded market feed (5-10 min cadence)
  app.get('/api/market/live', (_req, res) => {
    const state = getLiveGoogleMarketState();
    res.json(state);
  });

  app.post('/api/market/refresh', async (req, res) => {
    const requestedInterval = req.body?.intervalMinutes;
    if (
      typeof requestedInterval === 'number' &&
      Number.isFinite(requestedInterval) &&
      requestedInterval >= 30 &&
      requestedInterval <= 240
    ) {
      setGoogleSyncIntervalMinutes(requestedInterval);
    }
    const triggerSource =
      req.body?.source === 'background' ? 'client-background' : 'manual';
    const force = req.body?.force !== false && triggerSource === 'manual';
    const state = await runGoogleMarketSync(triggerSource, force);
    const httpCode = state.syncError && !state.isGrounded ? 502 : 200;
    res.status(httpCode).json(state);
  });

  app.post('/api/market/schedule', (req, res) => {
    const minutes = Number(req.body?.intervalMinutes);
    if (!Number.isFinite(minutes) || minutes < 30 || minutes > 240) {
      return res.status(400).json({ error: 'Auto-refresh cadence must be between 30 and 240 minutes to stay within API limits.' });
    }
    const state = setGoogleSyncIntervalMinutes(minutes);
    return res.json(state);
  });

  app.get('/api/market/history', async (_req, res) => {
    try {
      const runs = await getRecentSyncRunsFromSql();
      return res.json({ sqlConfigured: isSqlConfigured(), runs });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch market sync history.';
      return res.status(500).json({ error: message, runs: [] });
    }
  });

  // Authenticated Cloud SQL Analyst Notes routes
  app.get('/api/notes', requireAuth, async (req: AuthRequest, res) => {
    if (!isSqlConfigured()) {
      return res.json({ notes: [] });
    }
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const notes = await getNotesForUser(uid);
      return res.json({ notes });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load analyst notes.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/notes', requireAuth, async (req: AuthRequest, res) => {
    if (!isSqlConfigured()) {
      return res.status(503).json({ error: 'Relational note persistence is initializing.' });
    }
    try {
      const uid = req.user?.uid;
      const email = req.user?.email ?? 'analyst@paperboyfinance.local';
      const displayName = typeof req.user?.name === 'string' ? req.user.name : undefined;
      const sectionId = String(req.body?.sectionId ?? 'home').slice(0, 64);
      const noteText = String(req.body?.note ?? '').trim().slice(0, 500);

      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      if (noteText.length < 3) {
        return res.status(400).json({ error: 'Please write at least 3 characters for your desk note.' });
      }

      const saved = await createAnalystNote(uid, email, sectionId, noteText, displayName);
      return res.status(201).json({ note: saved });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save analyst note.';
      return res.status(500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = resolve(__dirname, 'dist');

  if (!isProd || !existsSync(distDir)) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Paper Boy Finance server listening on http://0.0.0.0:${PORT}`);
    // Hydrate from Cloud SQL cache first so restarts stay well within 3,000 req/month API budget
    void (async () => {
      await hydrateMarketCacheFromSql();
      startGoogleMarketScheduler(30);
      await runGoogleMarketSync('startup', false);
    })();
  });
}

void bootstrap();
