import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { AppError } from './types/errors';
import { getSupabase } from './services/supabase';

// Import Route Handlers
import healthRouter from './routes/health';
import artisansRouter from './routes/artisans';
import productsRouter from './routes/products';
import marketRouter from './routes/market';
import buyersRouter from './routes/buyers';
import matchingRouter from './routes/matching';
import wishlistRouter from './routes/wishlist';
import adminRouter from './routes/admin';
import profileRouter from './routes/profile';
import imagesRouter from './routes/images';
import inquiriesRouter from './routes/inquiries';
import aiJobsRouter from './routes/ai_jobs';
import speechRouter from './routes/speech';

const app = express();


// ─── CORS Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey']
}));

// ─── Body Parsers ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Logging Middleware ──────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();
  
  res.on('finish', () => {
    const duration = (performance.now() - start).toFixed(1);
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// ─── Root Redirect with Live Diagnostics HTML ───────────────────────────────
app.get('/', async (req: Request, res: Response) => {
  let dbStatus = 'ok';
  let dbMessage = 'CONNECTED';
  
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      dbStatus = 'error';
      dbMessage = `DATABASE ERROR: ${error.message}`;
    }
  } catch (err: any) {
    dbStatus = 'error';
    dbMessage = err.message || 'MISSING CONFIG KEYS';
  }

  const geminiStatus = config.GEMINI_API_KEY ? 'ok' : 'warn';
  const geminiMessage = config.GEMINI_API_KEY ? 'CONFIGURED' : 'API KEY MISSING';

  const sarvamStatus = config.SARVAM_API_KEY ? 'ok' : 'warn';
  const sarvamMessage = config.SARVAM_API_KEY ? 'CONFIGURED' : 'API KEY MISSING';

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <title>Artisera Services Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/icon?family=Material+Symbols+Rounded" rel="stylesheet">
    <style>
      :root {
        --md-sys-color-background: #F7F3EA; /* Warm Ivory */
        --md-sys-color-surface: #FFFDF8; /* Soft White */
        --md-sys-color-primary: #C4512D; /* Artisan Terracotta */
        --md-sys-color-primary-dark: #9F3D22; /* Deep Terracotta */
        --md-sys-color-on-surface: #30251F; /* Artisan Brown */
        --md-sys-color-on-surface-variant: #75665D; /* Warm Brown */
        --md-sys-color-outline: #E5D8C8; /* Soft Beige */
        --md-sys-color-success: #65745A; /* Earth Green */
        --md-sys-color-error: #A63D2F; /* Deep Brick */
      }
      
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Outfit', sans-serif;
        background-color: var(--md-sys-color-background);
        color: var(--md-sys-color-on-surface);
        line-height: 1.5;
        padding: 3rem 1.5rem;
      }
      header {
        text-align: center;
        margin-bottom: 3rem;
      }
      header h1 {
        color: var(--md-sys-color-primary-dark);
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
      }
      header p {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 1.1rem;
      }
      
      .dashboard-container {
        max-width: 1200px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: 1.5rem;
      }
      
      .service-card {
        background-color: var(--md-sys-color-surface);
        border: 1px solid var(--md-sys-color-outline);
        border-radius: 22px; /* Material 3 large radius */
        padding: 1.5rem;
        box-shadow: 0 4px 20px rgba(48, 37, 31, 0.05);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .service-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(48, 37, 31, 0.08);
      }
      
      .card-header {
        display: flex;
        align-items: center;
        margin-bottom: 1.25rem;
        gap: 1rem;
      }
      .card-icon {
        background-color: rgba(196, 81, 45, 0.1);
        color: var(--md-sys-color-primary);
        width: 52px;
        height: 52px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card-icon .material-symbols-rounded {
        font-size: 28px;
      }
      .card-title-group {
        flex: 1;
      }
      .card-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
        line-height: 1.2;
      }
      .card-subtitle {
        font-size: 0.85rem;
        color: var(--md-sys-color-on-surface-variant);
        margin-top: 0.25rem;
      }
      .status-badge {
        padding: 0.35rem 0.75rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .status-badge.ok {
        background-color: rgba(101, 116, 90, 0.15);
        color: var(--md-sys-color-success);
      }
      .status-badge.error {
        background-color: rgba(166, 61, 47, 0.15);
        color: var(--md-sys-color-error);
      }
      
      .endpoints-list {
        margin-top: 1rem;
        border-top: 1px dashed var(--md-sys-color-outline);
        padding-top: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .endpoint-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.95rem;
      }
      .endpoint-name {
        color: var(--md-sys-color-on-surface-variant);
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-weight: 500;
      }
      .endpoint-name .material-symbols-rounded {
        font-size: 18px;
        opacity: 0.8;
      }
      .endpoint-path {
        background-color: rgba(48, 37, 31, 0.04);
        padding: 0.3rem 0.6rem;
        border-radius: 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: var(--md-sys-color-on-surface);
        font-size: 0.85rem;
        font-weight: 600;
      }
      
      .global-status {
        max-width: 1200px;
        margin: 0 auto 2.5rem;
        display: flex;
        justify-content: center;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1.25rem;
        border-radius: 24px;
        background-color: var(--md-sys-color-surface);
        border: 1px solid var(--md-sys-color-outline);
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
        box-shadow: 0 2px 8px rgba(48, 37, 31, 0.03);
      }
      
      @media (max-width: 768px) {
        .dashboard-container { grid-template-columns: 1fr; }
        header h1 { font-size: 2rem; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Artisera Backend Services</h1>
      <p>API Registry & Microservices Dashboard</p>
    </header>
    
    <div class="global-status">
      <div class="chip">
        <span class="material-symbols-rounded" style="color: var(--md-sys-color-success); font-size: 20px;">database</span>
        Supabase: \${dbStatus.toUpperCase()}
      </div>
      <div class="chip">
        <span class="material-symbols-rounded" style="color: var(--md-sys-color-primary); font-size: 20px;">memory</span>
        Gemini: \${geminiMessage}
      </div>
      <div class="chip">
        <span class="material-symbols-rounded" style="color: var(--md-sys-color-primary); font-size: 20px;">record_voice_over</span>
        Sarvam: \${sarvamMessage}
      </div>
      <div class="chip">
        <span class="material-symbols-rounded" style="font-size: 20px;">cloud</span>
        Env: \${config.ENVIRONMENT || 'production'}
      </div>
    </div>
    
    <div class="dashboard-container">
      
      <!-- Core Node.js API -->
      <div class="service-card">
        <div class="card-header">
          <div class="card-icon"><span class="material-symbols-rounded">api</span></div>
          <div class="card-title-group">
            <div class="card-title">Core API Gateway</div>
            <div class="card-subtitle">Express.js Serverless Backend</div>
          </div>
          <div class="status-badge ok">Online</div>
        </div>
        <div class="endpoints-list">
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">monitor_heart</span> Health</div>
            <div class="endpoint-path">/api/health</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">group</span> Artisans</div>
            <div class="endpoint-path">/api/artisans</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">inventory_2</span> Products</div>
            <div class="endpoint-path">/api/products</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">storefront</span> Market Linkage</div>
            <div class="endpoint-path">/api/market</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">shopping_bag</span> Buyers</div>
            <div class="endpoint-path">/api/buyers</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">admin_panel_settings</span> Admin</div>
            <div class="endpoint-path">/api/admin</div>
          </div>
        </div>
      </div>
      
      <!-- AI & Processing Services -->
      <div class="service-card">
        <div class="card-header">
          <div class="card-icon"><span class="material-symbols-rounded">psychology</span></div>
          <div class="card-title-group">
            <div class="card-title">AI Engine Services</div>
            <div class="card-subtitle">Matchmaking & Translation</div>
          </div>
          <div class="status-badge ok">Online</div>
        </div>
        <div class="endpoints-list">
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">handshake</span> AI Matchmaking</div>
            <div class="endpoint-path">/api/matching</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">work_history</span> Async AI Jobs</div>
            <div class="endpoint-path">/api/ai/jobs</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">translate</span> Speech (Sarvam)</div>
            <div class="endpoint-path">/api/speech</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">favorite</span> B2B Wishlists</div>
            <div class="endpoint-path">/api/wishlist</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">contact_mail</span> Inquiries</div>
            <div class="endpoint-path">/api/inquiries</div>
          </div>
        </div>
      </div>

      <!-- Python CV Worker -->
      <div class="service-card">
        <div class="card-header">
          <div class="card-icon"><span class="material-symbols-rounded">image</span></div>
          <div class="card-title-group">
            <div class="card-title">Computer Vision Worker</div>
            <div class="card-subtitle">FastAPI Image Enhancement</div>
          </div>
          <div class="status-badge ok">Active</div>
        </div>
        <div class="endpoints-list">
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">settings_heart</span> CV Health</div>
            <div class="endpoint-path">/ml/health</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">auto_awesome</span> Image Enhance</div>
            <div class="endpoint-path">/ml/enhance</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">photo_library</span> Image Gateway</div>
            <div class="endpoint-path">/api/images</div>
          </div>
          <div class="endpoint-item">
            <div class="endpoint-name"><span class="material-symbols-rounded">account_circle</span> Profiles</div>
            <div class="endpoint-path">/api/profile</div>
          </div>
        </div>
      </div>

    </div>
  </body>
  </html>
  `;
  res.status(200).send(html);
});

// ─── Root Health Check ───────────────────────────────────────────────────────
app.use('/', healthRouter);

// ─── API Routes ──────────────────────────────────────────────────────────────
const API_PREFIX = '/api';

app.use(`${API_PREFIX}`, healthRouter);
app.use(`${API_PREFIX}/artisans`, artisansRouter);
app.use(`${API_PREFIX}/products`, productsRouter);
app.use(`${API_PREFIX}/market`, marketRouter);
app.use(`${API_PREFIX}/buyers`, buyersRouter);
app.use(`${API_PREFIX}/matching`, matchingRouter);
app.use(`${API_PREFIX}/wishlist`, wishlistRouter);
app.use(`${API_PREFIX}/admin`, adminRouter);
app.use(`${API_PREFIX}/profile`, profileRouter);
app.use(`${API_PREFIX}/images`, imagesRouter);
app.use(`${API_PREFIX}/inquiries`, inquiriesRouter);
app.use(`${API_PREFIX}/ai/jobs`, aiJobsRouter);
app.use(`${API_PREFIX}/speech`, speechRouter);

// Fallbacks for direct route matching
app.use('/health', healthRouter);
app.use('/artisans', artisansRouter);
app.use('/products', productsRouter);
app.use('/market', marketRouter);
app.use('/buyers', buyersRouter);
app.use('/matching', matchingRouter);
app.use('/wishlist', wishlistRouter);
app.use('/admin', adminRouter);
app.use('/profile', profileRouter);
app.use('/images', imagesRouter);
app.use('/inquiries', inquiriesRouter);
app.use('/ai/jobs', aiJobsRouter);
app.use('/speech', speechRouter);


// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // If it's a known application error, send standard payload
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message
      }
    });
  }

  // Handle generic / unexpected error
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred'
    }
  });
});

export default app;
