// Public browser configuration only. Never put a Supabase secret/service-role key here.
window.HEXA_CONFIG = {
  SUPABASE_URL: "https://tyvwxijvsywrhliialwv.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_CNT_7eLIa-n1Omw_g30RBA_wylaxmJP",
  JAZZCASH_NUMBER: "03095037871",
  JAZZCASH_ACCOUNT_NAME: "SHAZIA SHAMSHAIR",
  WHATSAPP_NUMBER: "923095037871"
};
window.hexaSupabase = window.supabase.createClient(
  window.HEXA_CONFIG.SUPABASE_URL,
  window.HEXA_CONFIG.SUPABASE_PUBLISHABLE_KEY
);