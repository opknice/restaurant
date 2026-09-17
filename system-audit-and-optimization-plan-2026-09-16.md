# สรุปการตรวจสอบบัคและแผนก่อนใช้งานจริงของระบบ POS

อัปเดตล่าสุด: 16 กันยายน 2026

โครงการ: `restaurant-pos-web`

เทคโนโลยี: React 19, TypeScript, Supabase, Vercel และ Windows Print Bridge

## สถานะโดยรวม

การแก้ไขตามแผนตั้งแต่ระบบขาย, Preview ก่อนชำระเงิน, แก้ไขบิลที่ชำระแล้ว, รายรับ–รายจ่าย, ค่าแรง, สิทธิ์ฐานข้อมูล และ Print Queue ดำเนินการครบแล้ว โค้ดและ Migration ปัจจุบันพร้อมสำหรับ Deploy ไปทดสอบแบบ Pilot หลังทำรายการในหัวข้อ **งานที่ต้องทำก่อน Production**

Supabase project ที่เชื่อมอยู่ได้รับ Migration `202609110001`–`202609110021` ครบ และประวัติ Migration ตรงกับไฟล์ใน repository แล้ว

## ผลตรวจสอบล่าสุด

- `npm run typecheck` ผ่าน
- `npm run lint` ผ่าน
- `npm test` ผ่าน 2 test files รวม 4 tests
- `npm run build` ผ่าน
- `npm audit` ไม่พบช่องโหว่จาก dependency
- `node --check print-bridge/src/index.cjs` ผ่าน
- PowerShell parser ตรวจ `print-bridge/src/print-receipt.ps1` ผ่าน
- Supabase ไม่พบ RPC แบบ `SECURITY DEFINER` ที่เปิดให้ `anon` เรียก
- ไม่พบ Preview ค้างที่ส่งพิมพ์โดยไม่มีคำขอพิมพ์ และไม่พบงานค้างสถานะ `printing`
- ไม่พบยอดบิลกับยอดชำระไม่ตรงกัน และไม่พบค่าแรง active ซ้ำต่อพนักงานในวันเดียวกัน

## การทดสอบกับ Supabase จริง

ทดสอบ Integration ภายใน transaction และ rollback ข้อมูลทดสอบทุกครั้ง ครอบคลุมกรณีต่อไปนี้:

1. เปิดบิล เพิ่มสินค้า และส่ง Preview แบบ atomic สำเร็จ
2. ส่งคำขอ Preview เดิมซ้ำด้วย request ID เดิมแล้วได้รายการเดิม ไม่สร้างใบเสร็จซ้ำ
3. หลังส่ง Preview แล้ว ไม่สามารถเพิ่ม ลบ หรือแก้จำนวนอาหารได้
4. ยืนยันชำระเงินซ้ำด้วย checkout request ID เดิมแล้วได้ผลลัพธ์เดิม ไม่สร้าง Payment ซ้ำ
5. ค่าแรงที่บันทึกแล้วเก็บ snapshot เดิม แม้แก้ค่าแรงปัจจุบันของพนักงานภายหลัง
6. `บันทึกทั้งหมด` ที่มีข้อมูลส่วนหนึ่งผิดพลาด rollback ทั้งรายจ่ายทั่วไปและค่าแรง

เครื่องตรวจสอบไม่มี Docker daemon จึงไม่ได้เปิด Supabase local stack แต่ Migration ถูกตรวจด้วย transaction บน Supabase ที่เชื่อมอยู่ก่อน apply จริง

## สิ่งที่แก้ไขแล้ว

### Checkout และ Preview

- เปลี่ยนเป็น Preview และพิมพ์ก่อนเลือกวิธีชำระเงิน
- รองรับใบแบบร้านอาหารและสนามฟุตบอล โดย Preview ปกติมีกระดาษเพียงใบเดียว
- ล็อกรายการอาหาร ส่วนลด และยอดทันทีหลังส่ง Preview เพื่อให้ยอดในระบบตรงกับกระดาษ
- ใช้ request ID ป้องกันการกดซ้ำทั้งขั้น Preview และ Checkout
- เงินสดตรวจเงินรับและคำนวณเงินทอน เงินโอนบังคับติ๊กยืนยันการรับเงิน
- การชำระสำเร็จไม่สร้างงานพิมพ์ใบที่สองใน workflow ปกติ
- การพิมพ์ซ้ำโดยเจตนาสร้าง Receipt job ใหม่และมี Audit trail

