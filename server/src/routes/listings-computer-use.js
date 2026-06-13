import { Router } from 'express';
import { autoListWithComputerUse, testComputerUse, calibrateCoordinates } from '../services/taobao-computer-use.js';

const router = Router();

/**
 * POST /api/listings/auto-list-computer-use
 * Auto-list using computer-use MCP
 */
router.post('/auto-list-computer-use', async (req, res) => {
  try {
    const { productIds, dryRun = false } = req.body;

    if (!productIds || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'productIds is required'
      });
    }

    // Load product data
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const productsFile = join(process.cwd(), '..', 'data', 'my_products.json');

    let products = [];
    try {
      const data = JSON.parse(readFileSync(productsFile, 'utf-8'));
      products = data.filter(p => productIds.includes(p.id));
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Products not found'
      });
    }

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No products found with given IDs'
      });
    }

    // Process each product
    const results = [];
    for (const product of products) {
      try {
        const result = await autoListWithComputerUse(product, { dryRun });
        results.push({
          productId: product.id,
          productTitle: product.title,
          ...result
        });
      } catch (error) {
        results.push({
          productId: product.id,
          productTitle: product.title,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} products`,
      results
    });

  } catch (error) {
    console.error('[API] Auto-list error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/listings/test-computer-use
 * Test computer-use automation with dry run
 */
router.post('/test-computer-use', async (req, res) => {
  try {
    const result = await testComputerUse();
    res.json({
      success: true,
      message: 'Test completed',
      result
    });
  } catch (error) {
    console.error('[API] Test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/listings/calibrate
 * Start coordinate calibration
 */
router.post('/calibrate', async (req, res) => {
  try {
    // Note: Calibration requires interactive browser
    // This endpoint starts the process, but user needs to interact with browser
    res.json({
      success: true,
      message: 'Calibration started. Please run: node server/calibrate-coordinates.js',
      instructions: [
        '1. Run: node server/calibrate-coordinates.js',
        '2. Login to Taobao in the opened browser',
        '3. Click on each element to record coordinates',
        '4. Press Ctrl+C when done',
        '5. Coordinates will be saved to data/element-coordinates.json'
      ]
    });
  } catch (error) {
    console.error('[API] Calibrate error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/listings/coordinates
 * Get saved element coordinates
 */
router.get('/coordinates', async (req, res) => {
  try {
    const { readFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const coordsFile = join(process.cwd(), '..', 'data', 'element-coordinates.json');

    if (!existsSync(coordsFile)) {
      return res.json({
        success: true,
        coordinates: null,
        message: 'No coordinates saved yet. Run calibration first.'
      });
    }

    const coordinates = JSON.parse(readFileSync(coordsFile, 'utf-8'));
    res.json({
      success: true,
      coordinates
    });
  } catch (error) {
    console.error('[API] Get coordinates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/listings/coordinates
 * Update element coordinates
 */
router.put('/coordinates', async (req, res) => {
  try {
    const { coordinates } = req.body;
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const coordsFile = join(process.cwd(), '..', 'data', 'element-coordinates.json');

    writeFileSync(coordsFile, JSON.stringify(coordinates, null, 2));

    res.json({
      success: true,
      message: 'Coordinates updated'
    });
  } catch (error) {
    console.error('[API] Update coordinates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
