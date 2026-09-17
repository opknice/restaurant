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

หากหน้าแอปแสดง `กำลังตรวจสอบการเข้าสู่ระบบ...` นานเกิน 10 วินาที ระบบจะแสดงข้อผิดพลาดพร้อมปุ่ม `ลองใหม่` และ `ออกจากระบบ` ให้ตรวจสอบอินเทอร์เน็ตแล้วกด `ลองใหม่` ได้ โดยไม่ต้องล้างข้อมูลในเบราว์เซอร์

## Supabase migrations

ให้ apply ตามลำดับดังนี้ใน Supabase SQL Editor (หรือ Supabase CLI):

1. `supabase/migrations/202609110001_initial_foundation.sql`
2. `supabase/migrations/202609110002_sales_transactions.sql`
3. `supabase/migrations/202609110003_print_queue.sql`
4. `supabase/migrations/202609110004_reports_history.sql`
5. `supabase/migrations/202609110005_hardening.sql`
6. `supabase/migrations/202609110006_expenses.sql`
7. `supabase/migrations/202609110007_report_paid_count.sql`
8. `supabase/migrations/202609110008_expense_idempotency_and_access.sql`
9. `supabase/migrations/202609110009_print_review_queue.sql`
10. `supabase/migrations/202609110010_cursor_pagination.sql`
11. `supabase/migrations/202609110011_paid_order_correction.sql`
12. `supabase/migrations/202609110012_checkout_preview.sql`
13. `supabase/migrations/202609110013_checkout_preview_fixes.sql`
14. `supabase/migrations/202609110014_daily_wages_ledger.sql`
15. `supabase/migrations/202609110015_combined_expense_wage_save.sql`
16. `supabase/migrations/202609110016_expense_total_summary.sql`
17. `supabase/migrations/202609110017_security_and_checkout_consistency.sql`
18. `supabase/migrations/202609110018_rpc_privilege_followup.sql`
19. `supabase/migrations/202609110019_rls_and_foreign_key_indexes.sql`
20. `supabase/migrations/202609110020_create_employee_rpc.sql`
21. `supabase/migrations/202609110021_fix_atomic_preview_creation.sql`
22. `supabase/migrations/20260917034737_realtime_order_items.sql`
23. `supabase/migrations/20260917040129_realtime_catalog_and_status.sql`
24. `supabase/migrations/20260917062124_product_subcategories.sql`
25. `supabase/migrations/20260917070000_update_product_rpc.sql`
26. `supabase/migrations/20260917100000_product_manual_groups.sql`
27. `supabase/migrations/20260917110000_delete_product_rpc.sql`
28. `supabase/migrations/20260917120000_import_stock_products.sql`
29. `supabase/migrations/20260917130000_product_favorites.sql`
30. `supabase/migrations/20260917130001_remove_unused_product_favorites_index.sql`
31. `supabase/migrations/20260917140000_delete_sales_history_rpc.sql`

Migration ชุดแรกสร้าง:

- schema สำหรับผู้ใช้ สินค้า หมวดสินค้า โต๊ะ 1–20 บิล การชำระเงิน ใบเสร็จ และ audit event
- profile จาก Supabase Auth user โดยอัตโนมัติ
- Row Level Security ทุกตาราง
- สิทธิ์ manager สำหรับแก้ไขสินค้า ราคา และข้อมูลร้าน/QR
- direct client write ถูกปิดสำหรับบิล การชำระเงิน การคืนเงิน และใบเสร็จ เพื่อรอ RPC ใน Phase 2

Migration ชุดที่สองเพิ่ม RPC ฝั่งฐานข้อมูลสำหรับเปิดบิล แก้จำนวนรายการ ส่วนลด เช็กบิล ยกเลิก และคืนเงินเต็มบิล โดยคำนวณยอดและตรวจสิทธิ์ใน transaction เดียว รวมถึง Realtime สำหรับสถานะโต๊ะ

Migration ชุดที่สี่เพิ่ม snapshot หมวดสินค้า, RPC บิลย้อนหลัง และ RPC รายงานที่แยกเงินสด/เงินโอน ส่วนลด คืนเงิน สินค้า ผู้ขาย และโต๊ะตามช่วงเวลาไทย

Migration ชุดที่ห้าเพิ่มการปิดสิทธิ์ของบัญชี inactive ในทุก policy ที่อ่านข้อมูล, trigger รักษา `updated_at` และ security headers สำหรับ Vercel

Migration ชุดที่หกเป็นโครงสร้างรายจ่ายรุ่นทดลอง ซึ่งถูกแทนที่และลบข้อมูลทดลองออกโดย Migration 014

