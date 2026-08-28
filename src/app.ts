import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { AppError } from './types/errors';

// Import Route Handlers
import healthRouter from './routes/health';
import artisansRouter from './routes/artisans';
import productsRouter from './routes/products';
import marketRouter from './routes/market';
import buyersRouter from './routes/buyers';
import matchingRouter from './routes/matching';
import wishlistRouter from './routes/wishlist';
import adminRouter from './routes/admin';

const app = express();

// ─── CORS Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in the allowed list
    const isAllowed = config.CORS_ORIGINS.some(allowed => {
      return allowed === '*' || origin === allowed || origin.startsWith(allowed);
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// ─── Root Redirect ───────────────────────────────────────────────────────────
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'Artisera API',
    version: '1.0.0',
    docs: '/docs',
    health: '/health'
  });
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
