import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

const csvPath = path.join(process.cwd(), 'data', 'recordings.csv');
const csvText = fs.readFileSync(csvPath, 'utf8');
const rows = parse(csvText, { columns: true, skip_empty_lines: true });
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const chunkSize = 500;
let imported = 0;
for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize).map((row) => ({
    id: row.id,
    file_number: row.file_number,
    category: row.category,
    title: row.title,
    verse: row.verse,
    lectured_date: row.lectured_date,
    lectured_location: row.lectured_location,
    filename: row.filename,
    drive_url: row.drive_url,
    drive_file_id: row.drive_file_id,
    direct_url: row.direct_url,
    embed_url: row.embed_url,
  }));
  const { error } = await supabase.from('recordings').upsert(chunk, { onConflict: 'id' });
  if (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
  imported += chunk.length;
  console.log(`Imported ${imported}/${rows.length}`);
}

console.log('Done. All recordings imported.');
