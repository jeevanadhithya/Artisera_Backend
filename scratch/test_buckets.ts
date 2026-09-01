import { getSupabase } from '../src/services/supabase';

async function main() {
  try {
    const supabase = getSupabase();
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      console.error('List buckets error:', error);
    } else {
      console.log('Buckets in Supabase:', buckets.map(b => ({ id: b.id, name: b.name, public: b.public })));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
