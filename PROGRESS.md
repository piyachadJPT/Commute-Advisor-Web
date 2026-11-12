# Commute Advisor — Progress & Handoff

อัปเดตล่าสุด: 2026-11-12 · แผนหลัก: [commute_advisor_plan.md](commute_advisor_plan.md) (v2.0)

ไฟล์นี้บันทึกว่าทำอะไรไปแล้ว ตัดสินใจอะไรไว้ และต้องทำอะไรต่อ ใช้เริ่มงานต่อโดยไม่ต้องย้อนอ่านแชต

## สถานะรวม

| Phase | สถานะ | หมายเหตุ |
|---|---|---|
| 1 Foundation & Visual Direction | เสร็จ | commit แล้ว ทิศทาง UI = "Sky ambient" (อนุมัติแล้ว) |
| 2 Supabase & Auth | เสร็จ, commit แล้ว, migration อยู่บนโปรเจกต์จริงแล้ว | เหลือตั้งค่า Auth ใน Dashboard (ดู "ค้างอยู่") |
| 3 Weather Integration | เสร็จ, commit แล้ว | ยืนยันกับ Supabase จริงแล้ว (ผู้ใช้ตรวจตาราง 2026-11-11) |
| 4 Commute Engine | เสร็จ (เฉพาะโมดูลบริสุทธิ์), commit แล้ว | ยังไม่ต่อกับ DB/UI (Phase 5–6) |
| 5 User Interface | เสร็จตามขอบเขตที่ลดแล้ว (ทุกหน้าต่อข้อมูลจริง, hero SVG/CSS, icon, manifest) | **ตัด design review gate และ Playwright snapshot ออก (2026-11-12)** ผมยังไม่เคยเปิดหน้าที่ต่อข้อมูลจริงดูในเบราว์เซอร์ (ติดที่ Docker ปิดและ `.env` เสีย) มีแต่ผู้ใช้ที่ใช้งานบนมือถือ ยังไม่ทำ: day detail แบบ sheet, pull-to-refresh, แบนเนอร์ sync ล้มเหลว, ปุ่มลบข้อมูลทั้งหมด |
| 6 Scheduler, Push & PWA | เสร็จ (ชิ้น A, B, C) deploy บน Vercel (สิงคโปร์) แล้ว | **ผู้ใช้ทดสอบบนอุปกรณ์จริงแล้ว ผ่านทั้งหมด (แจ้งเมื่อ 2026-11-12)** ดูรายละเอียดใต้หัวข้อ "ผลทดสอบบนอุปกรณ์จริง"; ผมตรวจเองได้แค่ `curl` ไปที่ tick (ตอบ 200) และพบ region `sin1` |
| 7 Final Testing & Release | เสร็จตามขอบเขตที่ลดแล้ว (README, `.env.example`, ตรวจ attribution) | ตัด CI, Dependabot, backup Action, CSP และชุด Playwright ออก (แผน Decision Log #38) เหลือรัน Lighthouse บน production ด้วยมือหนึ่งรอบ |
| v2.1 A: Weather advisories | เสร็จ push ขึ้น main และ migration ขึ้นฐานจริงแล้ว | ดู "v2.1 ขั้น A" ท้ายไฟล์: เทสต์ unit ผ่าน, **ยังไม่เห็นชิปบนจอ และยังไม่ได้รันเทสต์ DB** ขั้น B และ C ยังไม่เริ่ม |

## วิธีรันบนเครื่อง

ต้องมี Docker และ Supabase CLI (v3) ติดตั้งแล้ว

```bash
supabase start                      # local stack (ดึง image ครั้งแรกใช้เวลา)
cp .env.example .env.local          # ใส่ URL กับ publishable key จาก `supabase status -o env`
npm run dev:user -- you@example.test   # สร้างผู้ใช้ local (ปิดสมัครสาธารณะ จึงสมัครเองไม่ได้)
npm run dev                         # http://localhost:3000/login  (รหัสอยู่ใน Mailpit http://127.0.0.1:54324)
```

| คำสั่ง | ทำอะไร |
|---|---|
| `npm test` | เทสต์ทั้งหมด (ต้อง `supabase start` ก่อน ไม่งั้นเทสต์ DB ข้าม) |
| `npm run test:db` | เฉพาะเทสต์ DB/RLS |
| `npm run test:tz` | เทสต์ unit ซ้ำทั้ง `TZ=UTC` และ `TZ=Asia/Bangkok` (ไม่ต้องใช้ Docker) |
| `npm run db:reset` | apply migration ใหม่จากฐานว่าง |
| `npm run db:types` | generate `src/lib/database.types.ts` จาก schema |
| `npm run typecheck` / `lint` / `build` | ตรวจก่อนปิดงาน |

หน้า Dashboard ใช้ข้อมูลจริงแล้ว (ต้องตั้งตำแหน่งบ้านและที่ทำงานใน `/settings` ก่อน ไม่งั้นขึ้นหน้าให้ไปตั้งค่า) ไฟล์ข้อมูลจำลอง `mock.ts` ถูกลบแล้ว

## Phase 1 — สิ่งที่ทำ

- Next.js 16 (Cache Components, React Compiler), Tailwind v4 ล้างพาเลตเดิมออก ใช้เฉพาะ token ของโปรเจกต์ที่ `src/styles/tokens.css`
- ฟอนต์ IBM Plex Sans Thai, next-intl ไม่มี locale ใน URL (cookie → Accept-Language → ไทย), ปี พ.ศ. ในภาษาไทย
- ดีไซน์ **Sky ambient**: ท้องฟ้าเปลี่ยนตามคำแนะนำ (รถยนต์/มอเตอร์ไซค์/ไม่ทราบ) การ์ดกระจกฝ้า เมนูลอยล่าง (มือถือ) หรือซ้าย (จอ ≥1024px) จอคอมเป็นกริด 12 คอลัมน์
- Dashboard ครบทุกส่วน (Phase 1 ใช้ข้อมูลจำลอง ตอนนี้ต่อข้อมูลจริงแล้ว ดู Phase 5)
- ตรวจแล้วที่ 320/390/768/1440px สว่าง+มืด ไทย+อังกฤษ และตัวอักษร 200% ไม่มี horizontal scroll คอนทราสต์ผ่าน AA

## Phase 2 — สิ่งที่ทำ

**ฐานข้อมูล** (`supabase/migrations/`)
- ตารางตาม §6 ทั้ง 8 ตาราง, RLS ทุกตาราง, `anon` ไม่มีสิทธิ์อะไรเลย, `job_runs` ปิดสำหรับ API ทุก role
- trigger ล็อกคำแนะนำ: เมื่อ `locked_at` ถูกตั้ง แก้ได้เฉพาะ `return_risk_latest` (service role ก็โดน)
- ฟังก์ชัน `update_location`, `save_forecast_batch`, `get_scheduler_health`, `run_retention` และ pg_cron job `retention` ตี 3 เวลาไทย
- สร้างแถว `settings` อัตโนมัติเมื่อมีผู้ใช้ใหม่

**Auth** (`src/proxy.ts`, `src/features/auth/`, `src/lib/supabase/`)
- ล็อกอินด้วยรหัส OTP ทางอีเมล (อายุ 10 นาที) ไม่มีรหัสผ่าน ปิดสมัครสาธารณะ ความยาวรหัส Supabase เป็นคนกำหนด (โปรเจกต์จริงส่ง **8 หลัก**) ฟอร์มรับ 6–8 หลัก และข้อความในหน้าจอไม่ระบุตัวเลข
- `proxy.ts` รีเฟรช session ด้วย `getClaims()`, redirect ไป `/login?next=...`, ตอบ 401 กับ `/api/*`, ปล่อย `/api/jobs/*` (ใช้ secret ของมันเอง)
- cookie session เป็น HttpOnly, SameSite=Lax, Secure บน production
- อีเมลที่ไม่มีในระบบเห็นหน้ากรอกรหัสเหมือนอีเมลจริง (กันการไล่ดูว่าใครมีบัญชี)
- `safeNext()` กัน open redirect, หน้า Settings มีปุ่มออกจากระบบ

**เทสต์ 177 ข้อ** (`tests/db/`, `tests/unit/`) ผ่านทั้งหมด และ `supabase db advisors` ไม่พบปัญหา

## การตัดสินใจที่ต่างจากแผน (แก้ในแผนแล้ว)

- `save_forecast_batch` รับ `p_user_id`, พิกัด, เวลา fetch เพิ่ม เพราะ jobs เรียกด้วย service role; ถ้า `p_rows` ว่างจะเขียนแค่ log (ใช้บันทึก sync ที่ล้มเหลว)
- policy มีเฉพาะการกระทำที่แอปใช้จริง (เช่น `notification_logs` ผู้ใช้อ่านได้อย่างเดียว)
- ชื่อ env: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ไม่ใช่ `..._ANON_KEY`)
- ลบ Supabase browser client (ไม่ได้ใช้ และ cookie HttpOnly แล้วอ่านจากฝั่งเบราว์เซอร์ไม่ได้)
- ความยาวรหัส OTP: แก้บั๊กที่ผมฝังไว้ว่า 6 หลัก (โปรเจกต์จริงส่ง 8 หลักจึงกรอกไม่ได้) ตอนนี้รับ 6–8 หลัก `otp_length` ใน `config.toml` ตั้งเป็น 8 ให้ตรงกับของจริง (มีผลเมื่อรีสตาร์ต local stack)
- `@types/node` ปรับเป็น `^22` ให้ตรง Node 22 และ Vitest 5.1.0
- `src/lib/env.ts` ตรวจเฉพาะตัวแปร public ตอนนี้ ตัวแปรฝั่ง server (service-role key, `JOB_SECRET`, `CRON_SECRET`, VAPID, `APP_URL`) จะเพิ่มใน phase ที่เริ่มใช้

