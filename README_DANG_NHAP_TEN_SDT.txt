AN PHUC LMS - STAGE 4.1: NAME + REGISTERED PHONE (DEMO)

Scope:
- Applies to the Student and Parent portals when SUPABASE_URL and SUPABASE_ANON_KEY are blank.
- Type at least 2 characters of a student's name. Search is case- and accent-insensitive.
- Choose the exact student from full-name and class suggestions.
- Enter the exact registered parent phone (10 digits). No SMS or OTP in Demo.
- This Demo session is limited to the selected student, not all students sharing the phone.
- Incorrect student/phone combinations are rejected; a small per-session retry restriction is included for UI demonstration.
- The live Supabase adapter still requires verified authentication (existing SMS OTP) and is NOT bypassed.

Demo test cases:
1. Find "Nguyen" -> Nguyen Minh An (sample), class 7A; phone 0900000001.
2. Find "Pham" -> Pham Gia Huy (sample), class 6A; phone 0900000001.
3. Find "Tran" -> Tran Ha My (sample), class 7A; phone 0900000002.
4. A wrong phone must not open the student's account.

Security and next steps:
- Name + phone is NOT sufficient proof of identity for real student data.
- Do not import real student names, parent phones, scores or tuition into the publicly accessible Demo build.
- In production, use a teacher-issued per-family access code or a one-time QR link
  delivered privately, then remember the approved device. Avoid an SMS OTP on every visit.
- Authentication checks, token issuance and access restrictions must be implemented
  on the server and validated with Supabase RLS. Do not store a PIN in plain text.
- No SQL changes are required by this Demo-only patch.

Deployment:
- Unzip this package and upload its contents to a NEW GitHub repository.
- Ensure index.html is in the repository root.
- On Vercel use framework preset Other, build command blank, root directory ./.
- Keep js/config.js SUPABASE_URL and SUPABASE_ANON_KEY blank for Demo.
- Do not overwrite the production Google Sheets attendance site.

Quality checks:
- node tests/test-name-phone-demo.mjs
- node tests/test-stage2.mjs
- node tests/test-stage3.mjs
- node tests/test-stage4.mjs
