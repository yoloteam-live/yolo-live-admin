import { supabase } from '@/lib/supabase';

type AdminMediaUploadOptions = {
  bucket: 'splashes' | 'banners';
  moduleKey: 'splash' | 'banners';
  file: File;
  cacheControl: string;
};

function safeObjectName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Upload dashboard-managed public media with an explicit RBAC preflight.
 * Storage RLS remains the source of truth; this preflight turns an opaque
 * `new row violates row-level security policy` response into a useful error.
 */
export async function uploadAdminMedia({
  bucket,
  moduleKey,
  file,
  cacheControl,
}: AdminMediaUploadOptions): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session?.user?.id) {
    throw new Error('Your admin session has expired. Sign in again and retry.');
  }

  const { data: canManage, error: permissionError } = await supabase.rpc('has_admin_permission', {
    uid: session.user.id,
    module_key: moduleKey,
    required_level: 'manage',
  });
  if (permissionError) {
    throw new Error(`Could not verify upload permission: ${permissionError.message}`);
  }
  if (canManage !== true) {
    throw new Error(`Your dashboard account needs Manage permission for ${moduleKey === 'splash' ? 'Splash Manager' : 'Home Banners'}.`);
  }

  const unique = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${session.user.id}/${unique}-${safeObjectName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: false,
      cacheControl,
      contentType: file.type || undefined,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Upload completed but no public media URL was returned.');
  return data.publicUrl;
}