## ค้างอยู่ (ต้องให้คนทำ)

1. ~~ลิงก์โปรเจกต์และ push migration~~ **ทำแล้ว (2026-11-11):** ลิงก์ `uldlezmtxzflnwpcfrvr` (CLI ระบุว่าเป็น **production**) และ push 3 migration สำเร็จ ตรวจแล้ว: 8 ตาราง RLS ครบ, `anon` อ่านไม่ได้, cron `retention` active, trigger 3 ตัวอยู่ครบ
   - ยังไม่มีโปรเจกต์ **staging** (แผน §14.1 ต้องการแยก) ตอนนี้ทุกอย่างอยู่บน production ที่เดียว สร้าง staging แล้ว `supabase link` ใหม่ก่อน push รอบถัดไป
   - CLI v3 ชี้ local เป็นค่าเริ่มต้น: `supabase db push` เฉยๆ ไม่ได้แตะของจริง ต้องใส่ `--remote` และคำสั่ง query ฝั่ง remote ต้องมี `--read-only`
   - advisor ฝั่ง remote เตือน WARN เดียว: `get_scheduler_health()` เป็น SECURITY DEFINER ที่ `authenticated` เรียกได้ **ตั้งใจ** (คืนแค่เวลา tick ล่าสุด มีเช็ก `auth.uid()` และตัด anon แล้ว) รับความเสี่ยงนี้ไว้
2. ~~ปิด "Allow new users to sign up"~~ **ทำแล้วและตรวจแล้ว (2026-11-11):** `GET /auth/v1/settings` ตอบ `disable_signup: true`, anonymous sign-ins ปิด
3. ~~ตั้ง custom SMTP และเทมเพลตที่แสดง `{{ .Token }}`~~ **ใช้ได้แล้ว (2026-11-11):** ใช้ Gmail SMTP ด้วย App password (ครั้งแรกล้มด้วย `534 Application-specific password required` เพราะใส่รหัสผ่านปกติ) อีเมลถึงกล่องจดหมายและมีรหัส 8 หลักแล้ว ควรเช็กว่า Subject ของเทมเพลตไม่ใช่ค่าที่เบราว์เซอร์เติมเอง (ครั้งหนึ่งเป็นเบอร์โทร)
4. ตั้ง Email OTP expiration เป็น 600 วินาที, ตั้ง Site URL และ redirect allow-list เป็น URL production, เชิญเจ้าของจาก dashboard
   - OTP expiration 600 วินาที ผู้ใช้แจ้งว่าตั้งแล้ว แต่ตรวจจากภายนอกไม่ได้
   - **ยังไม่ได้ยืนยันว่าล็อกอินจนเข้าหน้าหลักได้บนโปรเจกต์จริง** หลังแก้เรื่องความยาวรหัส ต้องลองกรอกรหัส 8 หลักจากอีเมลอีกครั้ง
   - Site URL ยังเป็น `http://localhost:3000` ให้เปลี่ยนเป็น URL จริงหลัง deploy บน Vercel
5. ลิงก์ Vercel project กับ preview deployments (Phase 1 ยังค้าง)
6. ตัดสินใจว่าจะถอดแพ็กเกจที่ไม่ได้ใช้ออกหรือไม่: `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `lucide-react`

## ปัญหาที่รู้และข้อควรระวัง

- **`.env` บรรทัดที่ 4 ผิดรูปแบบ** (ข้อความที่ไม่ใช่ `ชื่อ=ค่า` ซึ่งตรงกับลักษณะ App password ที่เผลอวาง) ทำให้ Supabase CLI ล้มทุกคำสั่งที่โหลด config (`start`, `stop`, `status`, `db push`) ด้วย `failed to parse environment file` ผู้ใช้ต้องลบบรรทัดนั้นเอง (และถ้าเป็นรหัสลับ ควร revoke แล้วสร้างใหม่) `supabase logs --remote` ยังใช้ได้
- ตอนนี้ Docker ปิดอยู่ local stack จึงไม่ทำงาน เปิด Docker แล้ว `supabase start` ก่อนรัน `npm test`
- ฟอร์มล็อกอินเคยรีเซ็ตทั้งก้อนหนึ่งครั้งหลังส่งอีเมลสำเร็จ ทำซ้ำอีก 14 รอบไม่เกิดอีก ถ้าเจออีกให้ดูว่า cookie ที่ Server Action ตั้งทำให้หน้ารีเฟรชแล้ว state ใน Suspense หายหรือไม่
- ทดสอบ rate limit (429) บน local ไม่ได้ เพราะ `max_frequency = 1s` ใน `config.toml` (ของจริง 60 วินาที) ครอบด้วย unit test แบบ mock แล้ว
- cookie `Secure` บน `next start` ที่ `http://localhost` ใช้ได้ใน Chrome แต่ Safari อาจไม่รับ
- เซิร์ฟเวอร์ dev พอร์ต 3000 ของคุณจะอ่าน `.env.local` (ชี้ local stack) ถ้าอยากใช้โปรเจกต์ที่ลิงก์ ให้ลบ `.env.local` แล้วรีสตาร์ต
- `/api/jobs/*` ถูกยกเว้นจาก proxy โดยตั้งใจ ทุก handler ต้องตรวจ `JOB_SECRET`/`CRON_SECRET` เอง (constant-time compare)
- `push_subscriptions.endpoint` จำกัดแค่ `https://` ใน DB แต่ตัวส่ง push (Phase 6) ต้องมี allow-list host ของ push service เพิ่ม กัน SSRF
- ยังไม่มี security headers/CSP (แผนกำหนดไว้ §14.4 ทำใน Phase 7)
- ยังไม่ทำ: คืนตำแหน่ง scroll เมื่อสลับแท็บ (§10.2), guard ไป `/onboarding` (หน้า onboarding ยังไม่มี), ภาพประกอบ hero เป็น SVG ชั่วคราว (ไม่ใช่ Lottie)

## Phase 3 — สิ่งที่ทำ

**เทสต์ unit ใหม่ 98 ข้อ** ใน `tests/unit/forecast/` ผ่านทั้ง UTC และ Asia/Bangkok, `typecheck`/`lint`/`build` ผ่าน และลองยิง Open-Meteo จริงแล้ว (72 แถว, geocode ภาษาไทย, คำค้นไม่มีผลลัพธ์ไม่ error)