### แก้ไขบิลที่ชำระแล้ว

- อนุญาตเฉพาะ manager
- สร้าง Draft แยกจากบิลเดิมและแก้รายการอาหาร ส่วนลด และรูปแบบใบเสร็จได้
- เมื่อยืนยัน ระบบคืนเงินบิลเดิมเต็มจำนวนและสร้างบิล Revision ใหม่พร้อม Payment/Receipt ใน transaction เดียว
- รายงานบันทึก Revision ใหม่กลับไปยังวันที่ขายเดิมด้วย `business_at`
- บิลและใบเสร็จเดิมยังคงอยู่เป็นประวัติและไม่ถูกนับเป็นยอดขายซ้ำ

### รายรับ–รายจ่ายและค่าแรง

- ลบโครงสร้างหมวดรายจ่าย หลักฐานแนบ และข้อมูลทดลองที่ไม่ใช้แล้ว
- ปรับ UX เป็นแท็บ `บันทึกวันนี้` และ `ประวัติรายจ่าย` พร้อมสรุปรายรับ รายจ่าย และคงเหลือของวันที่เลือก
- แยก Dialog จัดการพนักงานออกจากรายการเช็กชื่อ และแสดงสถานะ `บันทึกแล้ว`, `เพิ่มใหม่` และ `จะยกเลิก`
- รายจ่ายทั่วไปใช้วันที่ จำนวนเงิน หมายเหตุ และเงินสดอัตโนมัติ
- จัดการรายชื่อพนักงาน ชื่อ ค่าแรงรายวัน และสถานะเปิดใช้งาน
- เลือกพนักงานหลายคนต่อวันและเก็บชื่อ/ค่าแรงเป็น snapshot
- ใช้วันที่เดียวและปุ่ม `บันทึกทั้งหมด` สำหรับรายจ่ายทั่วไปกับค่าแรง
- อนุญาตให้บันทึกเพียงส่วนใดส่วนหนึ่ง แต่ไม่อนุญาตคำขอว่าง
- บันทึกสองส่วนแบบ atomic และ rollback ทั้งหมดเมื่อมีข้อผิดพลาด
- ยอดรวมรายจ่ายดึงจากฐานข้อมูลทั้งช่วงวันที่ จึงไม่ผิดจาก pagination
- manager ยังยกเลิกรายการได้ และรายการยกเลิกไม่ถูกนำไปรวมยอด

### Frontend และประสิทธิภาพ

- ป้องกัน stale response ตอนเปลี่ยนโต๊ะ วันที่ และรายการค่าแรง
- เพิ่ม route guard และไม่โหลดข้อมูล manager สำหรับ cashier
- ใช้ cursor pagination สำหรับบิลย้อนหลังและรายจ่าย
- แยกการ refresh สินค้า/หมวดสินค้าออกจาก event ของ Order และรองรับ Realtime catalog
- ป้องกัน double submit ใน mutation สำคัญ
- แก้ Auth callback ไม่ให้เรียก Supabase แบบ async ค้างอยู่ภายใน `onAuthStateChange`
- เพิ่มทางออกจากระบบสำหรับบัญชี inactive หรือ profile ผิดปกติ
- สร้าง TypeScript types จาก schema จริงไว้ที่ `src/lib/database.types.ts` และผูกกับ Supabase client

### ฐานข้อมูลและความปลอดภัย

- จำกัดสิทธิ์ execute ของ RPC แยก `authenticated`, `service_role` และ helper ภายใน
- ทุก public mutation ตรวจ active user และ role ที่ฐานข้อมูล
- ปิด direct table write ของ ledger สำคัญและบังคับใช้ RPC ที่เป็น transaction
- เพิ่ม index สำหรับ cursor, foreign key และเงื่อนไขที่ RLS ใช้บ่อย
- ปรับ RLS ให้ประเมิน auth context ครั้งเดียวต่อ statement
- บังคับ Payment QR เป็น HTTPS และ Print Bridge ตรวจ host allowlist, timeout, ขนาดไฟล์ และขนาดรูป
- Print Bridge ใช้ `SUPABASE_SECRET_KEY`; key นี้ไม่อยู่ใน frontend หรือ Vercel environment ของ React
- งานพิมพ์ใช้ lease/claim token และส่งงานที่ไม่แน่นอนไป `review_required` แทนการพิมพ์ซ้ำอัตโนมัติ

