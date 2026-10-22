/**
 * Saves already-fetched bytes to the device.
 *
 * The object URL is revoked shortly after the click rather than immediately,
 * because revoking synchronously can cancel the download in some browsers.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Serialises a value as a pretty-printed JSON/GeoJSON download. */
export function downloadJson(data: unknown, filename: string, mimeType = 'application/json'): void {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: mimeType }), filename);
}
