import http from 'http';
import assert from 'node:assert/strict';
import app from '../src/app';
import * as db from '../src/services/db';
import { getPool } from '../src/services/db';
import ExcelJS from 'exceljs';

async function main() {
  const pool = getPool();
  console.log('🚀 Starting Marketplace Export API Acceptance Checks...');

  // 1. Setup Test Artisan & Product from existing database records
  let product = (await pool.query('SELECT * FROM public.products ORDER BY created_at DESC LIMIT 1')).rows[0];
  if (!product) {
    throw new Error('No product found in database to test exports on.');
  }

  let artisan = (await pool.query('SELECT * FROM public.artisans WHERE id = $1', [product.artisan_id])).rows[0];
  if (!artisan) {
    throw new Error(`Artisan ${product.artisan_id} for product not found.`);
  }

  // Ensure product has genuine sample fields for evaluation without overwriting primary identity
  await pool.query(`
    UPDATE public.products
    SET sku = COALESCE(sku, 'GI-IND-2024-889'),
        mrp = COALESCE(mrp, 2500),
        stock_quantity = COALESCE(stock_quantity, 10),
        hsn_code = COALESCE(hsn_code, '91021100'),
        gst_rate = COALESCE(gst_rate, 18.0),
        country_of_origin = COALESCE(country_of_origin, 'India'),
        brand = COALESCE(brand, 'Artisera Collection')
    WHERE id = $1;
  `, [product.id]);

  // Reload product
  product = (await pool.query('SELECT * FROM public.products WHERE id = $1', [product.id])).rows[0];
  const productId = product.id;
  console.log(`✅ Using Test Artisan ID: ${artisan.id} (user_id: ${artisan.user_id})`);
  console.log(`✅ Using Test Product ID: ${productId} (${product.name})`);

  // 2. Start server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const authHeader = {
    Authorization: 'Bearer test-token',
    'x-test-user-id': artisan.user_id,
    'Content-Type': 'application/json'
  };

  const initialAuditCount = parseInt(
    (await pool.query('SELECT count(*) FROM public.marketplace_exports WHERE product_id = $1', [productId])).rows[0].count,
    10
  );

  // Helper for requests
  const request = async (path: string, options: { method?: string; body?: any; headers?: any } = {}) => {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: { ...authHeader, ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      return { status: res.status, headers: res.headers, json };
    } else {
      const buffer = Buffer.from(await res.arrayBuffer());
      return { status: res.status, headers: res.headers, buffer };
    }
  };

  // CHECK 1: GET /api/marketplaces
  console.log('\nTesting GET /api/marketplaces...');
  const resMarketplaces = await request('/api/marketplaces');
  assert.equal(resMarketplaces.status, 200);
  assert.ok(resMarketplaces.json.success);
  assert.ok(Array.isArray(resMarketplaces.json.data));
  const marketplaceIds = resMarketplaces.json.data.map((m: any) => m.id);
  console.log('Available marketplaces:', marketplaceIds);
  assert.ok(marketplaceIds.includes('amazon'));
  assert.ok(marketplaceIds.includes('flipkart'));
  assert.ok(marketplaceIds.includes('gem'));
  assert.ok(marketplaceIds.includes('ondc'));
  assert.ok(marketplaceIds.includes('meesho'));
  // Ensure none claim live automatic publishing
  resMarketplaces.json.data.forEach((m: any) => {
    assert.equal(m.live_connection, false, 'Marketplace must not claim live automatic connection');
  });

  // CHECK 2: GET /api/products/:id/export-options
  console.log(`\nTesting GET /api/products/${productId}/export-options...`);
  const resOptions = await request(`/api/products/${productId}/export-options`);
  assert.equal(resOptions.status, 200);
  assert.ok(resOptions.json.success);
  assert.ok(Array.isArray(resOptions.json.data));
  const evaluatedOptions = resOptions.json.data;
  assert.equal(evaluatedOptions.length, 6);
  evaluatedOptions.forEach((opt: any) => {
    assert.ok(['READY', 'PARTIALLY_READY', 'NOT_READY'].includes(opt.status));
    assert.ok(typeof opt.readiness === 'number');
    assert.ok(Array.isArray(opt.missing_fields));
    assert.ok(Array.isArray(opt.warnings));
  });
  console.log(`Export options received for ${evaluatedOptions.length} channels.`);

  // CHECK 3: GET /api/products/:id/export/amazon/readiness
  console.log(`\nTesting GET /api/products/${productId}/export/amazon/readiness...`);
  const resAmzReadiness = await request(`/api/products/${productId}/export/amazon/readiness`);
  assert.equal(resAmzReadiness.status, 200);
  assert.ok(resAmzReadiness.json.success);
  assert.equal(resAmzReadiness.json.data.marketplace, 'amazon');
  console.log(`Amazon Readiness: ${resAmzReadiness.json.data.readiness}%, Status: ${resAmzReadiness.json.data.status}`);

  // CHECK 4: GET /api/products/:id/export/amazon/preview
  console.log(`\nTesting GET /api/products/${productId}/export/amazon/preview...`);
  const resAmzPreview = await request(`/api/products/${productId}/export/amazon/preview`);
  assert.equal(resAmzPreview.status, 200);
  assert.ok(resAmzPreview.json.success);
  assert.ok(resAmzPreview.json.data.mapped_data);
  assert.ok(resAmzPreview.json.data.mapped_data.sku);
  console.log('Amazon Preview Mapped SKU:', resAmzPreview.json.data.mapped_data.sku);

  // CHECK 5: POST /api/products/:id/export/amazon/generate with { "format": "xlsx" }
  console.log(`\nTesting POST /api/products/${productId}/export/amazon/generate (xlsx)...`);
  const resAmzGen = await request(`/api/products/${productId}/export/amazon/generate`, {
    method: 'POST',
    body: { format: 'xlsx' }
  });
  assert.equal(resAmzGen.status, 200);
  assert.equal(
    resAmzGen.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  assert.ok(resAmzGen.headers.get('content-disposition')?.includes('ARTISERA_AMAZON_'));
  assert.ok(resAmzGen.headers.get('content-disposition')?.endsWith('.xlsx"'));
  // Verify XLSX opens in ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(resAmzGen.buffer as any);
  const sheet = workbook.getWorksheet('Listing');
  assert.ok(sheet, 'Workbook must contain "Listing" sheet');
  assert.ok((sheet?.rowCount ?? 0) >= 2, 'Worksheet must contain header and data rows');
  console.log(`✅ Amazon XLSX is valid Excel workbook with ${sheet?.rowCount} rows and ${sheet?.columnCount} columns.`);

  // CHECK 6: POST /api/products/:id/export/flipkart/generate with { "format": "csv" }
  console.log(`\nTesting POST /api/products/${productId}/export/flipkart/generate (csv)...`);
  const resFkGen = await request(`/api/products/${productId}/export/flipkart/generate`, {
    method: 'POST',
    body: { format: 'csv' }
  });
  assert.equal(resFkGen.status, 200);
  assert.ok(resFkGen.headers.get('content-type')?.includes('text/csv'));
  const csvContent = resFkGen.buffer!.toString('utf8');
  assert.ok(csvContent.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM for Indian regional scripts');
  const lines = csvContent.replace('\uFEFF', '').split('\n').filter(Boolean);
  assert.ok(lines.length >= 2, 'CSV must have at least header and one data row');
  assert.ok(lines[0].includes('"Seller SKU ID"'), 'Header must be correctly quoted and escaped');
  assert.ok(lines[0].includes('"MRP"'), 'Header must contain MRP');
  console.log('✅ Flipkart CSV is valid UTF-8, contains BOM, and is properly escaped.');

  // CHECK 7: POST /api/products/:id/export/gem/generate with { "format": "pdf" }
  console.log(`\nTesting POST /api/products/${productId}/export/gem/generate (pdf)...`);
  const resGemGen = await request(`/api/products/${productId}/export/gem/generate`, {
    method: 'POST',
    body: { format: 'pdf' }
  });
  assert.equal(resGemGen.status, 200);
  assert.equal(resGemGen.headers.get('content-type'), 'application/pdf');
  const pdfMagic = resGemGen.buffer!.subarray(0, 4).toString('utf8');
  assert.equal(pdfMagic, '%PDF', 'PDF buffer must begin with %PDF header');
  console.log('✅ GeM PDF is valid document beginning with %PDF.');

  // CHECK 8: POST /api/products/:id/export/ondc/generate with { "format": "json" }
  console.log(`\nTesting POST /api/products/${productId}/export/ondc/generate (json)...`);
  const resOndcGen = await request(`/api/products/${productId}/export/ondc/generate`, {
    method: 'POST',
    body: { format: 'json' }
  });
  assert.equal(resOndcGen.status, 200);
  assert.ok(resOndcGen.headers.get('content-type')?.includes('application/json'));
  const ondcData = resOndcGen.json;
  assert.equal(ondcData.marketplace, 'ondc');
  assert.ok(ondcData.mapped_data.item, 'ONDC mapped data must include Beckn item');
  assert.ok(ondcData.mapped_data.seller, 'ONDC mapped data must include seller');
  assert.ok(ondcData.mapped_data.compliance, 'ONDC mapped data must include compliance');
  console.log('✅ ONDC JSON is valid Beckn catalogue package.');

  // CHECK 9: Confirm marketplace_exports audit trail
  console.log('\nVerifying audit records in public.marketplace_exports...');
  const currentAuditCount = parseInt(
    (await pool.query('SELECT count(*) FROM public.marketplace_exports WHERE product_id = $1', [productId])).rows[0].count,
    10
  );
  const auditRecords = (await pool.query(
    'SELECT marketplace, format, status, template_version, created_at FROM public.marketplace_exports WHERE product_id = $1 ORDER BY created_at DESC LIMIT 10;',
    [productId]
  )).rows;
  console.table(auditRecords);
  assert.ok(currentAuditCount >= initialAuditCount + 4, `Audit table must have recorded at least 4 new exports (current: ${currentAuditCount}, initial: ${initialAuditCount})`);
  const generatedMarketplaces = auditRecords.map(r => r.marketplace);
  assert.ok(generatedMarketplaces.includes('amazon'));
  assert.ok(generatedMarketplaces.includes('flipkart'));
  assert.ok(generatedMarketplaces.includes('gem'));
  assert.ok(generatedMarketplaces.includes('ondc'));

  // Clean up server
  server.close();
  await pool.end();
  console.log('\n🎉 ALL 8 API ACCEPTANCE CHECKS AND VALIDATIONS PASSED!');
}

main().catch(err => {
  console.error('Acceptance test failed:', err);
  process.exit(1);
});
