# FORGET — Buxgalteriya Bazasi: Tahlil, Xatoliklarni Bartaraf Etish va Takomillashtirish Hujjati (ai.md)

Ushbu hujjat **FORGET** buxgalteriya dasturining arxitekturasi, ishlash prinsiplari, kod bazasini chuqur tahlil qilish jarayonida aniqlangan jiddiy buxgalteriya va texnik xatoliklar, ularni bartaraf etish bo'yicha amalga oshirilgan ishlar hamda tizimni qulaylashtirish yechimlarini to'liq qamrab oladi.

---

## 1. Dastur Haqida Umumiy Ma'lumot

**FORGET** — O'zbekiston Respublikasining amaldagi soliq va buxgalteriya qonunchiligiga to'liq moslashtirilgan, real vaqtda (realtime) sinxronlanuvchi ko'p tarmoqli buxgalteriya dasturi.

### Platformalar:
- **Desktop ilova:** Electron asosida (Windows uchun installer `.exe`).
- **Mobil ilova:** Android uchun moslashtirilgan APK (`FORGET-mobile.apk`).
- **Web ilova:** Vercel serverless va brauzer orqali foydalanish.

### Texnologik steki:
- **Foydalanuvchi interfeysi (Frontend):** Sof JavaScript (Vanilla JS), zamonaviy CSS3 (CSS Variables, Dark/Light temalar, Responsive dizayn), SVG ikonkalari.
- **Ma'lumotlar bazasi va Sinxronizatsiya:** Supabase (PostgreSQL 15+, Row Level Security — RLS, Realtime WebSocket).
- **Hujjatlar bilan ishlash:** SheetJS (`xlsx.full.min.js`) — Excel formatidagi fakturalar, bank ko'chirmalari, oylik hisobotlar va spravochniklarni ikki tomonlama import/eksport qilish.
- **Elektron raqamli imzo:** E-IMZO integratsiyasi (PKCS#7, challenge-response, Vercel serverless API).
- **Ko'p firmalik (Multi-tenant):** Bitta foydalanuvchi bir nechta korxona/firma hisobini bitta kabinetdan chiqmasdan boshqara oladi.

---

## 2. Dasturning Funksional Modullari

1. **Bosh sahifa (Dashboard):** Daromadlar, tannarx, sof foyda, to'lovlar holati, oylik trend grafiklari hamda diqqat talab qiladigan muammoli yozuvlar bildirishnomalari.
2. **Birlamchi hujjatlar:**
   - **Faktura kirim:** Yetkazib beruvchilardan olingan elektron hisobfakturalar (Didox, Soliq.uz importi, to'lov holati, QQS ajratilishi).
   - **Faktura chiqim:** Xaridorlarga chiqarilgan sotuv fakturalari, xomashyo kalkulyatsiyasi bilan bog'lanish va "yumshoq tasdiq" holati.
   - **Bank harakati:** Milliy valyutadagi hisobvaraqdan kirim va chiqim to'lovlari (Klient-Bank, ABS va "Biznes 24/7" ko'chirmalari importi).
   - **Kassa operatsiyalari (5010):** Naqd pul kirim (KO-1) va chiqim (KO-2) orderlari, korrespondensiya schyotlari, rasmiy Kassa kitobi (KO-4), A4 bosma shakllari hamda F1 Balans va Sverka integratsiyasi.
   - **Ish haqi:** Xodimlarga hisoblangan oylik ish haqlari, soliq imtiyozlari, JShDS (NDFL), INPS (shaxsiy pensiya badali) va Ijtimoiy soliq hisobi.
3. **Ombor va Ishlab chiqarish:**
   - **Ombor:** FIFO (First-In, First-Out) usulida xomashyo va tovarlar qoldig'i, harakatlar daftari, o'rtacha va partiya narxlari.
   - **Ishlab chiqarish (Kalkulyatsiya):** Mahsulot retsepturasi (tarkibi), sotilgan mahsulotga sarflangan xomashyo tannarxini avtomatik hisoblash va zaxiradan yechish.
4. **Ma'lumotnomalar (Spravochniklar):**
   - **Kontragentlar:** Hamkorlarning INN, nomi, bank rekvizitlari, boshlang'ich qarzdorligi, o'zaro takrorlangan yozuvlarni birlashtirish (merge).
   - **Asosiy vositalar:** Inventar raqami, boshlang'ich qiymati, eskirish (amortizatsiya) me'yori va qoldiq qiymatining avtomat hisobi.
5. **Moliyaviy va Soliq Hisobotlari:**
   - **F2 — Moliyaviy natijalar to'g'risida hisobot:** Sof tushum, mahsulot tannarxi, yalpi foyda, davr xarajatlari, foyda solig'i va sof foyda.
   - **QQS hisob-kitobi:** Chiqim fakturalar bo'yicha hisoblangan QQS, kirim fakturalar bo'yicha hisobga olinadigan QQS va byudjetga to'lanadigan farq.
   - **Foyda solig'i hisoboti:** Soliq solinadigan daromad, chegiriladigan xarajatlar, soliq imtiyozlari va stavka bo'yicha soliq summasi.
   - **Ish haqi hisoboti:** Soliq deklaratsiyasi shaklida xodimlar soni, hisoblangan mehnat haqi, NDFL, INPS va Ijtimoiy soliq yig'indisi.
   - **F1 — Buxgalteriya balansi:** Aktivlar (asosiy vositalar, tovar zaxiralari, debitorlik, kassa, bank) va Passivlar (ustav kapitali, taqsimlanmagan foyda, kreditorlik, uzoq majburiyatlar).
   - **Debitorlik va Kreditorlik muddati (Aging):** 30, 60, 90+ kundan ortiq to'lanmay qolgan muddati o'tgan qarzdorliklar nazorati.
   - **Solishtirma dalolatnoma (Акт сверки):** Har bir kontragent bo'yicha o'zaro hisob-kitoblarning to'liq harakati va saldosi.

---

## 3. Aniqlangan Xato va Kamchiliklar hamda Ularning Bartaraf Etilishi

Dastur kodini chuqur tahlil qilish va haqiqiy bank ko'chirmasi (`TurnoverOperationsInfoByDate.xlsx`) bilan testlash natijasida quyidagi **8 ta jiddiy xato va kamchilik** aniqlandi va to'liq tuzatildi:

### 1-Xatolik: Ish haqi hisob-kitobida INPSning ikki marta ushlab qolinishi (Kritik buxgalteriya xatosi)
- **Muammo:** `computeIshHaqiRow` funksiyasida xodimning qo'liga tegadigan sof ish haqi `sofIshHaqi = oylik - ndfl - inps;` tarzida hisoblanayotgan edi. 
- **Oqibati:** O'zbekiston Respublikasi Soliq Kodeksiga muvofiq, xodimdan ushlanadigan JShDS (NDFL) stavkasi 12% bo'lib, uning ichidan 0.1% INPS (Xalq bankidagi jamg'arib boriladigan pensiya hisobiga) ajratiladi, qolgan 11.9% byudjetga yo'naltiriladi. Dasturda esa INPS ham 12% NDFL ichida, ham alohida qo'shimcha ayirilib, xodim maoshidan ortiqcha ushlab qolinayotgan edi.
- **Yechim:** Formula to'g'rilandi:
  ```javascript
  const ndflByudjetga = ndfl - inps;
  const sofIshHaqi = oylik - ndfl; // INPS NDFL tarkibida, qayta ushlanmaydi
  ```

---

### 2-Xatolik: Fakturalar statusi normallashtirilmaganligi
- **Muammo:** Soliq organlari yoki Didox tizimidan import qilinganda bekor qilingan fakturalar turli ko'rinishda bo'lishi mumkin ("Отказ", "отказ", "  Отменён ", "Отклонен", "Отозван", "bekor qilingan", "rad etilgan"). Dasturda esa `isValidStatus` funksiyasi oddiy massiv tekshiruvi `!STATUS_INVALID.includes(status)` bo'lib, harflar registri, bosh-oxiridagi probellar yoki kirillcha `ё`/`е` harflari farqi sababli bekor qilingan fakturalarni amaldagi deb qabul qilgan.
- **Oqibati:** Bekor qilingan millionlab so'mlik fakturalar QQS, F1 balans, F2 daromadlari va kontragent qarzlariga asossiz qo'shilib ketgan.
- **Yechim:** `normStatus(s)` funksiyasi va `STATUS_INVALID_SET` to'plami joriy etildi. Matn tozalanishi, kichik harfga o'tkazilishi va `ё` harfi `е` ga keltirilishi orqali barcha bekor qilingan variantlar 100% filtrlanishi kafolatlandi.

---

### 3-Xatolik: F1 Balansda qarzdorliklarning o'tmish sanasiga bog'lanmaganligi
- **Muammo:** `computeTotals()` funksiyasida kreditorlik va debitorlik `asOfKirim.reduce((a, r) => isValidStatus(r.status) && !r.tolandi ? a + toNum(r.jamiSumma) : a, 0)` tarzida hisoblangan. Bu yerda `r.tolandi` joriy (bugungi) holatni bildiradi.
- **Oqibati:** Agar buxgalter yanvar oyi (31.01) balansini ko'rmoqchi bo'lsa, mart oyida to'langan yanvar fakturalarida `r.tolandi = true` bo'lgani sababli yanvar oyi balansi 0 qarz ko'rsatib, o'tmishdagi buxgalteriya balansini butunlay buzgan.
- **Yechim:** `tolanmaganQoldiqAsOf(type, asOfDate)` funksiyasi ishlab chiqildi. U tanlangan sana holatiga qadar bo'lgan bank to'lovlari va fakturalarni FIFO tartibida tekshirib, aynan o'sha san### 4-Xatolik: Bank ko'chirmalari ("Biznes 24/7" / TurnoverOperationsInfoByDate) importi va ko'p ustunli bank formatlari
- **Muammo:** Foydalanuvchi taqdim etgan haqiqiy `TurnoverOperationsInfoByDate.xlsx` faylida ustunlar alohida 15 ta ustunda joylashgan: `Дата`, `ИНН`, `Наименование корреспондента`, `Сумма дебет`, `Сумма кредит`, `№ документа`, `Назначение платежа`. Dasturdagi eski `tryParseAbsBankStatement` esa:
  1. Faqat birinchi 12-15 qator ichidan sarlavha qidirgan (zamonaviy bank ko'chirmalarida esa sarlavha qatori 9-30 oralig'ida bo'lishi mumkin).
  2. Faqat `Счет/ИНН/Наименование` bitta katakda bo'lgan eski formatni kutgan.
  3. Boshlang'ich qoldiq qatori "Остаток на начала периода" (shakli o'zgargan) yoki yonma-yon katakda bo'lsa tanimagan.
  4. Hujjat raqami bo'sh yoki "0" bo'lgan qatorlarda noto'g'ri dublikat deb hisoblab, to'lovlarni o'tkazib yuborgan.
  5. Minglik ajratgich vergullar (masalan "1,200,000" yoki "5,400,000.50") `toNum` funksiyasida "1.2" bo'lib xato o'qilgan.
  6. Bank xizmatlari va komissiyalari (naqd pul berish, foizlar, chek daftarchasi) oddiy kontragent sifatida tushib, xarajatga belgilanmagan.
  7. Import tugagandan so'ng `recomputeAllPaymentStatus()` chaqirilmagani sababli fakturalar to'lov holati sahifa yangilanmaguncha o'zgarmagan.
- **Yechim:** 
  1. Sarlavhani aniqlash chuqurligi 30 qatorgacha kengaytirildi (`Math.min(rows.length, 30)`).
  2. Ham zamonaviy ko'p ustunli ("Biznes 24/7", Biznesni Rivojlantirish Banki, Ipak Yo'li, Kapitalbank, Hamkorbank, Aloqabank, Markaziy Bank), ham eski ABS birlashgan ustun formatlari avtomatik taniladigan qilindi.
  3. Boshlang'ich qoldiq skaneri matn ichidagi hamda qo'shni kataklardagi summalarni aniqlaydigan qilindi.
  4. Kontragent nomidagi ortiqcha va qo'shaloq qo'shtirnoqlar (`""O`ZBEKISTON...""`) tozalandi.
  5. `toNum` funksiyasiga minglik ajratgichlar (`1,200,000` -> `1200000`) va kasr qismi to'g'ri ajratilishi qo'shildi.
  6. Bank komissiyalari va xizmatlari (`xizmat: true`) o'zbekcha (lotin/kirill) va ruscha kalit so'zlar bo'yicha avtomatik belgilanadigan qilindi.
  7. Hujjat raqami bo'lmagan holatda kontragent va to'lov maqsadini solishtiruvchi ishonchli dublikat nazorati o'rnatildi.
  8. Import yakunida `recomputeAllPaymentStatus()` va `updateNavBadges()` chaqirilib, fakturalarning to'lov holati darhol yangilanishi ta'minlandi.

---

### 5-Xatolik: FIFO tannarx hisobidagi samarasizlik va sekinlashuv
- **Muammo:** `buildFifoLedger(nomi)` har bir tovar so'ralganda butun `STORE.ombor` massivini filterlab saralagani sababli, omborda yuzlab tovarlar bo'lganda interfeys sekinlashib qotib qolardi.
- **Yechim:** `buildAllFifoLedgers()` va `buildFifoLedgerFromRows()` funksiyalari orqali ombor harakatlari bitta umumiy o'tishda ($O(N \log N)$) nomlar bo'yicha guruhlanib indekslanadigan qilindi. Kesh mexanizmi bilan dastur tezligi bir necha barobar oshirildi.

---

### 6-Xatolik: Solishtirma dalolatnoma (Sverka) da faqat tanlangan davr bilan cheklanib qolish
- **Muammo:** Kontragent bilan сверка qilganda buxgalter ko'pincha "hamkorlik boshlanganidan buyon butun tarixni ko'raylik" degan ehtiyojga duch keladi. Dasturda esa faqat yuqoridagi davr filtri bo'yicha cheklangan edi.
- **Yechim:** `computeKontragentLedger(inn, opts)` funksiyasiga `{ butunTarix: true }` opsiyasi qo'shildi hamda Sverka sahifasiga **"Davr bo'yicha"** va **"Butun tarix"** o'tish tugmalari (toggle switcher) kiritildi.

---

### 7-Xatolik: Jadvallardan kontragent tarixi (Sverka)ga to'g'ridan-to'g'ri o'tib bo'lmasligi va qator bosilmasligi
- **Muammo:** Buxgalter Faktura kirim, Faktura chiqim yoki Bank harakati jadvallarida qatorlarni ko'rib turganida, o'sha kontragentning сверка tarixini ko'rish uchun Kontragentlar sahifasiga o'tib, u yerdan qidirishga majbur edi. Shuningdek, Kontragentlar va Sverka jadvalidagi qatorlar ustiga bosilganda tarix ochilmas, alohida tugmacha qidirish kerak edi.
- **Yechim:**
  - `kontragentRowHtml(k)` va `sverkaRowHtml(r)` qatorlariga `cursor-pointer`, `kontragent-row` va `data-hist-inn` atributlari ulandi: endi qatorning istalgan katagi (nomi, INN, telefon, manzil) bosilganda to'g'ridan-to'g'ri shu kontragentning solishtirma dalolatnomasi (sverka) ochiladi.
  - Tahrirlash va O'chirish tugmalari bosilganda esa tarix ochilishi to'xtatilib (`stopPropagation`), ularning o'z amallari (modal oynalari) xatosiz ishlaydi.
  - Faktura kirim, Faktura chiqim va Bank harakati jadvallaridagi har bir satrga tezkor tarix (sverka) tugmasi qo'shildi.
  - Debitorlik va Kreditorlik muddati (Aging) jadvallarida ham kontragent qatori bosilganda to'g'ridan-to'g'ri tarix ochilishi ta'minlandi.
  - Yagona `bindKontragentHistoryDelegation()` hodisalar delegatsiyasi ulandi va sahifa yuklanishida faollashtirildi.

---

### 8-Xatolik: Global qidiruvda (Topbar Search) INN bo'yicha fakturalar topilmasligi
- **Muammo:** Topbar qidiruv maydonida `"Kontragent, hujjat, INN qidirish…"` deb yozilgan bo'lsa-da, fakturalar faqat nomi va hujjat raqami bo'yicha qidirilar, INN bo'yicha fakturalar chiqmas edi.
- **Yechim:** Qidiruv algoritmi INN bo'yicha ham faktura kirim, chiqim va bank yozuvlarini topadigan qilindi. Natijada kontragent bosilsa to'g'ridan-to'g'ri uning сверка sahifasiga yo'naltiriladi.

---

### 9-Kamchilik: Ishlab chiqarish va kalkulyatsiyada ko'p moddali tannarx, faktik sarf va tayyor mahsulot kirimining mavjud emasligi
- **Muammo:** 
  1. Ishlab chiqarish amalga oshirilganda faqat xomashyo hisobdan chiqarilar (`chiqim`), lekin tayyor mahsulot omborga kirim qilinmas edi (natijada sotuv fakturasi chiqarilganda omborda tayyor mahsulot qoldig'i 0 yoki manfiy bo'lib ko'rinardi).
  2. Kalkulyatsiya faqat xomashyo me'yori bo'yicha cheklanib, O'zbekiston VM-54 nizomi va BHMS 21 talablaridagi to'liq tannarx elementlari (bevosita ish haqi, 12% ijtimoiy soliq, elektr energiyasi, amortizatsiya va qaytariladigan chiqindilar/brak) inobatga olinmagan edi.
  3. Faktik sarfni tahrirlash imkoniyati yo'q edi (faqat qat'iy retseptura bo'yicha yechilar, amalda esa xomashyo ko'proq yoki kamroq ketishi mumkin).
  4. 1C ("Акт выпуска продукции", "Требование-накладная", "Калькуляционная карточка") va 1UZ andazasidagi rasmiy A4 bosma hujjat shakllari mavjud emas edi.
  5. Ishlab chiqarish yozuvi o'chirilganda faqat xomashyo chiqimi o'chirilishi nazarda tutilgan edi.
- **Yechim:**
  1. **Ko'p moddali kalkulyatsiya dvigateli:** VM-54 nizomi bo'yicha 7 ta asosiy moddani hisoblaydi: Xomashyo, Ish haqi, 12% Ijtimoiy soliq (avtomatik hisob), Elektr/Suv, Amortizatsiya, Boshqa ustama xarajatlar va Qaytariladigan chiqindilar (tannarxdan chegiriladi).
  2. **Interaktiv 820px Ishlab chiqarish modali:** Mahsulot tanlanganda uning barcha xomashyolari me'yor bo'yicha to'ldiriladi; foydalanuvchi har bir satrning faktik sarfini tahrirlashi, yangi xomashyo qo'shishi, ombordagi mavjud qoldiq va kamomad xavfini qizil ogohlantirishda ko'rishi mumkin.
  3. **Tayyor mahsulotni avtomatik kirim qilish:** Ishlab chiqarish tasdiqlanganda nafaqat xomashyo sarflanadi, balki tayyor mahsulot hisoblangan birlik tannarxi bo'yicha omborga (`turi: "kirim"`, `hujjatRaqami: "IC-" + id`, 2810 hisobvarag'i) kirim qilinadi.
  4. **Rasmiy A4 bosma shakllari:**
     - **Ishlab chiqarish dalolatnomasi (Акт выпуска готовой продукции):** Me'yor va fakt taqqoslanishi, og'ish (farq), moddalar tarkibi, foyda marjasi, QQSli/QQSsiz sotish narxi, komissiya a'zolari (Sex boshlig'i, Bosh texnolog, Moddiy javobgar shaxs, Bosh buxgalter) va Korxona rahbari tasdiqlash rekvizitlari.
     - **Mahsulot kalkulyatsiya varag'i (Калькуляция себестоимости):** 7 ta modda bo'yicha batafsil hisob-kitob, har bir moddaning tannarxdagi foiz ulushi (%) va reja-sotish narxi.
  5. **Simmetrik kaskadli o'chirish:** Ishlab chiqarish yozuvi o'chirilganda, unga bog'liq bo'lgan barcha xomashyo chiqimlari va tayyor mahsulot kirimi bir vaqtning o'zida atomik o'chiriladi.

---

### 10-Kamchilik: Ombordagi mahsulotni qayta ishlash va konvertatsiya qilish (modifikatsiya) mexanizmining mavjud emasligi
- **Muammo:** 
  1. Ombordagi bir turdagi mahsulot yoki xomashyoni (masalan, go'sht, yog'och taxta, qadoqlanmagan shakar) qayta ishlab boshqa turdagi mahsulot yoki yangi xomashyoga (qiyma, silliqlangan taxta, qadoqlangan shakar) aylantirish operatsiyasi mavjud emas edi.
  2. Buxgalter ombordagi tovarlarni o'lchov birligi va qoldig'i bilan qulay ko'rib tanlay olmas, sarflangan tovar tannarxining yangi mahsulotga o'tishini qo'lda hisoblashga majbur edi.
  3. 1C ("Акт переработки / комплектации") andazasidagi qayta ishlash rasmiy dalolatnomasi yo'q edi.
- **Yechim:**
  1. **2 Bosqichli Interaktiv Wizard:**
     - **1-Qadam:** Ombordagi barcha tovarlar o'lchov birligi (`kg`, `dona`, `metr`, va h.k.), mavjud qoldig'i, birlik narxi va zaxira qiymati bilan ko'rsatiladi. Foydalanuvchi qidirib tanlaydi va qayta ishlanadigan miqdorni belgilaydi.
     - **2-Qadam:** Chiqadigan yangi tovar turi (tayyor mahsulot 2810 yoki xomashyo 1010/2110), yangi nomi, o'lchov birligi, olingan miqdori, texnologik yo'qotish (brak/chiqindi) foizi, qo'shimcha xarajatlar va yangi hisoblangan birlik tannarxi avtomatik shakllanadi.
  2. **Yagona QI-... buxgalteriya zanjiri:** Manba tovar uchun `chiqim`, yangi mahsulot uchun `kirim` va agar bo'lsa qaytariladigan chiqindi uchun `kirim` yozuvlari avtomatik yaratilib, FIFO saldolari yangilanadi.
  3. **Rasmiy A4 Bosma Dalolatnoma:** Korxona rahbari tasdiqlovchi shtampi, manba tovar chiqimi, yangi mahsulot kirimi, yo'qotish balansi va komissiya a'zolari imzolari bilan to'liq shakllanadi.
  4. **Kaskadli o'chirish himoyasi:** `QI-...` hujjati o'chirilganda bog'langan barcha chiqim va kirim harakatlari xavfsiz va toza o'chiriladi.

---

### 11-Kamchilik: Kassa operatsiyalari (5010) va rasmiy KO-1, KO-2, KO-4 kassa shakllarining mavjud emasligi
- **Muammo:** 
  1. O'zbekiston BHMS 21 standarti bo'yicha 5010 "Milliy valyutadagi kassa" hisobvarag'i alohida yuritilmagan, barcha naqd pul operatsiyalari hisobga olinmagan yoki faqat F1 sozlamalaridagi statik qoldiq orqali ko'rsatilar edi.
  2. Naqd pul qabul qilish (KO-1 Kirim kassa orderi va kvitansiyasi) hamda naqd pul berish (KO-2 Chiqim kassa orderi, pasport/ishonchnoma ma'lumotlari) rasmiy buxgalteriya shakllari yo'q edi.
  3. Buxgalteriyaning eng muhim talablaridan biri bo'lgan kunlik Kassa kitobi (KO-4 Kassa daftari) hamda kassa saldosining manfiy bo'lib ketishini oldini oluvchi nazorat mexanizmi mavjud emas edi.
  4. Naqd to'lovlar Kontragentlar solishtirma dalolatnomasi (Sverka) va F1 Buxgalteriya balansining "Pul mablag'lari" satriga dinamik ta'sir ko'rsatmas edi.
- **Yechim:**
  1. **BHMS 21 asosidagi Kassa (5010) to'liq moduli:**
     - `kassa` jadvali yaratildi (`id`, `firma_id`, `sana`, `hujjat_raqami`, `turi` ('kirim'/'chiqim'), `schyot`, `summa`, `tavsif`, `kimdan_kimga`, `kontragent`, `kontragent_inn`, `hujjat_asosi`, `pasport`, `fayl_id`). RLS, Realtime va Audit log to'liq ulandi.
     - KO-1 (Kirim kassa orderi) va KO-2 (Chiqim kassa orderi) yaratish uchun interaktiv modal darcha ishlab chiqildi. Standart korrespondent schyotlar (4010, 5110, 4210, 4610, 6710, 6010, 9420) va kontragent avtomatik to'ldirish imkoniyati kiritildi.
     - Chiqim kiritilganda kassa qoldig'i yetarli bo'lmasa qizil xavf ogohlantirishi beruvchi himoya o'rnatildi.
  2. **Rasmiy A4 Bosma Shakllari:**
     - **KO-1 (Kirim kassa orderi va Kvitansiya):** A4 albom formatida, qirqib olinadigan kvitansiya qismi, hisob raqamlari, o'zbek tilida so'z bilan yozilgan summa (`summaSozBilan` funksiyasi — masalan, "Yuz ming so'm 00 tiyin"), Bosh buxgalter va Kassir rekvizitlari bilan.
     - **KO-2 (Chiqim kassa orderi):** A4 kitob shaklida, pulni olgan shaxsning shaxsini tasdiqlovchi hujjati (pasport seriyasi, raqami, berilgan sanasi va kim tomonidan berilganligi) hamda olingan summa va imzo satri bilan.
     - **KO-4 (Kassa kitobi):** Tanlangan kun bo'yicha kun boshiga qoldiq, kunlik barcha KO-1 va KO-2 ro'yxati, kunlik jami aylanma va kun oxiriga qoldiq aks etgan rasmiy hisobot.
  3. **Moliyaviy integratsiya va Excel ayirboshlash:**
     - **F1 Buxgalteriya balansi:** Pul mablag'lari endi `Bank qoldig'i + Kassa qoldig'i` formulasi orqali dinamik hisoblanadi (eski ma'lumotlar bilan 100% orqaga muvofiqlik saqlangan).
     - **Solishtirma dalolatnoma (Sverka):** Kontragentga naqd pul to'langanda (KO-2) debetiga, mijozdan naqd pul tushganda (KO-1) kreditiga to'g'ri bog'lanib, qarz qoldig'ini real vaqtda to'g'rilaydi.
     - Kassa operatsiyalarini SheetJS orqali Excel formatida import va eksport qilish funksiyasi qo'shildi.

---

### 13-Kamchilik: 1C:Korxona va 1UZ bilan ikki tomonlama sinxronizatsiya (1CClientBank, CommerceML 2.0, EnterpriseData JSON) yo'qligi
- **Muammo:** 
  1. O'zbekistondagi ko'plab korxonalar asosiy hisob-kitobni yoki uning bir qismini 1C:Korxona (8.2 / 8.3) yoki 1UZ dasturlarida yuritadi. Dasturda esa 1C bilan to'g'ridan-to'g'ri ayirboshlash mexanizmi yo'q edi.
  2. Bank tizimlari bilan ishlashda keng tarqalgan `1CClientBankExchange` (v1.02 / v1.03) matnli formatidagi to'lov topshiriqnomalari va ko'chirmalarni eksport/import qilish imkoniyati mavjud emas edi.
  3. Tovar va xizmatlar katalogi, kontragentlar va hisobfakturalarni 1C standartidagi CommerceML 2.0 (`<КоммерческаяИнформация>`, `<Каталог>`, `<Контрагенты>`, `<Документы>`) XML shaklida uzatish ta'minlanmagan edi.
  4. Zamonaviy 1C 8.3 REST va OData servislari bilan integratsiya qiluvchi toza EnterpriseData JSON formati yo'q edi.
- **Yechim:**
  1. **Klient-Bank (1CClientBankExchange v1.03) dvigateli:**
     - `generate1CClientBankExport(bankRows, opts)`: Barcha bank harakatlarini O'zbekiston banklari va 1C qabul qiladigan rasmiy `1CClientBankExchange` formatiga o'tkazadi. `СекцияРасчСчет`, `СекцияДокумент=Платежное поручение`, `ПлательщикИНН`, `ПолучательИНН`, to'lov maqsadi va sanalar to'liq shakllanadi.
     - `parse1CClientBankExchange(content)`: Bankdan yoki 1C dan olingan `kl_to_1c.txt` fayllarini o'qiydi. Boshlang'ich qoldiq, tushum, xarajat, hujjat raqamlari va bank komissiyalarini (`xizmat: true`) aniqlaydi.
     - Bank importi darchasiga `.txt` formatini qabul qilish va 1C Klient-Bank fayllarini drag & drop orqali darhol bazaga kiritish qo'shildi.
  2. **CommerceML 2.0 XML ayirboshlash dvigateli:**
     - `generateCommerceMLExport(opts)`: Tovar va mahsulotlar spravochnigi (`<Каталог>`), kontragentlar ro'yxati (`<Контрагенты>`) va barcha fakturalar/orderlar (`<Документы>`) ni xalqaro va 1C standartidagi XML shaklida eksport qiladi.
     - `parseCommerceML(xmlString)`: 1C dan eksport qilingan XML fayllardan tovarlar, kontragentlar va fakturalarni katalog bo'yicha ajratib, dublikatlarsiz FORGET bazasiga import qiladi.
  3. **EnterpriseData JSON ayirboshlash:**
     - `generate1CEnterpriseJson(opts)` va `parse1CEnterpriseJson(data)`: 1C 8.3 REST API yoki tashqi ma'lumotlar almashinuvi uchun qulay, ixcham va to'liq JSON sxemasi.
  4. **Yagona 1C Ayirboshlash Modali (`open1CExchangeModal`):**
     - Bank harakati jadvalida **"1C Ayirboshlash"** tugmasi va Sozlamalarning "Integratsiyalar" bo'limida maxsus 1C boshqaruv paneli joylashtirildi.
     - 3 ta bo'lim: Klient-Bank (1CClientBank), CommerceML 2.0 (XML) va EnterpriseData (JSON). Har birida eksport va import tugmalari, sana filtrlari hamda drag & drop yuklash maydoni mavjud.

---

### 14-Kamchilik: Korxona bazasini to'liq va avtomatik zaxiralash (Backup) tizimining yo'qligi
- **Muammo:** 
  1. Dasturda ma'lumotlarni faqat alohida-alohida sahifalardan (masalan, faqat fakturalar yoki faqat ombor) Excelga chiqarish mumkin edi. Butun buxgalteriya bazasini bitta faylga to'liq arxivlash (backup) imkoni yo'q edi.
  2. Foydalanuvchi ma'lumotlarni uzoq vaqt zaxiralamay yursa, qattiq disk nosozligi, operatsion tizim yangilanishi yoki xodim xatosi tufayli ma'lumotlar yo'qolish xavfi mavjud bo'lganida dastur hech qanday ogohlantirish bermas edi.
- **Yechim:**
  1. **11 ta varaqli to'liq Excel zaxira kitobi (`exportFullBackupXlsx`):**
     - Bitta `.xlsx` faylda buxgalteriyaning barcha 11 ta asosiy bo'limi alohida varaqlar (worksheets) sifatida shakllantiriladi:
       1. `Sozlamalar` — Korxona nomi, STIR/INN, hisob raqami, MFO, kassa qoldiqlari.
       2. `Kirim` — Barcha kiruvchi hisobfakturalar va to'lov holatlari.
       3. `Chiqim` — Barcha chiquvchi hisobfakturalar va xaridorlar ro'yxati.
       4. `Bank` — Barcha bank aylanmalari, hisob raqamlar va to'lov maqsadlari.
       5. `Kassa` — 5010 kassa kirim va chiqim orderlari, javobgar shaxslar.
       6. `Ombor` — Tovarlar, xomashyolar, narxlar va partiya harakatlari.
       7. `Kontragentlar` — Hamkorlar rekvizitlari, INN, telefon va boshlang'ich qoldiqlar.
       8. `Ishlab_chiqarish` — Barcha IC hujjatlari va tayyor mahsulot hisobotlari.
       9. `Qayta_ishlash` — Qayta ishlash (QI) aktlari, sarf va kirim qilingan yangi mahsulotlar.
       10. `Ish_haqi` — Xodimlar oyligi, NDFL, INPS va ijtimoiy soliq hisoblari.
       11. `Asosiy_vositalar` — Inventar raqamlari, eskirish me'yori va qoldiq qiymatlari.
     - Fayl nomi `FORGET_Zaxira_YYYY-MM-DD.xlsx` ko'rinishida avtomatik belgilanadi va oxirgi zaxira vaqti eslab qolinadi.
  2. **To'liq JSON Snapshot (`exportFullBackupJson`):**
     - Dasturning butun holatini (metadata, korxona sozlamalari, barcha massivlar) versiyalangan (v2.0) JSON formatida bir zumda saqlab olish.
  3. **Aqlli eslatish mexanizmi (`checkBackupReminder`):**
     - Agar korxona bazasi umuman zaxiralanmagan bo'lsa yoki oxirgi zaxiralashdan beri 7 kundan ortiq vaqt o'tgan bo'lsa, tizim buni avtomatik aniqlaydi.
     - **Dashboard ogohlantirish banneri (`.backup-alert-banner`):** Bosh sahifaning eng yuqori qismida xushmuomala ogohlantirish banneri chiqadi va 1 ta bosish orqali to'liq 11 varaqli Excel backupni yuklab olish tugmasi taqdim etiladi.
     - Sozlamalarning "Ma'lumotlar" bo'limida oxirgi zaxira sanasi va "Baza to'liq zaxirada" yoki "Zaxiralash talab etiladi" statusli nishonchasi (badge) aks etadi.

---

### 15-Kamchilik: Ko'p valyutali hisob (5210), Markaziy Bank (CBU) kursi integratsiyasi va BHMS 22 kurs farqlari (9540/9640)
- **Muammo:** 
  1. O'zbekiston korxonalarining aksariyati xorijiy valyutada (USD, EUR, RUB) import, eksport yoki valyuta hisobvarag'i operatsiyalarini amalga oshiradi. Dasturda esa barcha operatsiyalar faqat 5110 (Milliy valyuta) hisobida yuritilar, alohida 5210 (Mamlakat ichidagi valyuta hisobvaraqlari) mavjud emas edi.
  2. Buxgalter har kuni yoki har operatsiyada Markaziy Bank kursini qo'lda qidirib, kalkulyatorda so'mga ko'paytirib yozishga majbur edi.
  3. O'zbekiston Respublikasi BHMS 22 ("Xorijiy valyutada ifodalangan aktivlar va majburiyatlarning hisobi") talablariga ko'ra, har hisobot davri oxirida valyuta qoldiqlari Markaziy Bankning rasmiy kursi bo'yicha majburiy qayta baholanishi, ijobiy kurs farqi **9540** ("Valyutalar kurs farqidan daromadlar") hisobvarag'iga, salbiy kurs farqi esa **9640** ("Valyutalar kurs farqidan zararlar") hisobvarag'iga o'tkazilishi shart. Dasturda ushbu buxgalteriya zanjiri, qayta baholash dalolatnomasi va F2/F1 integratsiyasi mavjud emas edi.
- **Yechim:**
  1. **Markaziy Bank (CBU) rasmiy ochiq API integratsiyasi:**
     - `api/cbu.js` Vercel Serverless xavfsiz proksi yaratildi: O'zbekiston Markaziy Bankining rasmiy ochiq arxividan (`cbu.uz/uz/arkhiv-kursov-valyut/json/`) barcha valyutalar kurslarini oladi, 1 soatlik xotira keshiga ega va CORS cheklovlarisiz ishlaydi.
     - Offline rejim uchun zaxira fallback kurslari (USD: 12,850, EUR: 13,900, RUB: 140) va LocalStorage keshi kiritildi.
     - Dasturning yuqori panelida (Topbar) jonli valyuta vidjeti (`#topbarCurrencyWidget`) joylashtirildi: USD, EUR, RUB kurslari va o'zgarish farqlari (`▲ +` yashil, `▼ -` qizil) real vaqtda aks etadi. Bosilganda Markaziy Bankning to'liq kurslar ro'yxati va jonli Valyuta kalkulyatori ochiladi.
  2. **5110 va 5210 Hisobvaraqlari bo'yicha ko'p valyutali Bank harakati:**
     - Bank jadvalida 3 ta rejimli tab filtri o'rnatildi: **Barcha hisoblar**, **5110 So'm**, **5210 Valyuta**.
     - Valyutali operatsiya qo'shilganda (`+ Valyuta (5210)`): valyuta turi (USD, EUR, RUB, UZS), valyuta summasi, Markaziy Bank kursi va UZS ekvivalenti (`valyutaSumma * kurs`) avtomatik hisoblanadi.
     - Valyuta summasi yoki kursi o'zgarganda UZS ekvivalenti dinamik yangilanadi.
     - Bank boshlang'ich qoldig'i 5110 (UZS) va 5210 (Valyuta USD) bo'yicha alohida saqlanadi.
  3. **BHMS 22 bo'yicha Kurs Farqlari (9540/9640) Avtomatik Dvigateli:**
     - `computeKursFarqlari(asOfDate)`: Davr oxiriga nisbatan har bir valyuta (USD, EUR, RUB) bo'yicha valyuta qoldig'i, o'rtacha hisobga olish kursi, buxgalteriya qiymati, Markaziy Bankning joriy rasmiy kursi, qayta baholangan yangi qiymat va kurs farqini hisoblaydi.
     - Kurs farqi > 0 bo'lsa: `Dt 5210 - Kt 9540 (Daromad)` — F2 da sof foydani va F1 da passiv jamg'arilgan foydani oshiradi.
     - Kurs farqi < 0 bo'lsa: `Dt 9640 - Kt 5210 (Zarar)` — F2 da davr xarajatlariga qo'shiladi va foydani kamaytiradi.
     - **Rasmiy A4 Bosma Dalolatnoma (`printKursFarqiAct`):** Korxona rahbari tasdiq shtampi, hisobot sanasi, valyuta qoldiqlari, buxgalteriya va MB kurslari, qayta baholangan qiymat, buxgalteriya provodkalari hamda Bosh buxgalter va moddiy javobgar shaxs imzo bloklari bilan to'liq shakllanadi.
     - **F1 va F2 hisobotlariga to'liq integratsiya:** Bank yakuniy pul mablag'lari 5110 qoldig'i va 5210 qayta baholangan qoldig'i yig'indisi sifatida olinadi, Aktiv va Passiv balansi 100% mutanosib saqlanadi.

---

## 4. Foydalanuvchi Uchun Yaratilgan Yangi Qulayliklar (UX/UI)

1. **Tezkor Klaviatura Yorliqlari (Hotkeys):**
   - `Ctrl + K` (yoki `Cmd + K`): Istalgan sahifadan turib darhol global qidiruv maydoniga fokuslanish.
   - `Escape`: Ochilgan har qanday modal darchani (import, tahrirlash, o'chirish) yoki qidiruv ro'yxatini tezkor yopish.
2. **Interaktiv Kontragent Havolalari:**
   - Kontragentlar ro'yxatida satr ustiga sichqoncha borganda yorug' rangda aks etadi va bosilganda avtomatik сверка ochiladi.
   - Amallar (tahrirlash, o'chirish) tugmalari bosilganda esa chalg'itmasdan faqat o'z amali bajariladi.
3. **Sverka sahifasida Rejimlar Boshqaruvi:**
   - "Davr bo'yicha" — faqat filtrlangan sanalardagi aylanma va boshlang'ich saldo.
   - "Butun tarix" — dasturga kiritilgan birinchi kundan boshlab barcha bank va faktura harakatlari ro'yxati.
4. **Zamonaviy Bank Ko'chirmalari Mosligi:**
   - Endi buxgalter "Biznes 24/7" yoki istalgan O'zbekiston bankidan ko'chirib olingan `.xlsx` faylni hech qanday o'zgartirishsiz to'g'ridan-to'g'ri tizimga tashlashi mumkin.
5. **Mukammal Ishlab Chiqarish va Kalkulyatsiya boshqaruvi (1C/1UZ andazasi):**
   - Retseptura asosida avtomatik to'ldirish va real vaqtda ombor qoldig'i monitoringi.
   - Har bir ishlab chiqarish hujjati bo'yicha alohida **"Dalolatnoma"** va **"Kalkulyatsiya"** bosma tugmalari.
   - Saqlashdan oldin "Saqlash va Chop etish" tezkor amali.
6. **Ombordagi Mahsulotni Qayta Ishlash (Konvertatsiya) Boshqaruvi:**
   - Ombor qoldig'i, kirimi, chiqimi va ishlab chiqarish sahifalarida yagona "🔄 Qayta ishlash" tugmasi.
   - Har bir ijobiy qoldiqqa ega tovar satrida tezkor qayta ishlash tugmachasi.
   - Qayta ishlash dalolatnomasini istalgan paytda qayta chop etish (QI hujjatlari).
7. **Kassa (5010) operatsiyalari va KO-4 Kassa kitobi boshqaruvi:**
   - Birlamchi hujjatlar menyusida alohida "Kassa (5010)" bo'limi va real vaqt hisoblagichi.
   - Boshlang'ich qoldiq, davr kirimi, davr chiqimi va joriy kassa qoldig'i stat-kartalari.
   - Kunlik kassa kitobini bir marta bosish bilan A4 formatida shakllantirish va chop etish.
   - KO-1 va KO-2 hujjatlarini bir zumda rasmiy A4 andazasida chop qilish.
8. **Didox.uz / E-Faktura 1-klikda API Sinxronizatsiyasi:**
   - Birlamchi hisobfaktura jadvallarida bevosita "Didox API" tezkor tugmasi.
   - Sanalar va status bo'yicha saralash, jonli yuklanish ko'rsatkichi va xavfsiz token boshqaruvi.
   - Sozlamalarda "Integratsiyalar" bo'limi va "Ulanishni tekshirish" (Ping) vositasi.
9. **1C:Korxona va Klient-Bank Ikki Tomonlama Ayirboshlash Paneli:**
   - Bank harakatlari sahifasida "1C Ayirboshlash" tugmasi, Sozlamalarda 1C boshqaruvi.
   - 1CClientBankExchange (`kl_to_1c.txt`), CommerceML 2.0 (`.xml`) va EnterpriseData (`.json`) formatlarida eksport va import qilish.
10. **Avtomatik Backup va 11-Varaqli Arxiv Tizimi:**
    - Bir bosishda butun bazaning 11 ta varaqdan iborat to'liq `.xlsx` kitobini yoki JSON snapshotini olish.
    - Oxirgi zaxiralashdan 7 kun o'tganda bosh sahifada avtomatik eslatuvchi banner va tezkor yuklab olish tugmasi.
11. **Ko'p Valyutali Hisob va Jonli Markaziy Bank (CBU) Vidjeti:**
    - Topbar qismida doimiy ko'rinib turuvchi USD, EUR, RUB kurslari va o'zgarish ko'rsatkichlari.
    - Bir bosishda interaktiv Valyuta kalkulyatori va tarixiy kurslar qidiruvi.
    - Bank harakatida 5110 (so'm) va 5210 (valyuta) operatsiyalarini alohida filtrlar bilan ko'rish.
    - BHMS 22 bo'yicha 9540/9640 kurs farqlarini bir zumda hisoblab, rasmiy A4 dalolatnomasini chop etish.

---

## 5. Avtotestlar va Sifat Kafolati

Tizimning barcha hisob-kitob, kontragent tarixi, ishlab chiqarish, qayta ishlash, bank importi, kassa operatsiyalari, Didox API integratsiyasi, 1C ayirboshlash, zaxiralash (backup) va ko'p valyutali CBU hisobi modullari avtomatik testlar to'plami bilan to'liq qamrab olindi:

1. `node test-hisobkitob.js` (31 ta sinov)
2. `node test-kontragent-tarixi.js` (15 ta sinov)
3. `node test-bank-import.js` (18 ta sinov)
4. `node test-ishlab-chiqarish.js` (6 ta sinov)
5. `node test-qayta-ishlash.js` (6 ta sinov)
6. `node test-kassa.js` (16 ta sinov)
7. `node test-didox-api.js` (10 ta sinov)
8. `node test-1c-exchange.js` (10 ta sinov)
9. `node test-backup-system.js` (7 ta sinov)
10. `node test-valyuta-cbu.js` (17 ta sinov)

**Jami 136 ta avtomat sinov 100% muvaffaqiyatli o'tdi:**

```
=== KO'P VALYUTALI HISOB VA CBU KURSLARI TEST SUITE ===
  ✓ 1. Rasmiy CBU JSON ob'ektini to'g'ri maydonlarga o'girishi kerak
  ✓ 2. Kutilmagan yoki buzilgan satrlarni (probellar, vergullar) xatosiz tozalashi kerak
  ✓ 3. Noto'g'ri yoki bo'sh ob'ekt kelsa null qaytarishi kerak
  ✓ 4. UZS uchun har doim 1 qaytarishi kerak
  ✓ 5. Keshda bo'lmaganda rasmiy fallback kurslarini (USD, EUR, RUB) berishi kerak
  ✓ 6. Keshda mavjud bo'lganda keshdagi joriy kursni berishi kerak
  ✓ 7. USD -> UZS konvertatsiyasi (500 USD @ 12,850 = 6,425,000 UZS)
  ✓ 8. UZS -> USD konvertatsiyasi (12,850,000 UZS @ 12,850 = 1,000 USD)
  ✓ 9. Cross-valyuta: USD -> EUR (13,900 / 12,850 nisbati bo'yicha)
  ✓ 10. Qo'lda kiritilgan maxsus kurs (Custom Rate) bilan to'g'ri hisoblashi kerak
  ✓ 11. 5210 bo'yicha valyuta summasi va kursi orqali UZS ekvivalenti to'g'ri chiqishi kerak
  ✓ 12. 5210 bo'yicha ko'p operatsiyali qoldiqni hisoblash
  ✓ 13. Valyuta kursi oshganda 9540 (Daromad) hosil bo'lishi va provodka to'g'ri shakllanishi kerak
  ✓ 14. Valyuta kursi tushganda 9640 (Zarar) hosil bo'lishi va provodka to'g'ri shakllanishi kerak
  ✓ 15. BANK_DB_MAP yangi valyuta maydonlarini (schyot, valyuta, valyuta_summa, kurs) o'z ichiga olishi kerak
  ✓ 16. SETTINGS_DB_MAP valyuta_opening_balance maydonini o'z ichiga olishi kerak
  ✓ 17. Valyuta kiritilmaganda ijobiy va salbiy kurs farqlari 0 bo'lib qolishi kerak

>>> BARCHA 10 TA TEST SUITE 100% MUVAFFAQ QILINDI! <<<
```

---

## 6. Kelgusi Rivojlantirish Rejasi (Roadmap)

1. [x] **Kassa operatsiyalari (5010) moduli:** ✅ Bajarildi (BHMS 21 hisobi, KO-1 Kirim orderi, KO-2 Chiqim orderi, KO-4 Kassa kitobi, A4 bosma shakllari, F1 va Sverka integratsiyasi).
2. [x] **Didox / E-Faktura to'g'ridan-to'g'ri API integratsiyasi:** ✅ Bajarildi (Didox REST v1 & GNK E-faktura o'qish, api/didox.js serverless proksi, 1-klikda yuklab olish, Ombor va Kontragentlar avto-to'ldirilishi, 10 ta avtotest).
3. [x] **1C:Korxona bilan ikki tomonlama sinxronizatsiya:** ✅ Bajarildi (1CClientBankExchange v1.03 matnli bank ayirboshlash, CommerceML 2.0 XML katalog va hujjatlar, EnterpriseData JSON, 3-tabli interaktiv modal, 10 ta avtotest).
4. [x] **Avtomatik Backup tizimi:** ✅ Bajarildi (11 ta varaqli to'liq Excel kitobi, JSON snapshot, 7 kunlik tekshiruv, Dashboard ogohlantirish banneri va Sozlamalar integratsiyasi, 7 ta avtotest).
5. [x] **Ko'p valyutali hisob va Markaziy Bank (CBU) kursi integratsiyasi:** ✅ Bajarildi (5210 xorijiy valyuta hisobvarag'i, O'zbekiston Markaziy Banki ochiq API integratsiyasi, api/cbu.js serverless keshli proksi, Topbar valyuta vidjeti va kalkulyator modali, BHMS 22 bo'yicha 9540 Daromad / 9640 Zarar kurs farqlari dvigateli, A4 rasmiy qayta baholash dalolatnomasi, F1 va F2 hisobotlariga to'liq integratsiya, 17 ta avtotest).
6. [ ] **Xodimlar davomati va elektron Tabel (T-13 shakli):** Ish kunlari va soatlarini qayd qilish, kasallik varaqasi va ta'til pullari kalkulyatsiyasi.