Migration ชุดที่สิบเอ็ดเพิ่ม Workflow แก้ไขบิลที่ชำระแล้วสำหรับ manager เท่านั้น โดยสร้าง Draft แยกจากโต๊ะเดิม แก้รายการอาหาร/ส่วนลด/รูปแบบใบเสร็จได้ แล้วจึงคืนเงินบิลเดิมเต็มจำนวนและสร้างบิล Revision ใหม่พร้อม Payment และ Receipt ใน Transaction เดียว รายงานใช้วันที่ขายเดิม และใบเสร็จเดิมที่พิมพ์แล้วจะถูกเก็บเป็นประวัติไม่ลบออก

Migration ชุดที่สิบสองเพิ่ม Preview ก่อนชำระเงิน: Manager/Cashier ตรวจรายการและ QR ได้ก่อนเลือกพิมพ์แบบร้านอาหารหรือสนามฟุตบอล จากนั้นจึงไปเลือกเงินสด/เงินโอนและยืนยันชำระเงิน โดย Cancel จะปิด Preview โดยไม่ลบโต๊ะหรือรายการอาหาร

Migration ชุดที่สิบสามทำให้ Preview ที่พิมพ์เป็นเอกสารคงที่เพียงใบเดียวหลังชำระเงิน, บังคับยืนยันเงินโอนใน RPC, เพิ่มการยกเลิกงาน Preview ที่ยังไม่พิมพ์ และแก้สถานะงานพิมพ์ QR ที่ล้มเหลวให้เข้าสู่การตรวจสอบ

Migration ชุดที่สิบสี่ปรับหน้า Manager เป็น ledger รายจ่ายเงินสดแบบใหม่: รายจ่ายทั่วไปกรอกวันที่/ยอด/หมายเหตุ และค่าแรงเลือกพนักงานหลายคนตามวันที่ โดยเก็บชื่อและค่าแรง snapshot ต่อวัน ป้องกันรายการซ้ำ รองรับการปิดใช้งานพนักงาน และลบโครงสร้างทดลองประเภท/หลักฐานแนบพร้อมข้อมูลทดสอบเดิม

Migration ชุดที่สิบห้าเพิ่มคำสั่ง `บันทึกทั้งหมด` สำหรับบันทึกรายจ่ายทั่วไปและค่าแรงด้วย transaction เดียว โดยอนุญาตให้บันทึกเฉพาะส่วนที่มีข้อมูลและ rollback ทั้งชุดเมื่อข้อมูลไม่ถูกต้อง

Migration ชุดที่สิบหกเพิ่มยอดรวมรายจ่ายตามช่วงวันที่จากฐานข้อมูลโดยตรง เพื่อให้ยอดไม่ผิดแม้รายการจะแบ่งหลายหน้าด้วย pagination

Migration ชุดที่สิบเจ็ดถึงยี่สิบเอ็ดเพิ่มความปลอดภัยและความถูกต้องก่อนใช้งานจริง: จำกัดสิทธิ์เรียก RPC ตามบทบาท, ปิดสิทธิ์ helper ภายใน, เพิ่ม index ของ RLS/foreign key, เพิ่ม idempotency ให้ Preview และ Checkout, ล็อกรายการอาหารหลังส่ง Preview, แยก RPC สร้างพนักงาน และแก้การสร้าง Preview แบบ atomic

Migration ชุดที่ยี่สิบสองเพิ่ม Realtime สำหรับ `order_items` และ fallback polling ในหน้าขาย เพื่อให้การเพิ่ม/ลดรายการจากอีกอุปกรณ์สะท้อนบนบิลที่เปิดอยู่

Migration ชุดที่ยี่สิบสามเพิ่ม Realtime สำหรับ `products`, `categories` และ `dining_tables` พร้อม fallback ตรวจสอบสถานะโต๊ะและรายการอาหาร เพื่อให้หน้าขายหลายอุปกรณ์สะท้อนข้อมูลล่าสุดแม้ WebSocket ขัดข้อง

Migration ชุดที่ยี่สิบสี่เพิ่มหัวข้อย่อยสินค้าและความสัมพันธ์ระหว่างสินค้าและหัวข้อย่อย

Migration ชุดที่ยี่สิบห้าเพิ่ม RPC แก้ไขสินค้า, seed สำรองสำหรับ `store_settings`, policy ปฏิเสธการเข้าถึงตารางพนักงาน/รายจ่ายโดยตรง และการยกเลิกบิลว่างอย่างปลอดภัย

Migration ชุดที่ยี่สิบหกเพิ่ม `group_name` ให้สินค้าและ RPC สำหรับให้ manager กำหนดกลุ่มเมนูเอง หน้าขายจะแสดงสินค้าในกลุ่มเดียวกันเป็นแถวแนวนอนและเรียงราคาจากน้อยไปมาก ส่วนสินค้าที่ไม่กำหนดกลุ่มจะแสดงในกลุ่ม “อื่นๆ”

