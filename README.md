# POS ร้านอาหาร

Web App ภาษาไทยสำหรับระบบขายหน้าร้าน พัฒนาด้วย React + TypeScript และ Supabase

## เริ่มใช้งานในเครื่อง

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

กำหนดค่าต่อไปนี้ใน `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

ค่าทั้งสองตัวใส่ใน Vercel Environment Variables ได้ แต่ห้ามใส่ `service_role` key ใน browser, GitHub หรือ Vercel environment ของ frontend

## Supabase migrations

ให้ apply ตามลำดับดังนี้ใน Supabase SQL Editor (หรือ Supabase CLI):

1. `supabase/migrations/202609110001_initial_foundation.sql`
2. `supabase/migrations/202609110002_sales_transactions.sql`
3. `supabase/migrations/202609110003_print_queue.sql`
4. `supabase/migrations/202609110004_reports_history.sql`
5. `supabase/migrations/202609110005_hardening.sql`

Migration ชุดแรกสร้าง:

- schema สำหรับผู้ใช้ สินค้า หมวดสินค้า โต๊ะ 1–20 บิล การชำระเงิน ใบเสร็จ และ audit event
- profile จาก Supabase Auth user โดยอัตโนมัติ
- Row Level Security ทุกตาราง
- สิทธิ์ manager สำหรับแก้ไขสินค้า ราคา และข้อมูลร้าน/QR
- direct client write ถูกปิดสำหรับบิล การชำระเงิน การคืนเงิน และใบเสร็จ เพื่อรอ RPC ใน Phase 2

Migration ชุดที่สองเพิ่ม RPC ฝั่งฐานข้อมูลสำหรับเปิดบิล แก้จำนวนรายการ ส่วนลด เช็กบิล ยกเลิก และคืนเงินเต็มบิล โดยคำนวณยอดและตรวจสิทธิ์ใน transaction เดียว รวมถึง Realtime สำหรับสถานะโต๊ะ

Migration ชุดที่สี่เพิ่ม snapshot หมวดสินค้า, RPC บิลย้อนหลัง และ RPC รายงานที่แยกเงินสด/เงินโอน ส่วนลด คืนเงิน สินค้า ผู้ขาย และโต๊ะตามช่วงเวลาไทย

Migration ชุดที่ห้าเพิ่มการปิดสิทธิ์ของบัญชี inactive ในทุก policy ที่อ่านข้อมูล, trigger รักษา `updated_at` และ security headers สำหรับ Vercel

หลังสร้างผู้ใช้คนแรก ให้กำหนด role ของเจ้าของร้านใน Supabase SQL Editor:

```sql
update public.profiles
set role = 'manager'
where id = 'AUTH_USER_UUID';
```

ผู้ใช้ใหม่จะเป็น `cashier` โดยอัตโนมัติ หากต้องระงับบัญชี:

```sql
update public.profiles set active = false where id = 'AUTH_USER_UUID';
```

## เตรียมข้อมูลสินค้า

ฐานข้อมูล Access ใช้เฉพาะเป็นแหล่งตั้งต้นของชื่อ หมวด และราคาเท่านั้น ไฟล์ `supabase/seeds/catalog-candidates.csv` ถูกสร้างไว้สำหรับตรวจสอบแล้ว และสามารถสร้างใหม่ได้ด้วย:

```powershell
.\scripts\export-legacy-catalog.ps1 -OutputPath .\catalog-candidates.csv
```

CSV ทุกแถวมีสถานะ `review_required` จึงยังไม่ถูก import เข้า Supabase ตรวจสินค้าซ้ำก่อน import ทุกครั้ง โดยเฉพาะสินค้าที่ชื่อเหมือนกันแต่ราคาแตกต่างกัน

หลังผู้จัดการเข้าสู่ระบบ สามารถสร้างหมวด เพิ่มสินค้า ตั้งราคา และปิด/เปิดการขายได้จากเมนู **สินค้า** โดยไม่ต้อง import ข้อมูล demo เดิม

## การขายใน Phase 2

- ใช้เมนู **ขายหน้าร้าน** เพื่อเลือกโต๊ะ เปิดบิล แล้วเพิ่ม/ลดรายการอาหาร
- manager เท่านั้นที่ให้ส่วนลดหรือยกเลิกบิล และต้องระบุเหตุผลเมื่อให้ส่วนลด/ยกเลิก
- Check Bill รองรับเงินสด (ปุ่ม 20/50/100/500/1,000/พอดี และเงินทอน) กับเงินโอน (เลขอ้างอิงไม่บังคับ แต่ต้องติ๊กยืนยันว่าได้รับเงิน)
- การชำระสำเร็จจะสร้าง receipt snapshot ในฐานข้อมูลทันที พนักงานจึงกด **ส่งงานพิมพ์** ได้เมื่อตรวจบิลเรียบร้อย

## Local Print Bridge สำหรับ Xprinter USB

Print Bridge ทำงานบนคอมกลาง Windows 10 ที่ต่อ Xprinter ผ่าน USB โดยดึงงานที่พนักงานกดส่งจาก Supabase ออกไปพิมพ์ผ่านไดรเวอร์ Windows จึงไม่ต้องเปิด port ของคอมกลางให้มือถือเรียก และไม่ติดปัญหา HTTPS ของ Vercel เรียก HTTP ใน LAN

1. ติดตั้งไดรเวอร์ Xprinter และตั้งค่า Paper size เป็น 80 มม. ใน Windows ก่อน
2. ติดตั้ง Node.js 20 ขึ้นไปบนคอมกลาง
3. เปิด PowerShell ใน `restaurant-pos-web\print-bridge` แล้วคัดลอกไฟล์ตั้งค่า:

```powershell
Copy-Item .env.example .env.local
Get-Printer | Select-Object Name, DriverName, PortName
```

4. ใส่ชื่อเครื่องพิมพ์ให้ตรงกับ Windows ใน `PRINT_PRINTER_NAME` และใส่ `SUPABASE_URL` กับ **Service Role Key** ใน `.env.local` ของ Print Bridge เท่านั้น ห้ามนำ Service Role Key ไปใส่ `.env.local` ของ React หรือ Vercel
5. เริ่ม bridge:

```powershell
npm run check
npm run start
```

สถานะตรวจได้เฉพาะบนคอมกลางที่ `http://127.0.0.1:4318/health` จากนั้นตั้ง Windows Task Scheduler ให้รัน `npm run start` ตอนเปิดเครื่อง หลังทดสอบพิมพ์สำเร็จ

ใบแบบ `ร้าน` จะพิมพ์ข้อมูลร้าน รายการ ยอด ส่วนลด และการชำระเงิน; ใบแบบ `สนาม` จะพิมพ์เฉพาะโต๊ะ/เลขบิลและรายการอาหารเพื่อประหยัดกระดาษ

## ตรวจสอบคุณภาพ

```powershell
npm run typecheck
npm run lint
npm run build
```

## Deploy บน Vercel

ตั้งค่า Root Directory เป็น `restaurant-pos-web` แล้วเพิ่ม `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY` ใน Vercel Production Environment การตั้งค่า `vercel.json` รองรับ route ของ React Router แล้ว
# Restaurant
