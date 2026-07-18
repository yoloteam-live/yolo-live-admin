/**
 * The mobile app and dashboard must use the same Supabase project.  A public
 * URL from another project can be saved successfully but will leave the app
 * with an inaccessible asset when that old project is paused or deleted.
 */
const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const configuredOrigin = configuredUrl ? new URL(configuredUrl).origin : '';

export function requireCurrentProjectStorageUrl(url: string, bucket: string) {
  const expectedPrefix = `${configuredOrigin}/storage/v1/object/public/${bucket}/`;
  if (!configuredOrigin || !url.startsWith(expectedPrefix)) {
    throw new Error(`Media must be uploaded to this dashboard's ${bucket} storage bucket.`);
  }
  return url;
}