## Migration ล่าสุด

- `017_security_and_checkout_consistency`: สิทธิ์ RPC, idempotency, checkout lock และ QR validation
- `018_rpc_privilege_followup`: ปิด inherited execute และจำกัด bridge/helper RPC
- `019_rls_and_foreign_key_indexes`: ปรับ RLS และเพิ่ม foreign-key indexes
- `020_create_employee_rpc`: แยก RPC สร้างพนักงานให้ type-safe
- `021_fix_atomic_preview_creation`: แก้การตรวจ Preview เดิมใน PL/pgSQL และคง atomic/idempotent behavior

## รายการจาก Supabase Advisor ที่ยอมรับได้

- ตาราง `employees` และ `expenses` เปิด RLS แต่ไม่มี policy โดยตั้งใจ เพราะ frontend เข้าผ่าน manager-only RPC และถูก revoke direct table access
- RPC สำหรับแอปใช้ `SECURITY DEFINER` โดยตั้งใจ แต่กำหนด `search_path`, ตรวจ active user/role และ grant เฉพาะผู้ใช้ที่จำเป็น
- Advisor อาจรายงาน index ที่ยังไม่ถูกใช้ เพราะฐานข้อมูลยังมีข้อมูลน้อย ควรประเมินใหม่หลัง Pilot ก่อนลบ index

## งานที่ต้องทำก่อน Production

1. Deploy frontend เวอร์ชันล่าสุดและตั้ง `VITE_SUPABASE_URL` กับ `VITE_SUPABASE_PUBLISHABLE_KEY`
2. อัปเดต Print Bridge บนคอมกลาง ตั้ง `SUPABASE_SECRET_KEY` และ Restart process/Task Scheduler
3. เปิด **Leaked Password Protection** ใน Supabase Auth Dashboard
4. ลบ bucket `expense-evidence` ที่ว่างและเลิกใช้แล้วผ่าน Storage Dashboard หรือ Storage API ห้ามลบจากตาราง `storage.objects` โดยตรง
5. ทดสอบ Xprinter จริง: ใบแบบร้าน, ใบแบบสนาม, QR, กระดาษยาว, เครื่องพิมพ์ offline และ Bridge หยุดกลางงาน
6. ทำ Pilot อย่างน้อยสองอุปกรณ์ โดยทดสอบเปิดโต๊ะเดียวกัน, กดเช็กบิลพร้อมกัน, เงินสด, เงินโอน, ส่วนลด, ยกเลิก, คืนเงิน และแก้ไขบิลเก่า
7. ตรวจยอดรายงานสิ้นวันเทียบเงินสด/เงินโอน/รายจ่ายจริงก่อนเปิดใช้งานเต็มรูปแบบ

## เกณฑ์ผ่าน Pilot

- ไม่มี Order, Payment, Receipt, Refund หรือค่าแรงซ้ำจากการกดซ้ำหรือใช้งานพร้อมกัน
- ยอด Preview ตรงกับยอดชำระและรายงาน
- ยอดขายของ Revision อยู่ในวันที่ขายเดิมและหัก Refund ถูกต้อง
- ค่าแรงและรายจ่ายที่ยกเลิกไม่ถูกรวมในยอด
- งานพิมพ์ที่ผลลัพธ์ไม่แน่นอนเข้าคิวตรวจสอบและไม่พิมพ์ซ้ำเอง
- cashier ไม่สามารถเรียก manager-only RPC หรืออ่านข้อมูลรายจ่ายได้
- manager สามารถตรวจ Audit trail และแก้สถานะงานพิมพ์ได้ครบ

## ข้อสรุป

ไม่พบบัคระดับ Critical หรือ High ที่ยังเปิดอยู่ในโค้ดและฐานข้อมูลปัจจุบัน งานที่เหลือเป็นการตั้งค่าความปลอดภัยใน Dashboard, ทำความสะอาด Storage ที่เลิกใช้, Deploy และทดสอบกับอุปกรณ์จริงก่อนรับรอง Production