Migration ชุดที่ยี่สิบเจ็ดเพิ่ม RPC ลบสินค้าแบบถาวรสำหรับ manager โดยจะป้องกันการลบสินค้าที่มีประวัติขายหรือรายการแก้ไขบิล และแนะนำให้ปิดการขายแทน

Migration ชุดที่ยี่สิบแปดนำเข้าสินค้าจาก `stock_products.xlsx` จำนวน 425 รายการ โดยใช้ `Product_Group` เป็นทั้งหมวดหลักและกลุ่มเมนู และเก็บรายการซ้ำตามต้นฉบับ

Migration ชุดที่ยี่สิบเก้าเพิ่ม `is_favorite` เป็นรายการโปรดกลางของร้าน ให้ manager กำหนดจากหน้าสินค้า แล้วหน้าขายจะแสดงเฉพาะรายการโปรดของหมวดที่กำลังเลือกไว้ด้านบน โดยเรียงราคาน้อยไปมาก

Migration ชุดที่สามสิบลบดัชนีรายการโปรดที่ไม่ได้ถูกใช้ เพราะหน้าขายโหลดแค็ตตาล็อกแล้วกรองใน React เพื่อหลีกเลี่ยงภาระฐานข้อมูลที่ไม่จำเป็น

Migration ชุดที่สามสิบเอ็ดเพิ่ม RPC ลบประวัติการขายแบบถาวรสำหรับ manager โดยลบบิลและ Revision ที่เกี่ยวข้องใน transaction เดียว พร้อมเก็บ audit event ของการลบไว้ตรวจสอบย้อนหลัง

รายละเอียดการใช้งานอยู่ที่ [phase-5-expenses-handoff.md](../reviews/phase-5-expenses-handoff.md)

ฐานข้อมูล Supabase ที่เชื่อมอยู่ได้รับ Migration `001`–`031` ครบแล้วเมื่อวันที่ 17 กันยายน 2026 สำหรับ environment ใหม่ต้อง apply ตามลำดับเดิมทั้งหมด ห้ามข้ามไฟล์แม้ Migration รุ่นใหม่จะลบหรือแทนที่โครงสร้างรุ่นทดลอง

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

## ขั้นตอนขายและเช็กบิล

- ใช้เมนู **ขายหน้าร้าน** เพื่อเลือกโต๊ะ เปิดบิล แล้วเพิ่ม/ลดรายการอาหาร
- manager เท่านั้นที่ให้ส่วนลดหรือยกเลิกบิล และต้องระบุเหตุผลเมื่อให้ส่วนลด/ยกเลิก
- Check Bill รองรับเงินสด (ปุ่ม 20/50/100/500/1,000/พอดี และเงินทอน) กับเงินโอน (เลขอ้างอิงไม่บังคับ แต่ต้องติ๊กยืนยันว่าได้รับเงิน)
- เมื่อกดเช็กบิล ระบบจะแสดง Preview ก่อน จากนั้นเลือกพิมพ์แบบ **ร้านอาหาร**, **สนามฟุตบอล** หรือยกเลิก
- เมื่อส่ง Preview ไปพิมพ์แล้ว รายการและยอดจะถูกล็อกจนชำระเสร็จ เพื่อให้กระดาษที่ลูกค้าได้รับตรงกับยอดชำระ
- เงินสดต้องกรอกเงินรับไม่น้อยกว่ายอดสุทธิ ระบบคำนวณเงินทอน ส่วนเงินโอนต้องติ๊กยืนยันว่าได้รับเงินแล้ว
- การกด **ยืนยันชำระเงิน** ปิดบิลและโต๊ะ โดยไม่สร้างงานพิมพ์ใบที่สองใน workflow ปกติ
- manager สามารถเปิดบิลที่ชำระแล้วมาแก้ไขได้ ระบบจะคืนเงินบิลเดิมเต็มจำนวนและสร้าง Revision ใหม่ใน transaction เดียว โดยรายงานยังลงวันที่ขายเดิม

## รายรับ–รายจ่ายและค่าแรง

