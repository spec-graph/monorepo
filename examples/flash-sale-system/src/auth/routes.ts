import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { loginRateLimiter } from '../middleware/rate-limiter.js';
import * as auth from './index.js';

const router = Router();

// POST /auth/register
router.post(
  '/register',
  loginRateLimiter as any,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const result = await auth.registerUser(email, password);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  })
);

// POST /auth/login
router.post(
  '/login',
  loginRateLimiter as any,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const result = await auth.loginUser(email, password);

    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  })
);

// POST /auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh token is required',
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const result = await auth.refreshUserToken(refreshToken);

    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  })
);

// POST /auth/logout
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      try {
        const { verifyRefreshToken } = await import('../middleware/auth.js');
        const payload = verifyRefreshToken(refreshToken);
        await auth.revokeAllUserTokens(payload.sub);
      } catch {
        // Ignore errors during logout - token may be already invalid
      }
    }

    res.status(200).json({
      success: true,
      data: { message: 'Logged out' },
    });
  })
);

export default router;
