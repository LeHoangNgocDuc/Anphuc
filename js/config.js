/**
 * AN PHUC EDUCATION - Stage 2 configuration, browser-safe values only.
 * In real deployment, paste Supabase Project URL and publishable/anon key.
 * NEVER put service_role, sb_secret_ or any banking/API private key here.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export const APP_CONFIG = Object.freeze({
  center: Object.freeze({
    name: 'TRUNG TÂM TOÁN AN PHÚC',
    slogan: 'Vững kiến thức. Chắc tương lai.',
    representative: 'Lê Quốc Hải',
    logo: './logo.jpg',
    printLogo: './logo_in_A5.png',
    signature: './chu_ky_quoc_hai.png',
  }),
  supabase: Object.freeze({ url: SUPABASE_URL.trim(), key: SUPABASE_ANON_KEY.trim() }),
  storage: Object.freeze({ dbName: 'AnPhucLMS_DEMO_V2', version: 2 }),
  import: Object.freeze({ batchSize: 300, maxFileMB: 35 }),
  // Browser-only SDK, no node packages or build steps required.
  supabaseModuleUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
});

export function normalizePhone(raw) {
  let digits = String(raw ?? '').trim().replace(/[^0-9]/g, '');
  if (/^84\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  else if (/^\d{9}$/.test(digits)) digits = `0${digits}`;
  return /^0\d{9}$/.test(digits) ? digits : '';
}

export function phoneToE164(raw) {
  const local = normalizePhone(raw);
  if (!local) throw new Error('Số điện thoại Việt Nam cần đúng 10 chữ số.');
  return `+84${local.slice(1)}`;
}

function roleFromJwt(key) {
  try {
    const part = String(key).split('.')[1];
    if (!part || typeof atob !== 'function') return '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return String(json.role ?? '').toLowerCase();
  } catch { return ''; }
}

/** Do NOT silently switch real users to local storage on network failure. */
export function resolveAppMode(config = APP_CONFIG) {
  const url = String(config.supabase?.url ?? '').trim();
  const key = String(config.supabase?.key ?? '').trim();
  if (!url && !key) return 'demo';
  if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY trong js/config.js.');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('SUPABASE_URL không phải URL hợp lệ.'); }
  if (parsed.protocol !== 'https:' || !/\.supabase\.co$/i.test(parsed.hostname)) {
    throw new Error('SUPABASE_URL phải có dạng https://<project>.supabase.co');
  }
  if (/^sb_secret_/i.test(key) || roleFromJwt(key) === 'service_role') {
    throw new Error('KHÔNG được đưa service-role/secret key vào JavaScript công khai.');
  }
  if (/^(replace|your_|placeholder|demo_)/i.test(key)) {
    throw new Error('SUPABASE_ANON_KEY đang là giá trị mẫu, hãy điền key công khai hợp lệ.');
  }
  return 'supabase';
}

export const moneyVN = (value) => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(Number(value) || 0);

export const dateVN = (value = new Date()) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh',
}).format(value instanceof Date ? value : new Date(value));