- หน้านี้เปิดให้ manager เท่านั้น และใช้วันที่เดียวกันสำหรับรายจ่ายทั่วไปกับค่าแรง
- รายจ่ายทั่วไปกรอกจำนวนเงินและหมายเหตุได้ ส่วนวิธีจ่ายเป็นเงินสดอัตโนมัติ
- ค่าแรงเลือกพนักงานได้หลายคนและเก็บชื่อกับค่าแรงรายวันเป็น snapshot ทำให้ประวัติเดิมไม่เปลี่ยนเมื่อแก้ค่าแรงภายหลัง
- ปุ่ม **บันทึกทั้งหมด** บันทึกเฉพาะส่วนที่มีข้อมูล และ rollback ทั้งชุดหากส่วนใดผิดพลาด
- พนักงานที่เลิกใช้งานจะถูกปิดสถานะแต่ประวัติค่าแรงยังอยู่ รายการรายจ่ายและค่าแรงที่บันทึกแล้วสามารถยกเลิกโดย manager
- ยอดรวมรายจ่ายคำนวณจากฐานข้อมูลทั้งช่วงวันที่ ไม่ขึ้นกับจำนวนรายการที่แสดงในแต่ละหน้า
- หน้าใช้งานแบ่งเป็นแท็บ `บันทึกวันนี้` และ `ประวัติรายจ่าย` พร้อมสรุปรายรับ รายจ่าย และคงเหลือของวันที่เลือก
- การเพิ่ม แก้ไข และเปิด/ปิดใช้งานพนักงานทำจากปุ่ม `จัดการพนักงาน` ใน Dialog แยกจากรายการเช็กชื่อ

## Local Print Bridge สำหรับ Xprinter USB

Print Bridge ทำงานบนคอมกลาง Windows 10 ที่ต่อ Xprinter ผ่าน USB โดยดึงงานที่พนักงานกดส่งจาก Supabase ออกไปพิมพ์ผ่านไดรเวอร์ Windows จึงไม่ต้องเปิด port ของคอมกลางให้มือถือเรียก และไม่ติดปัญหา HTTPS ของ Vercel เรียก HTTP ใน LAN

1. ติดตั้งไดรเวอร์ Xprinter และตั้งค่า Paper size เป็น 80 มม. ใน Windows ก่อน
2. ติดตั้ง Node.js 20 ขึ้นไปบนคอมกลาง
3. เปิด PowerShell ใน `restaurant-pos-web\print-bridge` แล้วคัดลอกไฟล์ตั้งค่า:

```powershell
Copy-Item .env.example .env.local
Get-Printer | Select-Object Name, DriverName, PortName
```

4. ใส่ชื่อเครื่องพิมพ์ให้ตรงกับ Windows ใน `PRINT_PRINTER_NAME` และใส่ `SUPABASE_URL` กับ Secret Key (`sb_secret_...`) ใน `SUPABASE_SECRET_KEY` ของ Print Bridge เท่านั้น ห้ามนำ Secret Key ไปใส่ `.env.local` ของ React หรือ Vercel หาก QR อยู่คนละ host กับ Supabase ให้เพิ่ม host ใน `PRINT_QR_ALLOWED_HOSTS`
5. เริ่ม bridge:

```powershell
npm run check
npm run start
```

สถานะตรวจได้เฉพาะบนคอมกลางที่ `http://127.0.0.1:4318/health` จากนั้นตั้ง Windows Task Scheduler ให้รัน `npm run start` ตอนเปิดเครื่อง หลังทดสอบพิมพ์สำเร็จ

หาก Bridge หรือคำสั่งพิมพ์หยุดระหว่างทำงาน ระบบจะพักงานไว้เป็น `รอตรวจสอบ` และไม่ส่งซ้ำอัตโนมัติ ผู้จัดการตรวจได้จากเมนู **งานพิมพ์** แล้วเลือกยืนยันว่าพิมพ์แล้ว, ส่งพิมพ์ใหม่ หรือยกเลิกงาน

ใบแบบ `ร้าน` จะพิมพ์ข้อมูลร้าน รายการ ยอด ส่วนลด และ QR ก่อนชำระเงิน ส่วนใบแบบ `สนาม` จะพิมพ์เฉพาะรายการอาหารเพื่อประหยัดกระดาษ

## ตรวจสอบคุณภาพ

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

ตรวจ Print Bridge เพิ่มเติมด้วย:

```powershell
Set-Location .\print-bridge
npm run check
```

## งานก่อนเปิดใช้งาน Production

1. Deploy frontend พร้อม `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY`
2. อัปเดตและ Restart Print Bridge โดยใช้ `SUPABASE_SECRET_KEY` จาก Supabase
3. เปิด **Leaked Password Protection** ใน Supabase Auth Dashboard
4. ลบ bucket `expense-evidence` ที่เลิกใช้แล้วผ่าน Supabase Storage Dashboard หรือ Storage API ห้ามลบข้อมูลในตาราง `storage.*` ด้วย SQL โดยตรง
5. ทดสอบ Xprinter จริงทั้งใบแบบร้าน ใบแบบสนาม QR และกรณี Bridge หยุดระหว่างพิมพ์

## Deploy บน Vercel

ตั้งค่า Root Directory เป็น `restaurant-pos-web` แล้วเพิ่ม `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY` ใน Vercel Production Environment การตั้งค่า `vercel.json` รองรับ route ของ React Router แล้ว
