import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import * as productService from './index.js';

const router = Router();

// GET /products - Search with pagination
router.get(
  '/',
  authMiddleware as any,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      search,
      minPrice,
      maxPrice,
      category,
      page = '1',
      limit = '20',
    } = req.query;

    const result = await productService.searchProducts({
      search: search as string | undefined,
      minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      category: category as string | undefined,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    });

    res.status(200).json({
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: parseInt(limit as string, 10) || 20,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  })
);

// GET /products/:id
router.get(
  '/:id',
  authMiddleware as any,
  asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getProduct(req.params.id);

    if (!product) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Product not found',
          correlationId: req.correlationId,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  })
);

// POST /products - Create product (admin only)
router.post(
  '/',
  authMiddleware as any,
  requireRole('admin') as any,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, basePrice, imageUrl, category } = req.body;

    if (!name || basePrice === undefined) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and basePrice are required',
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const product = await productService.createProduct({
      name,
      description,
      basePrice,
      imageUrl,
      category,
    });

    res.status(201).json({
      success: true,
      data: product,
    });
  })
);

// PUT /products/:id - Update product (admin only)
router.put(
  '/:id',
  authMiddleware as any,
  requireRole('admin') as any,
  asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.updateProduct(req.params.id, req.body);

    res.status(200).json({
      success: true,
      data: product,
    });
  })
);

// DELETE /products/:id - Delete product (admin only)
router.delete(
  '/:id',
  authMiddleware as any,
  requireRole('admin') as any,
  asyncHandler(async (req: Request, res: Response) => {
    await productService.deleteProduct(req.params.id);

    res.status(204).send();
  })
);

export default router;
