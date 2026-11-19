import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { initializeSchema, getUploadsDir } from './server/db.ts';
import { seedDatabaseIfEmpty } from './server/seed.ts';
import { createApiRouter } from './server/routes.ts';

async function startServer(): Promise<void> {
  initializeSchema();
  seedDatabaseIfEmpty();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Serve uploaded documents and photographs
  app.use('/uploads', express.static(getUploadsDir()));

  // Mount API routes
  app.use('/api', createApiRouter());

  // Error handler for API routes
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Akhuwat Campus Brain running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