- `src/lib/supabase/service.ts` service-role client (`server-only`) และ `src/lib/env.server.ts` ตรวจ `SUPABASE_SERVICE_ROLE_KEY` แบบ lazy ตอนเรียกใช้ ไม่ทำให้ build ล้มถ้ายังไม่ตั้ง
- `src/features/forecast/data/openMeteoSchema.ts` และ `openMeteoClient.ts`: timeout 15 วินาที, retry เฉพาะ 429 (สูงสุด 3 ครั้ง, รอ 1s/2s หรือ `Retry-After` ไม่เกิน 10s), error อื่นไม่ retry (tick ถัดไปลองใหม่) ค่า null/หาย/นอกช่วง → null ไม่เคยเป็น 0 เวลาแปลงเป็น UTC ด้วย `utc_offset_seconds` ไม่พึ่ง timezone ของเครื่อง
- `domain/refreshPolicy.ts` (บริสุทธิ์): ข้ามถ้า < 15 นาทีทุก trigger, scheduled ทุก 60 นาทีช่วง 05:00–19:59 และทุก 3 ชั่วโมงนอกช่วง, manual และ pre_notification ใช้แค่กฎ 15 นาที
- `forecastSyncService.ts`: sync บ้านและที่ทำงานแยกกัน ล้มข้างหนึ่งอีกข้างยังบันทึก ข้อมูลเสียไม่เขียนแถว (เขียนแค่ log `failed`) `location_changed` จาก DB ถูกรายงานแยก
- `forecastRepo.ts` (`save_forecast_batch`, อ่าน fetch ล่าสุด, อ่านรายชั่วโมง), `settingsRepo.ts` (`update_location`, อ่านตำแหน่ง)
- `geocodingClient.ts` และ `/api/geocode` (ตรวจ session ซ้ำ, `q` ยาว 2–100 ตัวอักษร, ภาษาตาม locale, 502 เมื่อ Open-Meteo ล่ม)

**การตัดสินใจที่ต่างจากแผน**
- กฎ "ทุก 60 นาที" ให้ความคลาดเคลื่อนครึ่ง tick (5 นาที): ถ้า fetch เก่า ≥ 55 นาทีก็ถือว่าถึงเวลา (3 ชั่วโมง → 175 นาที) ไม่งั้น tick ที่เหลื่อมจะทำให้รอบจริงกลายเป็น ~70 นาที
- log `skipped` เขียนเฉพาะ trigger `manual` และ `pre_notification` ส่วน scheduled ไม่เขียน เพราะข้ามเป็นส่วนใหญ่ทุก 10 นาที ถ้าเขียนจะมีแต่แถวขยะ
- ผล semantics ที่ตรวจจากเอกสาร Open-Meteo (2026-11-11): precipitation, rain, showers, probability = "Preceding hour" (แถว T คือ (T−1h, T]), temperature/humidity/wind/weather_code = "Instant" บันทึกเป็นคอมเมนต์ที่ `mapForecast`
- เอกสาร Open-Meteo ไม่ระบุรูปแบบ body ตอน 429 และไม่ระบุว่า array มี null ได้หรือไม่ โค้ดจึงดูแค่ status code และรับ null ได้

**ยืนยันแล้ว:** sync จริงกับโปรเจกต์ Supabase ตัวเดียว (ไม่แยก staging ตามที่ผู้ใช้เลือก 2026-11-11) ข้อมูลลง `hourly_forecasts` และ `forecast_sync_logs` ครบ ส่วนเทสต์ DB (`npm run test:db`) ต้องใช้ local stack เท่านั้น ห้ามรันกับโปรเจกต์จริงเพราะเทสต์สร้างและลบผู้ใช้เอง

**ค้างเล็กน้อย**
- `.env.example` ถูกลบไปแล้วใน commit `3bf172b` (ไม่ใช่ commit ของผม) ถ้าไม่ได้ตั้งใจลบให้ `git checkout 3bf172b~1 -- .env.example` แล้วเพิ่มบรรทัด `SUPABASE_SERVICE_ROLE_KEY=` และขั้นตอน "วิธีรันบนเครื่อง" ด้านบนยังอ้างถึงไฟล์นี้
- ฝั่ง client ของ location picker (debounce 400 ms) ทำใน Phase 5 พร้อมหน้า Settings ส่วน Server Action ปุ่มรีเฟรชต่อ `syncUserForecasts` ใน Phase 5 และ tick เรียกใน Phase 6
- ตำแหน่งบ้านและที่ทำงานในฐานตอนนี้อาจเป็นพิกัดทดสอบทั่วไปในกรุงเทพ ต้องแก้เป็นของจริงตอนทำหน้า Settings

## Phase 4 — สิ่งที่ทำ

เทสต์ unit ใหม่ 91 ข้อ (`tests/unit/commute/`, `tests/unit/recommendations/`) ผ่านทั้ง UTC และ Asia/Bangkok, `typecheck` และ `lint` ผ่าน

- `src/features/commute/domain/`: `tz` (Intl อย่างเดียว ไม่พึ่ง timezone เครื่อง), `windowMapper` (§5.1 ครบสามแถวบังคับ + ข้ามเที่ยงคืน + timezone ครึ่งชั่วโมง), `analyzer` (§5.2–5.3, ตาราง §16.5 ครบ), `labels`, `freshness`, `schedule` (วันเดินทาง, วันข้าม, target date §5.6), `reasons`, `locking` (`resolveRecommendation`, `returnWarning`), `recommend` (`computeRecommendation` ฟังก์ชันเดียวครบทั้ง engine)
- `src/features/recommendations/reasonText.ts`: ข้อความเหตุผลล้วน TH/EN สำหรับ push และ History ส่วน Dashboard ยังเรนเดอร์จาก `messages/*.json` เหมือนเดิม
- กฎ ESLint ใน `eslint.config.mjs`: engine ห้าม import next/react/@supabase/@/lib, ห้ามใช้ global ของเบราว์เซอร์, ห้ามเรียก `Date.now()` หรือ `new Date()` ที่ไม่มีอาร์กิวเมนต์ (ทดสอบแล้วว่าจับได้)

**การตัดสินใจที่ต่างจากแผนหรือที่แผนไม่ได้ระบุ**
- trip ที่ข้อมูลไม่ครบ ได้ `risk = null` (ไม่ใช่ค่าสูงสุดบางส่วน) และ `riskLevel = unknown` เพื่อไม่ให้เลขบางส่วนดูเหมือนคำตอบ
- `rainMm` เป็น null ถ้าผลรวมของตำแหน่งใดตำแหน่งหนึ่งเป็น null (ไม่ใช้ค่าอีกตำแหน่งแทน)
- ผลเสมอของความเสี่ยงระหว่างบ้านกับที่ทำงาน → บ้าน; ถ้าสองขาเกินเกณฑ์ทั้งคู่ เหตุผลระบุขาที่เสี่ยงสูงกว่า (เสมอ → ขาไป)
- `freshness = none` ถ้าตำแหน่งใดยังไม่เคยดึง และ `forecastFetchedAt` เป็น null ในกรณีนั้น
- ล็อกวันที่ข้อมูลไม่ครบ (unknown) ด้วย ตามแผน §5.7 (ถ้าไม่มีคำแนะนำตอนถึงเวลา การวิเคราะห์ครั้งแรกจะสร้างและล็อกทันที)
- ฟังก์ชัน DB ล็อกอยู่แล้วจาก Phase 2 `resolveRecommendation` เป็นฝั่งแอปที่ตัดสินว่าจะเขียนอะไร

**ยังไม่ทำ (อยู่ใน Phase ถัดไป):** `recommendationService` ที่อ่าน/เขียน DB, ตัวแปลงแถว DB → `HourlyWeather`, `commuteSchedule` ฝั่ง skipped_days repo, พฤติกรรม "ยังไม่มีพยากรณ์" ของวันเกินขอบเขตพยากรณ์ในหน้าจอ (engine ให้ผล unknown + hours ที่ขาดอยู่แล้ว)

## Phase 5 — ความคืบหน้า

**ทำแล้ว: Settings (ชิ้นที่ 1)** `typecheck`/`lint`/`build` ผ่าน เทสต์ 212 ข้อผ่านทั้งสอง timezone แต่ **ยังไม่ได้เปิดดูในเบราว์เซอร์** ต้องลองเองตามด้านล่าง
- `/settings`: ตำแหน่ง (ลิงก์ไปตัวเลือก), การเดินทาง (เวลา, ระยะเวลา, วันเดินทาง), การวิเคราะห์ (สไลเดอร์เกณฑ์ 10–90% พร้อมข้อความตัวอย่างสด), ภาษา, บัญชี
- `/settings/location/[key]`: ค้นหาสถานที่ (debounce 400 ms, ขั้นต่ำ 2 ตัวอักษร), ใช้ตำแหน่งปัจจุบัน, กรอกพิกัดเอง, บันทึกแล้วดึงพยากรณ์ทันที
- Server Actions ตรวจ session ซ้ำและ validate ด้วย Zod (`src/features/settings/schemas.ts` มีเทสต์ 23 ข้อ รวมกรณีช่องว่างต้องไม่กลายเป็นพิกัด 0)
- ฟอร์มใช้ค่าแบบ controlled เพราะ React รีเซ็ตช่องที่ไม่ controlled หลัง action

