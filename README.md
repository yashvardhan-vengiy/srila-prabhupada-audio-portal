# Srila Prabhupada Audio Portal

A public hosted web app for devotees to sign in with Google or email, hear Srila Prabhupada audio recordings, track completion, resume hearing, and save personal notes / points liked.

## What is included

- 4242 recordings extracted from the uploaded Excel master file
- Real Google Drive links extracted from hidden Excel hyperlinks
- Supabase Auth login with Google and email magic link
- Per-user profile and private hearing progress
- Status for every recording: `Not heard`, `Hearing`, `Completed`
- Resume position saving
- Notes and “points I liked” saving per recording
- Search, category filter, status filter
- Custom audio controls: play/pause, previous/next, seek, speed, volume
- Google Drive preview fallback
- Supabase SQL schema with Row Level Security
- Seed SQL and Node import script for all recordings

## Folder guide

```text
sp_audio_public_portal/
├─ data/recordings.csv                  Full 4242-row catalogue with Drive links
├─ src/                                 React app source
├─ supabase/schema.sql                  Database tables, RLS policies, profile trigger
├─ supabase/seed_recordings.sql         Full recording import SQL
├─ scripts/import-recordings.mjs        Optional import script
├─ .env.example                         Environment template
├─ package.json
└─ README.md
```

## Step 1 — Create Supabase project

1. Go to Supabase and create a new project.
2. Open **SQL Editor**.
3. Paste and run `supabase/schema.sql`.
4. Then paste and run `supabase/seed_recordings.sql`.

Alternative import method:

```bash
cp .env.example .env.local
# Fill VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run import:recordings
```

Do not put the service role key in Vercel or in frontend public code. It is only for one-time import from your computer.

## Step 2 — Enable sign in

In Supabase Dashboard:

1. Go to **Authentication → Providers**.
2. Enable **Email**.
3. Enable **Google**.
4. Add the Google OAuth Client ID and Client Secret.
5. In Supabase Auth URL settings, add:
   - Local: `http://localhost:5173`
   - Production: your Vercel/Netlify domain, for example `https://your-site.vercel.app`

In Google Cloud OAuth settings, add this authorized redirect URI:

```text
https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
```

## Step 3 — Run locally

```bash
npm install
cp .env.example .env.local
```

Fill these values from Supabase Project Settings → API:

```text
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Then run:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Step 4 — Public hosting on Vercel

1. Upload this folder to GitHub.
2. Import the GitHub repository in Vercel.
3. In Vercel project settings, add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.
5. Add your Vercel domain in Supabase Authentication URL settings.

## Important note about Google Drive playback

The app creates direct URLs like:

```text
https://drive.google.com/uc?export=download&id=DRIVE_FILE_ID
```

These work only when the Drive files are shared publicly and Google allows direct download playback. If some files do not play inside the custom player, the app shows a Drive preview fallback.

For the most reliable public audio streaming with custom controls, later move the MP3 files to Supabase Storage, Cloudflare R2, Bunny, S3, or another proper audio/CDN storage.

## Data columns

The generated `data/recordings.csv` has:

```text
id,file_number,category,title,verse,lectured_date,lectured_location,filename,drive_url,drive_file_id,direct_url,embed_url
```

## User privacy

Each devotee sees only his/her own progress, notes, liked points, and saved position. This is enforced by Supabase Row Level Security policies in `supabase/schema.sql`.
