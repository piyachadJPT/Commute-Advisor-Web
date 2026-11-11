# Commute Advisor — Progress & Handoff

อัปเดตล่าสุด: 2026-11-11 · แผนหลัก: [commute_advisor_plan.md](commute_advisor_plan.md) (v2.0)

ไฟล์นี้บันทึกว่าทำอะไรไปแล้ว ตัดสินใจอะไรไว้ และต้องทำอะไรต่อ ใช้เริ่มงานต่อโดยไม่ต้องย้อนอ่านแชต

## สถานะรวม

| Phase | สถานะ | หมายเหตุ |
|---|---|---|
| 1 Foundation & Visual Direction | เสร็จ | commit แล้ว ทิศทาง UI = "Sky ambient" (อนุมัติแล้ว) |
| 2 Supabase & Auth | เสร็จบน local, **ยังไม่ commit** | เหลือส่วนที่ต้องทำบนโปรเจกต์จริง (ดู "ค้างอยู่") |
| 3 Weather Integration | ยังไม่เริ่ม | |
| 4 Commute Engine | ยังไม่เริ่ม | |
| 5 User Interface | ยังไม่เริ่ม | หน้า Weather/History/Settings ยังเป็นหน้าชั่วคราว |
| 6 Scheduler, Push & PWA | ยังไม่เริ่ม | |
| 7 Final Testing & Release | ยังไม่เริ่ม | |

## วิธีรันบนเครื่อง

ต้องมี Docker และ Supabase CLI (v3) ติดตั้งแล้ว

```bash
supabase start                      # local stack (ดึง image ครั้งแรกใช้เวลา)
cp .env.example .env.local          # ใส่ URL กับ publishable key จาก `supabase status -o env`
npm run dev:user -- you@example.test   # สร้างผู้ใช้ local (ปิดสมัครสาธารณะ จึงสมัครเองไม่ได้)
npm run dev                         # http://localhost:3000/login  (รหัส 6 หลักอยู่ใน Mailpit http://127.0.0.1:54324)
```

| คำสั่ง | ทำอะไร |
|---|---|
| `npm test` | เทสต์ทั้งหมด (ต้อง `supabase start` ก่อน ไม่งั้นเทสต์ DB ข้าม) |
| `npm run test:db` | เฉพาะเทสต์ DB/RLS |
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
- ล็อกอินด้วยรหัส OTP 6 หลักทางอีเมล (อายุ 10 นาที) ไม่มีรหัสผ่าน ปิดสมัครสาธารณะ
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
- `@types/node` ปรับเป็น `^22` ให้ตรง Node 22 และ Vitest 5.1.0
- `src/lib/env.ts` ตรวจเฉพาะตัวแปร public ตอนนี้ ตัวแปรฝั่ง server (service-role key, `JOB_SECRET`, `CRON_SECRET`, VAPID, `APP_URL`) จะเพิ่มใน phase ที่เริ่มใช้

## ค้างอยู่ (ต้องให้คนทำ)

1. สร้างโปรเจกต์ Supabase **staging และ production** ที่ Singapore แล้ว `supabase link` จากนั้น push migration (ผมจะไม่ push ขึ้นของจริงเองถ้าคุณไม่สั่ง)
2. **ปิด "Allow new users to sign up"** บนโปรเจกต์จริง ถ้าเปิดค้างไว้ ใครก็สมัครได้ผ่าน Auth API โดยตรง `supabase db push` ไม่ตั้งค่านี้ให้
3. ตั้ง **custom SMTP** (Resend/Brevo มีแพ็กฟรี) แล้วใส่เทมเพลต `supabase/templates/magic_link.html` ที่แสดง `{{ .Token }}` Free plan กับ SMTP เริ่มต้นแก้เทมเพลตไม่ได้ และอีเมลเริ่มต้นอาจมีแต่ลิงก์ ไม่มีรหัส ล็อกอินด้วยรหัสบนของจริงจะใช้ไม่ได้ถ้าไม่ทำข้อนี้
4. ตั้ง Email OTP expiration เป็น 600 วินาที, ตั้ง Site URL และ redirect allow-list เป็น URL production, เชิญเจ้าของจาก dashboard
5. ลิงก์ Vercel project กับ preview deployments (Phase 1 ยังค้าง)
6. ตัดสินใจว่าจะถอดแพ็กเกจที่ไม่ได้ใช้ออกหรือไม่: `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `lucide-react`

## ปัญหาที่รู้และข้อควรระวัง

- ฟอร์มล็อกอินเคยรีเซ็ตทั้งก้อนหนึ่งครั้งหลังส่งอีเมลสำเร็จ ทำซ้ำอีก 14 รอบไม่เกิดอีก ถ้าเจออีกให้ดูว่า cookie ที่ Server Action ตั้งทำให้หน้ารีเฟรชแล้ว state ใน Suspense หายหรือไม่
- ทดสอบ rate limit (429) บน local ไม่ได้ เพราะ `max_frequency = 1s` ใน `config.toml` (ของจริง 60 วินาที) ครอบด้วย unit test แบบ mock แล้ว
- cookie `Secure` บน `next start` ที่ `http://localhost` ใช้ได้ใน Chrome แต่ Safari อาจไม่รับ
- เซิร์ฟเวอร์ dev พอร์ต 3000 ของคุณจะอ่าน `.env.local` (ชี้ local stack) ถ้าอยากใช้โปรเจกต์ที่ลิงก์ ให้ลบ `.env.local` แล้วรีสตาร์ต
- `/api/jobs/*` ถูกยกเว้นจาก proxy โดยตั้งใจ ทุก handler ต้องตรวจ `JOB_SECRET`/`CRON_SECRET` เอง (constant-time compare)
- `push_subscriptions.endpoint` จำกัดแค่ `https://` ใน DB แต่ตัวส่ง push (Phase 6) ต้องมี allow-list host ของ push service เพิ่ม กัน SSRF
- ยังไม่มี security headers/CSP (แผนกำหนดไว้ §14.4 ทำใน Phase 7)
- ยังไม่ทำ: คืนตำแหน่ง scroll เมื่อสลับแท็บ (§10.2), guard ไป `/onboarding` (หน้า onboarding ยังไม่มี), ภาพประกอบ hero เป็น SVG ชั่วคราว (ไม่ใช่ Lottie)

