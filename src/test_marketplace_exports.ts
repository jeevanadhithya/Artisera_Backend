import assert from 'node:assert/strict';
import { evaluate, generate } from './services/marketplaceExport';

const product = { id: '00000000-0000-4000-8000-000000000001', sku: 'GI-IND-2024-889', name: 'Luxury Quartz Watch', category: 'Fashion / Watches', description_en: 'Existing Artisera description.', price: 2030, wholesale_price: 1665, stock_quantity: 10, material: 'Metal, Glass', state_of_origin: 'Uttar Pradesh', image_url: 'https://example.org/watch.jpg', mrp: 2500 };
const artisan = { id: '00000000-0000-4000-8000-000000000002', user_id: '00000000-0000-4000-8000-000000000003', name: 'Artisan', state: 'Uttar Pradesh' };

async function run() {
  const amazon = evaluate(product, artisan, 'amazon');
  assert.equal(amazon.marketplace, 'amazon'); assert.ok(amazon.warnings.some(w => w.includes('GTIN')));
  const flipkart = evaluate(product, artisan, 'flipkart'); assert.ok(flipkart.missing_fields.some(f => f.field === 'manufacturer_details'));
  const gem = evaluate(product, artisan, 'gem'); assert.ok(gem.missing_fields.some(f => f.field === 'hsn_code'));
  const ondc = evaluate(product, artisan, 'ondc'); assert.equal((ondc.mapped_data.item as any).price.value, 2030);
  assert.ok(evaluate({ ...product, price: 0 }, artisan, 'amazon').missing_fields.some(f => f.field === 'price'));
  assert.ok(evaluate({ ...product, image_url: '' }, artisan, 'amazon').missing_fields.some(f => f.field === 'images'));
  assert.ok(evaluate({ ...product, sku: '' }, artisan, 'amazon').missing_fields.some(f => f.field === 'sku'));
  assert.ok(evaluate({ ...product, name: 'x'.repeat(201) }, artisan, 'amazon').warnings.some(w => w.includes('200-character')));
  const xlsx = await generate(product, artisan, 'amazon', 'xlsx'); assert.equal(xlsx.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); assert.ok(xlsx.buffer.length > 100);
  const pdf = await generate(product, artisan, 'gem', 'pdf'); assert.equal(pdf.contentType, 'application/pdf'); assert.ok(pdf.buffer.subarray(0, 4).toString() === '%PDF');
  console.log('Marketplace export adapter tests passed.');
}
run().catch(error => { console.error(error); process.exit(1); });