**ต้องลองเอง:** เปิด `/settings/location/home` ค้นหา "ลาดพร้าว" เลือกผล กดบันทึก แล้วตรวจตาราง `settings` ว่าพิกัดถูกปัดเป็น 3 ตำแหน่งและ `hourly_forecasts` ของตำแหน่งนั้นถูกดึงใหม่ (พิกัดทดสอบเดิมจะถูกแทนที่) แล้วทำซ้ำกับ `/settings/location/work`

**ยังไม่ทำใน Settings:** ส่วนแจ้งเตือน (Phase 6), หน้า About/แหล่งที่มา Open-Meteo, ลบข้อมูลทั้งหมด, บันทึกภาษาลง `settings.locale` (ตอนนี้ใช้ cookie เท่านั้น), คำนวณคำแนะนำของวันที่ยังไม่ล็อกใหม่หลังเปลี่ยนค่า (Dashboard จะวิเคราะห์ตอนอ่านอยู่แล้ว)

**ทำแล้ว: Dashboard ต่อข้อมูลจริง (ชิ้นที่ 2)** `typecheck`/`lint`/`build` ผ่าน เทสต์ 220 ข้อผ่านทั้งสอง timezone แต่ **ยังไม่ได้เปิดดูในเบราว์เซอร์**
- `src/features/dashboard/data/loadDashboard.ts` อ่านการตั้งค่า, วันข้าม, พยากรณ์ทั้งสองตำแหน่ง, คำแนะนำที่เก็บไว้ → วิเคราะห์ด้วย `computeRecommendation` → เขียนและล็อกวันเป้าหมายด้วย `resolveRecommendation` (ล็อกตอนอ่านหลังเริ่มเวลาออกเดินทางตามแผน §5.7; ถ้าเขียนล้ม เช่นมีอีกคำขอล็อกก่อน หน้ายังแสดงผลที่คำนวณได้)
- `dashboard/domain/buildView.ts` (บริสุทธิ์ มีเทสต์ 8 ข้อ) สร้าง view model: วันที่ล็อกแล้วแสดงคำตัดสิน เหตุผล และขาไปจากข้อมูลที่ล็อก แต่ขากลับตามพยากรณ์สด และแจ้งเตือนเมื่อรถมอเตอร์ไซค์ที่ล็อกแล้วมีความเสี่ยงขากลับถึงเกณฑ์
- ช่วงเวลา, bucket ในกราฟและข้อความสรุปมาจากการตั้งค่าของผู้ใช้ (เดิมฝัง 08:20/18:00)
- ปุ่มรีเฟรช (หมุนระหว่างทำงาน) และแบนเนอร์ stale/ยังไม่เคยดึง เรียก `refreshForecast` ซึ่งใช้กฎข้าม 15 นาทีของ sync service
- ข้ามวันนี้/ยกเลิกการข้าม (วันที่ "วันนี้" มาจากเซิร์ฟเวอร์ ไม่เชื่อ client) เมื่อข้ามแล้ว หน้าแสดงวันเดินทางถัดไปพร้อมแถบ "วันนี้ข้ามแล้ว · ยกเลิก"
- ข้อความเหตุผลระบุเกณฑ์เมื่อไม่ใช่ 50% และระบุเมื่ออีกขายังไม่มีข้อมูล (แผน §5.4)
- ไม่มีตำแหน่ง หรือไม่ได้เลือกวันเดินทาง → การ์ดชวนไปตั้งค่า

**ขอบเขตที่ตั้งใจเว้นไว้**
- แบนเนอร์ "sync ล้มเหลว" พร้อมเหตุผล (ตอนนี้ล้มแล้วแสดงข้อมูลเดิมเงียบๆ และบันทึกใน `forecast_sync_logs`), pull-to-refresh, snackbar แบบ undo (ใช้แถบยกเลิกแทน), offline banner (Phase 6)
- ช่วงเวลาของวันที่ล็อกแล้วใช้ค่าจากการตั้งค่าปัจจุบัน ไม่ได้เก็บช่วงเวลา ณ ตอนล็อก ถ้าแก้เวลาหลังล็อก ป้ายช่วงเวลาของขาไปจะเปลี่ยนแต่เลขความเสี่ยงยังเป็นค่าที่ล็อก
- วันที่ผ่านมาในสัปดาห์จะมีคำตัดสินก็ต่อเมื่อเคยเปิดแอปในวันนั้น (ยังไม่มี tick ล็อกให้อัตโนมัติ จนกว่าจะทำ Phase 6)

**ต้องลองเอง:** ตั้งตำแหน่งจริงทั้งสองที่ แล้วเปิด `/` ควรเห็นคำแนะนำจริง ลองกดรีเฟรช (ภายใน 15 นาทีหลังดึงล่าสุดจะไม่ดึงใหม่), ข้ามวันนี้แล้วยกเลิก, และสลับภาษา

**ทำแล้ว: หน้า Weather (ชิ้นที่ 3)** `typecheck`/`lint`/`build` ผ่าน เทสต์ 226 ข้อผ่านทั้งสอง timezone ยังไม่ได้เปิดดูในเบราว์เซอร์
- `/weather?loc=home|work&day=0|1|2`: ตัวเลือกบ้าน/ที่ทำงานและวัน (วันนี้/พรุ่งนี้/วันที่ 3) เป็นลิงก์ (ไม่ต้องใช้ JS), กราฟแท่งโอกาสฝนรายชั่วโมงเป็น SVG พร้อมแถบช่วงเดินทางและเส้นเกณฑ์ประ, รายการรายชั่วโมง (เวลา, สภาพอากาศ, %, มม., อุณหภูมิ, ลม) ที่แถวในช่วงเดินทางมีแท็กข้อความและแถบเน้น, เวลาอัปเดตท้ายหน้า
- แถว label T คือชั่วโมงที่ลงท้ายด้วย T (เช่น 09:00 = 08–09) กราฟวางแท่งไว้ระหว่าง T−1 กับ T และมีหมายเหตุใต้หัวข้อรายการ
- logic อยู่ใน `weather/domain/buildWeatherView.ts` (บริสุทธิ์ มีเทสต์ 6 ข้อ) และ `commute/domain/windowMapper.ts` มี `windowHours` ใหม่ที่ Dashboard ใช้ร่วมกัน (แทนโค้ดซ้ำ) ลบ `riskLevel` แบบ mock-only ออกแล้ว ใช้ `riskLevelOf` ที่มีเทสต์แทน
- ยังไม่ทำ: ปุ่มรีเฟรชบนหน้านี้ (รีเฟรชได้จาก Dashboard), tooltip บนกราฟ (รายการด้านล่างทำหน้าที่ตารางข้อมูล)

**ทำแล้ว: หน้า History (ชิ้นที่ 4)** `typecheck`/`lint`/`build` ผ่าน เทสต์ 234 ข้อผ่านทั้งสอง timezone ยังไม่ได้เปิดดูในเบราว์เซอร์
- `/history?month=2026-11`: สลับเดือน (ไม่มีเดือนถัดไปจากเดือนปัจจุบัน), สรุปจำนวนรถยนต์/มอเตอร์ไซค์/ยังไม่มีคำตอบ/ข้าม พร้อมแถบสัดส่วน, รายการวันใหม่สุดก่อน (วันที่ ไอคอนพาหนะ ความเสี่ยงไป/กลับ, แท็กยังไม่ล็อก, ความเสี่ยงขากลับตอนนี้เมื่อต่างจากที่ล็อก), วันที่ข้ามเป็นแถวสีจาง, เดือนว่างมีข้อความเฉพาะเจาะจง
- `/history/[date]`: คำตัดสิน เหตุผล (ข้อความ TH/EN) ความเสี่ยงสองขา เวลาล็อก เวลาดึงพยากรณ์ ความเสี่ยงขากลับล่าสุดถ้าต่างจากที่ล็อก ความครบของข้อมูล และกรณีวันที่ข้าม วันที่ไม่ถูกต้องหรือไม่มีบันทึกขึ้น 404
- logic อยู่ใน `history/domain/buildHistory.ts` (บริสุทธิ์ มีเทสต์ 8 ข้อ) ขอบเขตเดือนใช้วันสุดท้ายจริง (Postgres ปฏิเสธ `2026-11-31`)
- **ยังไม่ทำ:** day detail แบบ sheet ทับรายการ (intercepting route `@modal`) ตอนนี้เปิดเป็นหน้าเต็มเสมอ ซึ่งเป็นพฤติกรรมที่แผนกำหนดสำหรับการเข้าตรง

