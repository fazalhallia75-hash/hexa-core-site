HEXA CORE WEBSITE — SETUP

IMPORTANT
This package is for legitimate digital services only. Do not use it to sell cheats, anti-cheat bypasses, unauthorized game files, or services that evade game rules.
Your Supabase URL and publishable key are configured in config.js. The publishable key is intended for browser use; NEVER add a Supabase secret/service_role key to any website file.

UPLOAD TO GITHUB
1. Open your hexa-core-site repository.
2. Upload the contents of this folder to the repository ROOT (not the ZIP itself).
3. Keep the assets folder and its logo.jpg file. If your uploaded logo has a different name, rename it to logo.jpg or update the HTML paths.
4. Commit the files to the main branch.

SUPABASE
1. Open SQL Editor and run supabase_setup.sql.
2. Authentication > Users: create your admin email/password.
3. Copy that user's UUID.
4. In SQL Editor run:
   insert into public.admin_users(user_id) values('PASTE-UUID-HERE') on conflict do nothing;
5. Never share your admin password, OTP, or secret key.

PUBLISH
GitHub repository > Settings > Pages > Deploy from a branch > main > /(root) > Save.
Wait for GitHub Pages to publish. Open the Pages URL.

TEST
1. Open the public site and add a service from admin.html.
2. Submit a test order with a small test payment only if you actually intend to pay; do not rely on screenshots as proof.
3. Check receipt in admin panel, verify payment in your JazzCash account independently, then approve/reject.
4. Admin may upload a delivery file. The generated private download link expires after 7 days.
5. Customer tracks order using the reference shown after submission and the same phone number.

PAYMENT DISPLAY
JazzCash account name: SHAZIA SHAMSHAIR
JazzCash number: 03095037871
WhatsApp support: 03095037871

LIMITATIONS
- This is a starter web app, not a payment gateway. Payment is manual JazzCash transfer and manual verification.
- No automatic SMS/WhatsApp notifications are configured.
- Private delivery links expire after 7 days; upload a new link if needed.
- GitHub Pages and Supabase free-tier limits and policies can change.
- For stronger production security, add server-side rate limiting, CAPTCHA, and review policies before accepting real customer data.