## ทำต่อ: Phase 3 — Weather Integration

เป้าหมาย: เซิร์ฟเวอร์ดึงและเก็บพยากรณ์ของบ้านและที่ทำงานได้ (แผน §4, §18)

ก่อนเริ่ม: ให้ push migration ขึ้นโปรเจกต์จริงตามข้อ "ค้างอยู่" 1 หรือทำบน local ไปก่อนก็ได้ (Phase 3 ไม่ต้องมี SMTP)

1. `src/lib/supabase/service.ts` ไคลเอนต์ service-role ใส่ `import 'server-only'` และเพิ่ม `SUPABASE_SERVICE_ROLE_KEY` ใน `env.ts` (ฝั่ง server เท่านั้น)
2. `openMeteoClient`: Zod schema ของ response, `AbortSignal.timeout(15000)`, backoff เมื่อได้ 429 (สูงสุด 3 ครั้งต่อ tick), จัดการ null และ field ที่หาย ตรวจความหมาย "preceding hour" ของ Open-Meteo อีกครั้งแล้วบันทึกเป็นคอมเมนต์ข้างฟังก์ชัน mapping (§4.2)
3. `forecastSyncService`: กฎ refresh (§4.6) ข้ามถ้า fetch สำเร็จล่าสุดไม่ถึง 15 นาที, ทุก 60 นาทีช่วง 05:00–20:00 และทุก 3 ชั่วโมงนอกช่วงนั้น, แต่ละตำแหน่ง sync แยกกัน, บันทึกผ่าน `save_forecast_batch` (ฟังก์ชันและเทสต์มีแล้ว)
4. `forecastRepo`, `settingsRepo` (ครอบ `update_location`): รับ Supabase client เป็นพารามิเตอร์ ไม่มี business rule
5. `/api/geocode`: route handler ตรวจ session, validate response ด้วย Zod, ตั้ง `language` ตาม locale, ฝั่ง client debounce 400 ms และไม่เรียกถ้าพิมพ์น้อยกว่า 2 ตัวอักษร
6. เทสต์ตาม §16.1: parse response ที่มี null/key หาย, API ล้มเหลว, 429, ตำแหน่งหนึ่งล้มอีกตำแหน่งยังบันทึกได้, ข้อมูลเสียห้ามทับ cache ที่ดี
7. เกณฑ์ผ่าน: เซิร์ฟเวอร์ดึงและเก็บพยากรณ์ของทั้งสองตำแหน่งที่ตั้งค่าไว้ได้

## หลังจากนั้น

- **Phase 4:** พอร์ตเคสทดสอบของ engine ก่อน (§5.1 สามแถวบังคับ, ตาราง §16.5), window mapper, analyzer, schedule, freshness, locking และ reason แบบมีโครงสร้าง ทดสอบทั้ง `TZ=UTC` และ `TZ=Asia/Bangkok`, ต้องเป็นโมดูลบริสุทธิ์ไม่ import next/react/supabase (ใส่กฎ ESLint `no-restricted-imports`)
- **Phase 5:** onboarding, หน้า Weather/History/Settings จริง, ต่อ Dashboard เข้ากับข้อมูลจริง, ภาพ hero, icon และ manifest, Playwright visual snapshot และ design review gate (§12.5)
- **Phase 6:** `/api/jobs/tick` และ `/api/jobs/daily`, pg_cron + pg_net + Vault, Web Push, service worker, offline snapshot
- **Phase 7:** CI, Lighthouse, security headers/CSP, README, backup action