**ทำแล้ว: Onboarding (ชิ้นที่ 5)** `typecheck`/`lint`/`build` ผ่าน เทสต์ 234 ข้อผ่านทั้งสอง timezone ยังไม่ได้เปิดดูในเบราว์เซอร์
- `/onboarding?step=1|2|3` (นอกกลุ่ม `(app)` ไม่มีแถบเมนู): ขั้น 1 ตำแหน่งบ้านและที่ทำงาน (ใช้ตัวเลือกเดียวกับ Settings ผ่าน `/onboarding/location/[key]` แล้วกลับมาขั้น 1), ขั้น 2 เวลาและวันเดินทางพร้อมค่าเริ่มต้น (บันทึกแล้วไปขั้น 3), ขั้น 3 อธิบายข้อความแจ้งเตือนตอนเช้า
- ข้ามได้ทุกขั้น และมี "ข้ามการตั้งค่า" ทุกหน้า ซึ่งตั้ง `onboarding_completed = true` ข้ามขั้น 1 แล้ว Dashboard แสดงการ์ดให้ไปตั้งตำแหน่ง
- guard ใน `(app)/layout.tsx` ส่งผู้ใช้ใหม่ไป `/onboarding` ก่อนแสดงหน้าใดๆ **ต่างจากแผนเล็กน้อย:** ผู้ที่ตั้งตำแหน่งครบทั้งสองที่แล้วถือว่าตั้งค่าเสร็จแม้ธงเป็น false (เจ้าของที่ตั้งค่าไว้ก่อนมี onboarding จะไม่ถูกบังคับให้ผ่านอีก)
- `returnTo` ของฟอร์มเป็นค่าจากรายการตายตัว (เทียบค่า ไม่ตามที่ผู้ใช้ส่งมา) จึงไม่เป็น open redirect
- **ขั้นแจ้งเตือนยังเป็นหน้าอธิบาย** ระบุตรงๆ ว่ายังไม่เปิดใช้ การขอสิทธิ์ push และขั้นแนะนำ Add to Home Screen บน iPhone ทำใน Phase 6

**ทำแล้ว: ไอคอนและ manifest (ชิ้นที่ 6)** `typecheck`/`lint`/`build` ผ่าน (ดูภาพไอคอนที่เรนเดอร์แล้ว แต่ยังไม่ได้ติดตั้งลงมือถือจริง)
- เครื่องหมายแอป: เมฆฝนสีขาวกับล้อสีเหลือง (สีจาก token `--scene-sun`) บนพื้นฟ้า `#2d78b8` ที่ `src/app/icon.svg` (ใช้เป็น favicon SVG ด้วย) งานศิลป์อยู่ในโซนปลอดภัยของ maskable จึงใช้ไฟล์ต้นทางเดียวทุกขนาด
- `npm run app-icons` (`scripts/gen-app-icons.mjs`, ใช้ `sharp` ซึ่งเพิ่มเป็น devDependency) เรนเดอร์ `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` และ `src/app/apple-icon.png` (180 px, Next ใส่ apple-touch-icon ให้เอง) ไฟล์ PNG ถูก commit ไว้ ไม่ต้องรันซ้ำตอน build
- `src/app/manifest.ts`: `display: standalone`, `start_url: /`, `lang: th`, ชื่อภาษาไทย, `theme_color`/`background_color` `#eef4fa` ตรงกับ theme-color ของ layout; `appleWebApp` ใน metadata ให้แอปบน iPhone เปิดแบบ standalone
- ลบ `src/app/favicon.ico` (ไอคอนเริ่มต้นของ create-next-app)
- ตัดสินใจ: `short_name` ตั้งเป็น "Commute" (ชื่อแบรนด์ ป้ายใต้ไอคอนสั้น) ส่วน `name` เป็นภาษาไทย ถ้าอยากให้ป้ายใต้ไอคอนเป็นไทยให้แก้ `short_name` ใน `manifest.ts`

**ทำแล้ว: ชุดควบคุมฟอร์มที่เขียนเอง (ตามคำขอ)** `typecheck`/`lint`/`build` ผ่าน เทสต์ 234 ข้อผ่าน **ยังไม่ได้ลองใช้งานในเบราว์เซอร์และไม่มีเทสต์ของตัวควบคุมเหล่านี้** (เป็นงานโต้ตอบ ต้องลองด้วยมือ)
- `src/components/ui/`: `TimeField` (ปุ่มเปิดแผงเลือกชั่วโมง/นาทีสองคอลัมน์), `NumberStepper` (ปุ่มลบ/บวกพร้อมพิมพ์ได้), `Slider` (ลาก/กด/คีย์บอร์ด, snap ตาม step), `Combobox` (ช่องพิมพ์พร้อมรายการแนะนำของเราเอง ตามรูปแบบ ARIA combobox), `ToggleChip` (ปุ่มเลือกวัน `role="checkbox"`), `Disclosure` (แทน `<details>`), `TextField`
- ใช้ใน `commute-form` (เวลา, ระยะเวลา, วัน, เกณฑ์ฝน), `location-picker` (ค้นหา, พิกัด, ชื่อ, ส่วนกรอกพิกัดเอง) และ `login-form`
- ช่องพิมพ์ยังเป็นองค์ประกอบ `<input>` (จำเป็นสำหรับการพิมพ์และ IME ภาษาไทย) แต่ล้างหน้าตาเดิมของเบราว์เซอร์ใน `globals.css` ทั้งหมด (ปุ่มล้างช่องค้นหา, ลูกศรเลข, สีพื้น autofill)
- ทุกตัวส่งค่าผ่าน hidden input จึงใช้กับ Server Actions เดิมได้โดยไม่แก้ฝั่งเซิร์ฟเวอร์
- ข้อจำกัดที่ตั้งใจ: รายการ autofill ของเบราว์เซอร์ (เช่นอีเมลที่จำไว้ในหน้าล็อกอิน) ปรับแต่งไม่ได้ จึงคงไว้เพราะช่วยผู้ใช้

**ทำแล้ว: เนื้อหาเต็มความกว้างบนจอคอม** เอาเพดานความกว้าง 1240 px ออก (ตามคำขอ ต่างจากแผน §11.12 ซึ่งแก้แล้ว) กริด 12 คอลัมน์ขยายตามจอ กราฟทั้งสองวัดความกว้างจริงด้วย `useElementWidth` แล้ววางในหน่วยพิกเซล ตัวอักษรบนกราฟคงที่ 13 px แท่งกว้างไม่เกิน 40 px และความสูงขยายได้ถึง 360 px แทนการขยายทั้งก้อนตามจอ ยังไม่ได้ดูในเบราว์เซอร์

**ที่เหลือใน Phase 5**
1. hero scene (SVG ชั่วคราวเดิมอยู่ ยังไม่ใช่ Lottie), Playwright snapshot และ design review gate (§12.5) ซึ่งต้องดูหน้าจอจริง
2. day detail แบบ sheet (ถ้ายังต้องการ), pull-to-refresh, แบนเนอร์ sync ล้มเหลว

## Phase 6 — ความคืบหน้า

