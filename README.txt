MAKTAB TEST TIZIMI (onlayn) — SAYTGA JOYLASH
=============================================
Kerak bo'ladi: GitHub, Supabase va Vercel akkauntlari (hammasi bepul).

1. SUPABASE (ma'lumotlar bazasi)
   - supabase.com -> New project. Region: Europe (Frankfurt) — bizga eng yaqin.
   - Chapdagi "SQL Editor" -> schema.sql faylidagi hamma matnni qo'ying -> "Run".
   - "Project Settings" -> "API Keys" (yoki "API"):
       * Project URL ni nusxalang   (https://xxxx.supabase.co)
       * secret / service_role kalitni nusxalang
     DIQQAT: secret kalitni hech kimga bermang va kod ichiga yozmang!

2. GITHUB
   - Yangi repository oching va shu papkadagi hamma fayllarni yuklang
     (api, public, vercel.json, schema.sql, README.txt).

3. VERCEL (sayt)
   - vercel.com -> Add New -> Project -> GitHub repository ni tanlang.
   - "Environment Variables" bo'limiga 3 ta qiymat qo'shing:
       SUPABASE_URL    = 1-qadamdagi Project URL
       SUPABASE_KEY    = 1-qadamdagi secret kalit
       ADMIN_PASSWORD  = o'qituvchi paroli (kuchli parol tanlang!)
   - "Deploy" ni bosing. Bir daqiqadan so'ng sayt manzili chiqadi.

4. FOYDALANISH
   - O'qituvchi: login "admin", parol — ADMIN_PASSWORD.
     Parolni almashtirish: Vercel -> Settings -> Environment Variables -> keyin "Redeploy".
   - "Reyting" bo'limi: ochiq testlar bo'yicha jonli reyting, har 5 soniyada yangilanadi.
     "To'liq ekran" tugmasi bilan proyektorda ko'rsatish mumkin.
   - O'quvchilar: maktab kompyuterlarida sayt manzilini ochadi (zakladka qilib qo'ying),
     ID va 6 xonali parol bilan kiradi.

5. "UXLAB QOLMASLIK"
   - Supabase bepul loyihani 7 kun ishlatilmasa to'xtatadi. Buning oldini olish uchun
     Vercel har kuni /api/ping ni o'zi chaqiradi (vercel.json dagi "crons").
   - Agar baribir to'xtab qolsa: Supabase dashboard -> loyiha -> "Resume project".
     Ma'lumotlar yo'qolmaydi.

6. ZAXIRA NUSXA
   - Har chorakda "Natijalar" -> "Excel (CSV)" ni yuklab oling.
