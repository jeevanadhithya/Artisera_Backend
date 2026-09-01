import axios from 'axios';
import { config } from '../src/config';

async function testSarvamTranslate() {
  console.log('Testing Sarvam Translation to English (en-IN)...');
  const url = `${config.SARVAM_BASE_URL}/translate`;

  const sampleHindi = 'यह एक हस्तनिर्मित नीली मिट्टी का फूलदान है जिस पर पारंपरिक राजस्थानी डिजाइन बनी है।';
  const payload = {
    input: sampleHindi,
    source_language_code: 'auto',
    target_language_code: 'en-IN',
    model: config.SARVAM_TRANSLATION_MODEL || 'mayura:v1',
    mode: 'formal',
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        'api-subscription-key': config.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    console.log('✅ Sarvam Translation Success:');
    console.log('Input:', sampleHindi);
    console.log('Output in English:', res.data?.translated_text || res.data?.translations?.[0]?.translated_text);
  } catch (err: any) {
    console.error('❌ Sarvam error:', err?.response?.status, err?.response?.data || err.message);
  }
}

testSarvamTranslate();
