import axios from 'axios';
import { config } from '../src/config';

async function testGemini() {
  console.log('Testing Gemini model:', config.GEMINI_MODEL);
  console.log('Gemini API key configured:', !!config.GEMINI_API_KEY);

  // 1x1 transparent GIF or small sample image base64
  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const prompt = `Analyze this uploaded artisan product photograph for professional e-commerce preparation.

Identify only information that is actually visible.

Determine, where visually possible:

- Product type
- Product category
- Craft type
- Material
- Visible colors
- Visible patterns
- Background quality
- Lighting quality
- Exposure
- Contrast
- White balance
- Sharpness
- Composition
- Product positioning
- Whether the product is centered
- Whether distracting objects are present
- Whether background cleanup is required
- Whether cropping is required
- Whether resizing is required

Do not invent information.

Do not alter or redesign the product.

The product's:
- shape
- proportions
- actual colors
- patterns
- embroidery
- weaving
- texture
- material
- decorations
- craftsmanship

must remain unchanged.

Generate only photographic enhancement instructions.

Return structured JSON containing:
- product information
- image quality analysis
- enhancement operations

Possible enhancement operations:

background_cleanup
background_removal
brightness_correction
contrast_adjustment
white_balance
mild_sharpening
noise_reduction
crop
center_product
resize
compression

Do not generate an image.
Do not invent missing product details.`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/png',
              data: sampleBase64,
            },
          },
          { text: 'Return structured JSON according to the schema.' }
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          product: {
            type: 'OBJECT',
            properties: {
              type: { type: 'STRING' },
              category: { type: 'STRING' },
              craftType: { type: 'STRING' },
              material: { type: 'STRING' },
              colors: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['type', 'category', 'craftType', 'material', 'colors'],
          },
          imageQuality: {
            type: 'OBJECT',
            properties: {
              background: { type: 'STRING' },
              lighting: { type: 'STRING' },
              exposure: { type: 'STRING' },
              sharpness: { type: 'STRING' },
              composition: { type: 'STRING' },
            },
            required: ['background', 'lighting', 'exposure', 'sharpness', 'composition'],
          },
          enhancement: {
            type: 'OBJECT',
            properties: {
              backgroundCleanup: { type: 'BOOLEAN' },
              backgroundRemoval: { type: 'BOOLEAN' },
              brightnessCorrection: { type: 'BOOLEAN' },
              contrastAdjustment: { type: 'BOOLEAN' },
              whiteBalance: { type: 'BOOLEAN' },
              sharpening: { type: 'BOOLEAN' },
              noiseReduction: { type: 'BOOLEAN' },
              crop: { type: 'BOOLEAN' },
              centerProduct: { type: 'BOOLEAN' },
              resize: { type: 'BOOLEAN' },
            },
            required: [
              'backgroundCleanup',
              'backgroundRemoval',
              'brightnessCorrection',
              'contrastAdjustment',
              'whiteBalance',
              'sharpening',
              'noiseReduction',
              'crop',
              'centerProduct',
              'resize',
            ],
          },
        },
        required: ['product', 'imageQuality', 'enhancement'],
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;

  try {
    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    console.log('✅ Gemini 2.5 Flash Response:');
    console.log(res.data?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (err: any) {
    console.error('❌ Gemini Error:', err?.response?.status, err?.response?.data || err.message);
  }
}

testGemini();
