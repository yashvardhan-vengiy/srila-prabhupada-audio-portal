export function getDriveFileId(url = '') {
  const byPath = url.match(/\/d\/([^/]+)/);
  if (byPath?.[1]) return byPath[1];
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('id') || '';
  } catch {
    return '';
  }
}

export function directDriveUrl(recording) {
  const id = recording.drive_file_id || getDriveFileId(recording.drive_url);
  return recording.direct_url || (id ? `https://drive.google.com/uc?export=download&id=${id}` : recording.drive_url);
}

export function previewDriveUrl(recording) {
  const id = recording.drive_file_id || getDriveFileId(recording.drive_url);
  return recording.embed_url || (id ? `https://drive.google.com/file/d/${id}/preview` : recording.drive_url);
}

export function formatTime(seconds = 0) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
  const min = Math.floor((seconds / 60) % 60);
  const hrs = Math.floor(seconds / 3600);
  return hrs > 0 ? `${hrs}:${String(min).padStart(2, '0')}:${sec}` : `${min}:${sec}`;
}