**ชิ้น A เสร็จ: ตัวจัดตารางเวลาฝั่งเซิร์ฟเวอร์** `typecheck`/`lint`/`build` ผ่าน เทสต์ 275 ข้อผ่านทั้งสอง timezone (เพิ่ม 41 ข้อ) **ยังไม่ได้รันจริง**: ไม่มีคีย์ VAPID, ไม่มี secret, migration ยังไม่ได้ push, และเทสต์ DB ใช้ local stack ซึ่งยังไม่ได้เปิด
- `runTick` (`features/jobs/tickService.ts`): ต่อผู้ใช้ทีละคน (1) refresh พยากรณ์ (tick ก่อนแจ้งเตือน 20–30 นาทีบังคับ refresh เฉพาะคนที่เปิดแจ้งเตือน) (2) วิเคราะห์วันเป้าหมายและล็อกเมื่อถึงเวลาออกเดินทาง (3) ส่งแจ้งเตือนตอนเช้าเมื่ออยู่ในช่วง `[notification_time, +20 นาที)` วันเดินทางที่ไม่ถูกข้าม โดย claim วันใน `notification_logs` ก่อนส่ง (ซ้ำไม่ได้) ลบ subscription ที่ push service ตอบ 404/410 นับ failure อย่างอื่น และผู้ใช้คนหนึ่งล้มไม่หยุดคนอื่น
- `analyzeUser` (`recommendations/recommendationService.ts`) แยกออกจาก `loadDashboard` ให้ Dashboard (ไคลเอนต์ผู้ใช้) กับ tick (service role) ใช้ตัวเดียวกัน
- ข้อความแจ้งเตือน (`notifications/domain/payload.ts`) ตามแผน §11.8 สามแบบ: สด (`แนะนำรถยนต์ · ขากลับเสี่ยงฝน 70%`), ข้อมูลเก่า (บอกเวลา), ทั่วไป (ไม่มีข้อมูล) ไม่มีพิกัด เล็กกว่า 4 KB
- allow-list host ของ push (`pushEndpoint.ts`) กัน SSRF: https เท่านั้น ไม่มี credential/port ตรงหรือเป็น subdomain ของ FCM, Mozilla, Apple, Windows
- `/api/jobs/tick` (POST, `JOB_SECRET`) และ `/api/jobs/daily` (GET, `CRON_SECRET`) เทียบ secret แบบ constant-time ตอบ 401 เหมือนกันทั้ง "ไม่ได้ตั้งค่า" และ "ผิด" บันทึกทุกครั้งใน `job_runs` (เริ่มเป็น `ok` ไม่มี `finished_at` ซึ่ง health ไม่นับ จึงไม่มีทางดูเหมือนสำเร็จถ้างานตายกลางทาง)
- `vercel.json`: cron รายวัน `0 23 * * *` (06:00 เวลาไทย) เรียก `/api/jobs/daily`
- migration `supabase/migrations/20261111100000_scheduler_cron.sql`: `pg_net` + ฟังก์ชัน `private.invoke_tick()` อ่าน `app_url` กับ `job_secret` จาก Vault แล้ว pg_cron เรียกทุก 10 นาที ไม่มีรหัสในไฟล์ ถ้ายังไม่ตั้ง secret จะแค่ `notice` ไม่ล้ม
- `/settings/about`: แหล่งที่มา Open-Meteo (CC BY 4.0) และสถานะอัปเดตอัตโนมัติ (เวลา tick ล่าสุด; เกิน 1 ชั่วโมงขึ้นเตือน "ระบบอัปเดตอัตโนมัติหยุดทำงานตั้งแต่ …") ลิงก์จากหน้า Settings

**การตัดสินใจ**
- ผู้ใช้ที่ tick ประมวลผล = ตั้งตำแหน่งครบทั้งสองที่ (ไม่ดูธง onboarding ให้ตรงกับ guard)
- ภาษาของข้อความแจ้งเตือน = `settings.locale` ถ้า null ใช้ไทย (ตอนนี้ `locale` ยังไม่ถูกบันทึกจากหน้า Settings จึงเป็นไทยเสมอจนกว่าจะทำ)
- ไม่ตั้ง VAPID → tick ข้ามการแจ้งเตือนและนับเป็น `pushNotConfigured` ไม่ claim วัน

**ชิ้น B เสร็จ: service worker, สมัครรับ push, รายการอุปกรณ์, iPhone** `typecheck`/`lint`/`build` ผ่าน เทสต์ 302 ข้อผ่านทั้งสอง timezone (เพิ่ม 27 ข้อ รวม 10 ข้อที่รัน `public/sw.js` กับ scope จำลอง) (ภายหลังผู้ใช้ทดสอบบนอุปกรณ์จริงแล้ว ดู "ผลทดสอบบนอุปกรณ์จริง")
- `public/sw.js` (เขียนมือ ไม่มี build ต่างจากแผนที่ว่า `src/sw.ts`): `push` แสดงการแจ้งเตือนเสมอ แม้ข้อมูลว่าง/พัง/ผิดชนิด (iOS ยกเลิก subscription ของแอปที่รับ push แล้วไม่แสดงอะไร), `notificationclick` โฟกัสหน้าต่างที่เปิดอยู่หรือเปิด `/` และไม่เปิด origin อื่นเด็ดขาด, tag เดียวคือข้อความเช้าใหม่แทนอันเก่า `next.config.ts` ตั้ง header ไม่แคช `/sw.js` ลงทะเบียนจาก root layout (`ServiceWorkerRegister`)
- Settings → การแจ้งเตือน: สวิตช์ที่เขียนเอง (`role="switch"`) ขอสิทธิ์ในตัวจัดการคลิกเป็นอย่างแรก (browser ต้องการ user gesture) แล้ว subscribe และบันทึกผ่าน Server Action `subscribePush` (ตรวจด้วย Zod และ allow-list host, user จาก session) ปิดสวิตช์ = ลบ subscription ของเครื่องนี้ `notifications_enabled` ตามว่ามีอุปกรณ์เหลืออยู่หรือไม่
- เวลาแจ้งเตือน (ตัวเลือกเวลาของเรา) พร้อมข้อความ "แจ้งเตือนประมาณ 06:30–06:40", รายการอุปกรณ์ (ชื่อจาก user agent, วันที่เพิ่ม, ส่งสำเร็จล่าสุด, ปุ่มลบ), ปุ่ม "ส่งการแจ้งเตือนทดสอบ" (ส่งถึงอุปกรณ์ของผู้ใช้เองทันที ไว้ตรวจโดยไม่ต้องรอ 06:30)
- กรณีพิเศษ: สิทธิ์ถูกปฏิเสธ → ข้อความบอกวิธีเปิดใหม่ (เว็บเปิดการตั้งค่าระบบให้ไม่ได้), iPhone/iPad ใน Safari แท็บ (ไม่มี PushManager) → ขั้นตอน Add to Home Screen แทนสวิตช์, เบราว์เซอร์ไม่รองรับ → บอกตรงๆ, เซิร์ฟเวอร์ยังไม่มีคีย์ VAPID → บอกว่ายังไม่ได้ตั้งค่า
- Onboarding ขั้น 3 ใช้สวิตช์เดียวกัน (แบบไม่มีรายการอุปกรณ์) ปฏิเสธก็ไปต่อได้
- เปลี่ยนภาษาที่หน้า Settings บันทึกลง `settings.locale` ด้วย (เดิมเป็น cookie อย่างเดียว) ข้อความแจ้งเตือนที่สร้างบนเซิร์ฟเวอร์จึงตามภาษาที่เลือก
- `deliverToUser` ใช้ร่วมกันระหว่าง tick และปุ่มทดสอบ (ลบ subscription ที่หมดอายุ, นับความล้มเหลว; ความผิดพลาดตอนบันทึกผลไม่ทำให้ข้อความที่ส่งไปแล้วถูกนับว่าล้ม)

**ยังไม่ทำ:** `pushsubscriptionchange` (ตอน push service หมุนคีย์เอง ผู้ใช้ต้องเปิดสวิตช์ใหม่ ตรงกับแผน §15 "Settings asks the user to re-enable"), นำภาษาจาก `settings.locale` ไปใช้ตอนเปิดบนเครื่องที่ไม่มี cookie

**ตรวจด้วยมือบนอุปกรณ์จริง (§16.4 ของแผน) หลัง deploy**
1. iPhone ติดตั้งลงหน้าจอโฮม: ล็อกอินด้วยรหัสในแอปที่ติดตั้ง, เปิดสวิตช์, กด "ส่งการแจ้งเตือนทดสอบ" ต้องขึ้น, แตะแล้วเปิด Dashboard
2. iPhone ใน Safari แท็บ: ต้องเห็นขั้นตอน Add to Home Screen แทนสวิตช์
3. Android Chrome และเบราว์เซอร์บนคอม: เปิดสวิตช์และได้รับข้อความทดสอบ
4. รอเวลาแจ้งเตือนจริง ข้อความต้องมาในช่วง 06:30–06:40 และไม่มาซ้ำ
5. หยุดงาน pg_cron เกิน 1 ชั่วโมง หน้า About ต้องขึ้นคำเตือน

