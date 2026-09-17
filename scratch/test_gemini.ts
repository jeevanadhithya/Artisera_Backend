import axios from 'axios';
import { config } from '../src/config';

async function test() {
  const models = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`;
      const res = await axios.post(url, { contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }] });
      console.log(model, 'SUCCESS:', res.data?.candidates?.[0]?.content?.parts?.[0]?.text);
      break;
    } catch (e: any) {
      console.log(model, 'FAILED:', e.response?.status, e.response?.data?.error?.message || e.message);
    }
  }
}

test();
