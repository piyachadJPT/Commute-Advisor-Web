# Commute Advisor — Progress & Handoff

อัปเดตล่าสุด: 2026-11-11 · แผนหลัก: [commute_advisor_plan.md](commute_advisor_plan.md) (v2.0)

ไฟล์นี้บันทึกว่าทำอะไรไปแล้ว ตัดสินใจอะไรไว้ และต้องทำอะไรต่อ ใช้เริ่มงานต่อโดยไม่ต้องย้อนอ่านแชต

## สถานะรวม

| Phase | สถานะ | หมายเหตุ |
|---|---|---|
| 1 Foundation & Visual Direction | เสร็จ | commit แล้ว ทิศทาง UI = "Sky ambient" (อนุมัติแล้ว) |
| 2 Supabase & Auth | เสร็จ, commit แล้ว, migration อยู่บนโปรเจกต์จริงแล้ว | เหลือตั้งค่า Auth ใน Dashboard (ดู "ค้างอยู่") |
| 3 Weather Integration | เสร็จ, **ยังไม่ commit** | ยืนยันกับ Supabase จริงแล้ว (ผู้ใช้ตรวจตาราง 2026-11-11) |
| 4 Commute Engine | เสร็จ (เฉพาะโมดูลบริสุทธิ์), **ยังไม่ commit** | ยังไม่ต่อกับ DB/UI (Phase 5–6) |
| 5 User Interface | ยังไม่เริ่ม | หน้า Weather/History/Settings ยังเป็นหน้าชั่วคราว |
| 6 Scheduler, Push & PWA | ยังไม่เริ่ม | |
| 7 Final Testing & Release | ยังไม่เริ่ม | |

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

หน้า Dashboard ยังใช้ข้อมูลจำลอง ดูสถานะอื่นด้วย `/?state=motorcycle`, `/?state=unknown`, `/?stale=1`

## Phase 1 — สิ่งที่ทำ

- Next.js 16 (Cache Components, React Compiler), Tailwind v4 ล้างพาเลตเดิมออก ใช้เฉพาะ token ของโปรเจกต์ที่ `src/styles/tokens.css`
- ฟอนต์ IBM Plex Sans Thai, next-intl ไม่มี locale ใน URL (cookie → Accept-Language → ไทย), ปี พ.ศ. ในภาษาไทย
- ดีไซน์ **Sky ambient**: ท้องฟ้าเปลี่ยนตามคำแนะนำ (รถยนต์/มอเตอร์ไซค์/ไม่ทราบ) การ์ดกระจกฝ้า เมนูลอยล่าง (มือถือ) หรือซ้าย (จอ ≥1024px) จอคอมเป็นกริด 12 คอลัมน์
- Dashboard ครบทุกส่วนด้วยข้อมูลจำลองที่ `src/features/dashboard/mock.ts`
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
- `.env.example` ถูกลบอยู่ใน working tree (ยังไม่ commit) ถ้าไม่ได้ตั้งใจลบให้ `git restore .env.example` แล้วเพิ่มบรรทัด `SUPABASE_SERVICE_ROLE_KEY=`
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

## หลังจากนั้น

- **Phase 5:** onboarding, หน้า Weather/History/Settings จริง, ต่อ Dashboard เข้ากับข้อมูลจริง, ภาพ hero, icon และ manifest, Playwright visual snapshot และ design review gate (§12.5)
- **Phase 6:** `/api/jobs/tick` และ `/api/jobs/daily`, pg_cron + pg_net + Vault, Web Push, service worker, offline snapshot
- **Phase 7:** CI, Lighthouse, security headers/CSP, README, backup action