**ชิ้น C เสร็จ: เปิดแอปตอนออฟไลน์ได้** `typecheck`/`lint`/`build` ผ่าน เทสต์ 332 ข้อผ่านทั้งสอง timezone (เพิ่ม 20 ข้อ: SW โหมดออฟไลน์กับแคชจำลอง และตัวตรวจสแนปช็อต) (ภายหลังผู้ใช้ทดสอบบนอุปกรณ์จริงแล้ว ดู "ผลทดสอบบนอุปกรณ์จริง")
- หลักการ: หน้าส่วนตัวมาจากเครือข่ายเสมอ **ไม่แคชหน้าใดเลย** เพื่อไม่ให้ข้อมูลเก่าถูกเสิร์ฟเหมือนเป็นปัจจุบัน แคชเฉพาะหน้า `/offline` (สาธารณะ ไม่มีข้อมูลผู้ใช้ อ่านจาก IndexedDB ในเบราว์เซอร์) กับไฟล์ build ที่ชื่อมี hash (cache-first)
- `public/sw.js` โหมดออฟไลน์เปิดเมื่อลงทะเบียนเป็น `/sw.js?cache=1` ซึ่งทำเฉพาะ production build (ใน dev ไฟล์ build ไม่มี hash แคชแล้วจะได้โค้ดเก่า จึงเปิดเฉพาะ push) ติดตั้ง/เปิดใช้งาน: เก็บ `/offline` และไฟล์ build ทุกไฟล์ที่ HTML ของมันอ้างถึง (แยกจาก HTML เอง จึงเริ่มทำงานออฟไลน์ได้แม้ deploy เปลี่ยนชื่อไฟล์), ลบแคชรุ่นเก่า, ไม่เก็บ redirect ไปหน้าล็อกอินเป็นหน้าออฟไลน์ เมื่อโหลดหน้าล้มเหลว (ออฟไลน์) → ตอบหน้า `/offline` ที่แคชไว้ เมื่อออนไลน์ → รีเฟรชแคช `/offline` อย่างน้อยทุก 6 ชั่วโมง
- สแนปช็อต: ทุกครั้งที่ Dashboard เรนเดอร์สำเร็จ `SnapshotWriter` เก็บ view model ลง IndexedDB (`idb-keyval`, structured clone จึงเก็บ `Date` ได้ ต่างจากแผนที่ว่า JSON) ตอนอ่านกลับตรวจรูปร่างก่อนใช้ ออกจากระบบจะลบสแนปช็อต (มีชื่อสถานที่และความเสี่ยง)
- `/offline` (`OfflineDashboard`): แสดง Dashboard เต็มจากสแนปช็อต พร้อมแถบ "ออฟไลน์ · ข้อมูลเมื่อ …" (ระบุเวลาดึงเสมอ) ตัดปุ่มรีเฟรช/ข้ามวัน ตัดสินว่าข้อมูลเก่า (>6 ชั่วโมง) ตอนเปิด ไม่ใช่ตอนบันทึก หน้าอื่น (อากาศ/ประวัติ/ตั้งค่า) ขึ้น "หน้านี้ต้องใช้อินเทอร์เน็ต" พร้อมลิงก์ไปคำแนะนำที่บันทึกไว้ ยังไม่มีสแนปช็อต → บอกให้เปิดแอปตอนออนไลน์สักครั้ง กลับมาออนไลน์ → รีโหลดเอง
- Dashboard ที่เปิดอยู่แล้วเครือข่ายหลุด: `OfflineNotice` ขึ้นแถบเดียวกันและข้อมูลเดิมยังอยู่
- รองรับทั้งสองฝั่ง: การ์ดของ Dashboard เปลี่ยนจาก async + `getTranslations` เป็น sync + `useTranslations` (ใช้ได้ทั้งเซิร์ฟเวอร์และไคลเอนต์) เพื่อให้เรนเดอร์ออฟไลน์ด้วยโค้ดเดียวกัน
- `/offline` เปิดให้ผู้ที่ยังไม่ล็อกอินเข้าได้ (proxy)

**ข้อควรระวัง (ยังพิสูจน์ไม่ได้ ต้องลองจริง)**
- หน้า `/offline` ถูกเสิร์ฟที่ URL อื่น (เช่น `/`) การ hydrate ต้องยอมรับ ถ้าเห็นหน้าขาว/error ในคอนโซลตอนทดสอบออฟไลน์ ให้ส่งข้อความมา ทางแก้คือให้หน้าออฟไลน์เป็นไฟล์ HTML นิ่งที่ไม่ใช้ router ของ Next
- หน้า `/offline` ที่แคชไว้ใช้ภาษาของตอนแคช ถ้าเปลี่ยนภาษาแล้วออฟไลน์ทันที ข้อความอาจยังเป็นภาษาเก่าจนกว่าแคชจะรีเฟรช
- ไม่มีสแนปช็อตจนกว่าจะเปิด Dashboard ตอนออนไลน์อย่างน้อยหนึ่งครั้งบนเครื่องนั้น

**ตรวจออฟไลน์ด้วยมือ (หลัง deploy หรือ `npm run build && npm start` ที่ localhost)**
1. เปิดแอป ล็อกอิน ดู Dashboard 1 ครั้ง (รอสักครู่ให้ SW ติดตั้ง) → DevTools > Application > Service Workers ต้องเห็น `/sw.js?cache=1` และ Cache Storage มี `commute-shell-v1`
2. DevTools > Network > Offline แล้วรีโหลด `/` → ต้องเห็นคำแนะนำล่าสุดพร้อมแถบออฟไลน์และเวลาข้อมูล
3. เปิด `/weather` ตอนออฟไลน์ → ข้อความ "ต้องใช้อินเทอร์เน็ต" เลือก Online อีกครั้ง → หน้ารีโหลดเอง
4. ออกจากระบบ แล้วดู Application > IndexedDB ว่าสแนปช็อตถูกลบ

**ต้องทำก่อนใช้งานจริง (คุณทำ)**
1. สร้างค่าลับ: `openssl rand -hex 32` สองครั้งสำหรับ `JOB_SECRET` กับ `CRON_SECRET`, `npx web-push generate-vapid-keys` สำหรับคีย์ VAPID ใส่ `.env.local` และ Vercel Environment Variables: `JOB_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (เช่น `mailto:อีเมลของคุณ`) ห้ามวางในแชต
2. deploy ขึ้น Vercel (ต้องมี URL จริง เพราะ Supabase เรียกเข้า localhost ไม่ได้)
3. `supabase db push --remote` เพื่อใช้ migration cron (CLI ต้องอยู่ใน PATH ของคุณ)
4. ใน SQL editor ของ Supabase: `select vault.create_secret('https://<แอปของคุณ>.vercel.app', 'app_url');` และ `select vault.create_secret('<ค่าเดียวกับ JOB_SECRET>', 'job_secret');`
5. ตรวจ: ตาราง `job_runs` ควรมีแถวใหม่ทุก 10 นาที และหน้า About ขึ้นเวลาอัปเดตล่าสุด

## สคริปต์เติมประวัติย้อนหลัง (`npm run backfill`)

เติมหน้า History (และแถบ "สัปดาห์นี้") ด้วยคำแนะนำย้อนหลัง 6 เดือน ทดสอบทั้งสายแล้วแบบไม่แตะฐาน (พิกัดกรุงเทพทั่วไป: 130 วันเดินทาง รถยนต์ 74 มอเตอร์ไซค์ 56) และเทสต์ 13 ข้อ **ยังไม่ได้รันกับฐานของคุณ**
- `npm run backfill` แสดงแผน ไม่เขียนอะไร | `-- --write` เขียนจริง | `-- --undo` นับแถวที่สร้างจากสคริปต์ | `-- --undo --write` ลบ | ตัวเลือก `--months 6`, `--user-id <uuid>`, `--home lat,lon --work lat,lon`
- ทำอะไร: ทุกวันเดินทางในอดีต รันตัวตัดสินใจจริงของแอปด้วยสภาพอากาศจริงรายชั่วโมงจาก Open-Meteo Archive ณ เวลาออกเดินทาง แล้วเก็บเป็นคำแนะนำที่ล็อกแล้ว (ล็อก 08:20, ดึงพยากรณ์ 06:00)
- **ข้อจำกัดที่ต้องรู้:** Archive มีปริมาณฝนที่ตกจริงแต่ไม่มี "โอกาสฝน" จึงประมาณโอกาสฝนจากปริมาณฝนจริง (`rainProbability` ใน `scripts/backfill-core.ts`: ชั่วโมงแห้ง 5–25% ตามความชื้น ฝน 0.1 มม. ≈29% 0.5 ≈55% 1 ≈74% 2 ≈89% สูงสุด 95% ฝนชั่วโมงข้างเคียงนับครึ่ง) แถวเหล่านี้คือ "คำแนะนำที่แอปจะให้ถ้ารู้ว่าฝนจะตกเท่าไร" ไม่ใช่สิ่งที่แอปเคยแสดงตอนนั้นจริง มีเครื่องหมาย `backfill: true` ใน `reason_params` ให้ลบได้ API พยากรณ์ย้อนหลัง (ที่เก็บโอกาสฝนในอดีตจริง) หมดเวลาทุกครั้งที่ลอง จึงไม่ได้ใช้
- **วันนี้**: Archive ยังไม่มีฝนของวันนี้ สคริปต์จึงใช้พยากรณ์ล่าสุดของ Open-Meteo (มีโอกาสฝนจริง ไม่ต้องประมาณ) และเติมวันนี้เมื่อถึงเวลาออกเดินทางแล้วเท่านั้น (ก่อนหน้านั้นเว้นไว้ให้แอปล็อกเอง) รันซ้ำได้ปลอดภัย: วันที่มีอยู่แล้วถูกเว้น เติมเฉพาะที่ขาด
- ไม่ทับแถวจริง (วันที่มีอยู่แล้วถูกเว้น), ข้ามวันที่ถูกข้ามและวันที่ข้อมูลไม่ครบ (ไม่สร้าง "ไม่ทราบ" ปลอม), เขียนเฉพาะเมื่อใส่ `--write`
- ไม่เติม `hourly_forecasts` ย้อนหลัง เพราะงานล้างข้อมูลตอนตี 3 ลบแถวที่เก่ากว่า 14 วันทุกคืน หน้า "อากาศ" จึงยังแสดงเฉพาะ 3 วันข้างหน้า ส่วนข้อมูลอากาศย้อนหลังอยู่ในความเสี่ยงฝนและปริมาณฝนของแต่ละวันที่หน้า History

## ผลทดสอบบนอุปกรณ์จริง (Phase 6)

ผู้ใช้แจ้งเมื่อ 2026-11-12 ว่า **ทดสอบบนอุปกรณ์จริงแล้ว ผ่านทั้งหมด** ตามรายการ "ตรวจด้วยมือบนอุปกรณ์จริง" และ "ตรวจออฟไลน์ด้วยมือ" ในหัวข้อชิ้น B และ C (สมัครรับ push และได้ข้อความทดสอบ, แตะแล้วเปิดแอป, ออฟไลน์แสดงสแนปช็อต, ตัวจัดเวลาเรียกเองทุก 10 นาที) ผมไม่ได้ทดสอบเอง และ **ไม่ได้ระบุว่าอุปกรณ์รุ่นไหน** จึงจดแค่ที่ได้รับแจ้ง ข้อที่ยังไม่มีใครยืนยัน: ข้อความแจ้งเตือนตอนเช้าจริง (06:30–06:40) มาครั้งเดียวไม่ซ้ำ ซึ่งต้องรอเวลาจริงหนึ่งเช้า

**ที่ผมยืนยันเองกับของจริง:** `POST /api/jobs/tick` ตอบ 200 (`"ok":true,"users":1,"errors":[]`), function ทำงานที่ `sin1`, migration cron ใช้สำเร็จ, secret ใน Vault มีครบ `app_url` และ `job_secret`

## หลังจากนั้น

- **Phase 5:** onboarding, หน้า Weather/History/Settings จริง, ต่อ Dashboard เข้ากับข้อมูลจริง, ภาพ hero, icon และ manifest, Playwright visual snapshot และ design review gate (§12.5)
- **Phase 6:** `/api/jobs/tick` และ `/api/jobs/daily`, pg_cron + pg_net + Vault, Web Push, service worker, offline snapshot
- **Phase 7:** CI, Lighthouse, security headers/CSP, README, backup action

## v2.1 ขั้น A — คำเตือนสภาพอากาศ (แผน §23.4)

ทำเมื่อ 2026-11-12 กฎเลือกรถไม่เปลี่ยน: ฝนยังเป็นตัวตัดสินเดียว คำเตือนแค่บอกว่าควรเตรียมอะไร

**ทำแล้ว**
- ดึงเพิ่ม 5 ฟิลด์จาก API เดิม: `apparent_temperature`, `uv_index`, `wind_gusts_10m`, `visibility`, `is_day` (ตรวจเอกสาร 2026-11-12: `uv_index` เป็นค่าเฉลี่ยชั่วโมงก่อนหน้า, `wind_gusts_10m` เป็นค่าสูงสุดชั่วโมงก่อนหน้า, ที่เหลือเป็น instant; บันทึกไว้ที่ `mapForecast`)
- `commute/domain/advisories.ts` + `advisoryThresholds.ts`: ฟังก์ชันบริสุทธิ์ 10 ชนิด (heat, cold, uv, gust, lowVisibility, thunderstorm, heavyRain, wetRoad, rainNearWindow, darkReturn) `computeRecommendation` คืน `advisories` แต่ `decide()` และ `deriveReason()` ไม่รับค่านี้
- migration `20261112090000_weather_advisories.sql`: คอลัมน์ใหม่ใน `hourly_forecasts`, `save_forecast_batch` อ่านคีย์ใหม่ (คีย์ที่หายไปเป็น null), `daily_recommendations.advisories` (jsonb array) ถูกล็อกพร้อมคำแนะนำโดย trigger เดิมโดยไม่ต้องแก้ trigger
- ขาไปที่ล็อกแล้วใช้คำเตือนที่เก็บไว้ ขากลับคำนวณสดเหมือน `return_risk_latest`
- UI: ชิปคำเตือนใต้แต่ละขาในการ์ดเดินทาง (รถยนต์แสดงเฉพาะ warning), "รู้สึก/UV" ในการ์ด now, แถวรองในรายชั่วโมงหน้า Weather, ไอคอนใหม่ 3 ตัว, ข้อความไทยและอังกฤษ
- offline snapshot เปลี่ยน key เป็น `dashboard-snapshot-v2`

**ตรวจแล้ว:** `npm run test:tz` (435 ข้อ ผ่านทั้ง UTC และ Asia/Bangkok), `typecheck`, `lint`, `build`

**สถานะล่าสุด (2026-11-12)**
- commit `abccddc` และ push ขึ้น `main` แล้ว (Vercel ควร deploy เอง ยังไม่ได้ยืนยันสถานะ deploy)
- migration `20261112090000` push ขึ้นโปรเจกต์จริงแล้ว ตรวจคอลัมน์ใหม่บนฐานจริงครบและตรงกับ `database.types.ts`
- พยากรณ์ที่ดึงเมื่อ 10:04 มีค่าใหม่แล้ว (144 จาก 192 แถวมี UV และค่ารู้สึก)
- backfill เขียนแล้ว 130 แถว (124 แถวมีคำเตือน): heat 184, darkReturn 75, rainNearWindow 44, wetRoad 36, cold 3 ไม่มี UV กับทัศนวิสัยเพราะ archive ไม่มี เพิ่มแฟลก `--replace` ในสคริปต์ (ลบแถวที่สคริปต์เคยสร้างแล้วเขียนใหม่ เพราะแถวที่ล็อกแก้ไม่ได้) หมายเหตุ: npm ต้องใช้ `npm run backfill -- --write` (มี `--` คั่น) ไม่งั้น npm กลืนแฟลก
- เพิ่ม `CLAUDE.md` ของโปรเจกต์: ทำเฉพาะที่สั่ง ห้ามแตะข้อมูลในฐานจริงโดยไม่ได้อนุมัติ ห้าม commit/push เอง

**ยังไม่ได้ทำ / ยังไม่ได้ตรวจ**
1. ยังไม่เห็นชิปบนจอ: วันนี้ขาไปถูกล็อกตอน 08:20 ด้วยโค้ดเก่า (`advisories = []`) และขากลับไม่ถึงเกณฑ์ จึงไม่มีชิปให้ขึ้น ต้องรอวันถัดไปหรือทดสอบด้วยข้อมูลจำลอง และยังไม่ได้ยืนยันบนจอว่า "รู้สึก/UV" ในการ์ด now ขึ้น
2. เทสต์ DB ใน `tests/db/` ที่เขียนเพิ่มยังไม่เคยรัน (ต้องใช้ Docker และห้ามรันกับของจริง)
3. สคริปต์ `db:types` ใน package.json ไม่มี `--remote` (CLI v3 ชี้ local เป็นค่าเริ่มต้น) ถ้ารันตอน Docker ปิดจะเขียนทับ `database.types.ts` ด้วยข้อความ error รอการตัดสินใจ
4. หน้า History ยังไม่มีส่วนแสดงคำเตือน (ขั้น C) ข้อมูลย้อนหลังรออยู่ในฐานแล้ว
5. ขั้น B (PM2.5) และขั้น C (push, History, Settings) ยังไม่เริ่ม

**หมายเหตุ**
- แถวที่ล็อกก่อน v2.1 มี `advisories = []` และหน้า History ไม่แสดงอะไรให้ ตามแผน
- เกณฑ์ทั้งหมดอยู่ที่ `advisoryThresholds.ts` ปรับได้หลังใช้งานจริง (บันทึกใน Decision Log)
