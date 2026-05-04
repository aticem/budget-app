# Budget App — Mimari ve Teknoloji Notu

Bu doküman, projenin nasıl çalıştığını ve hangi teknolojileri kullandığını anlatır. Tek bir Next.js uygulaması; hem frontend hem backend aynı kod tabanında.

---

## Genel mimari (tek satırda)

**Next.js 16 (App Router) + React 19 + Tailwind v4 + Google Gemini API + tarayıcı `localStorage`**

- Frontend: React (client component), Tailwind ile stillenmiş tek sayfa.
- Backend: Aynı projede bir Next.js Route Handler (`/api/parse`) — kullanıcı metnini Gemini'a iletip yapılandırılmış JSON döndürür.
- Veri: Kalıcı veritabanı yok. Tüm transaction kayıtları kullanıcının tarayıcısında `localStorage`'da tutulur.

---

## Klasör yapısı

```
budget-app/
├─ app/
│  ├─ layout.tsx          # Root layout, metadata, fontlar
│  ├─ page.tsx            # ✦ Tek sayfa: tüm UI, state, modal'lar burada
│  ├─ globals.css         # ✦ Tema (teal arka plan, surface kartları, gold buton, ink-input)
│  └─ api/
│     └─ parse/
│        └─ route.ts      # ✦ Backend endpoint — Gemini çağrısı
├─ lib/
│  └─ categories.ts       # ✦ Default kategori listesi + renk haritaları (chip / bar)
├─ public/
│  └─ mascot.png          # Başlık yanındaki maymun görseli
├─ .env.local             # GEMINI_API_KEY (gitignore'da)
├─ .env.local.example     # Örnek env dosyası
├─ package.json           # `npm run dev` Windows'ta tarayıcıyı da açar
└─ tsconfig.json          # `@/*` → projenin kökü
```

---

## Frontend

**Teknolojiler**

| Katman | Ne kullanılıyor | Notlar |
|---|---|---|
| Framework | **Next.js 16.2.4** App Router | `app/` dizini, Server + Client Components |
| UI library | **React 19.2.4** | `useState`, `useMemo`, `useEffect` |
| Dil | **TypeScript 5** | `tsconfig.json` strict |
| Styling | **Tailwind CSS v4** | `@import "tailwindcss"` + custom CSS sınıfları (`surface`, `surface-strong`, `gold`, `ink-input`) |
| Font | `next/font/google` (Geist Sans / Geist Mono) | `layout.tsx`'te yüklenir |

**Önemli dosya: `app/page.tsx`**

`"use client"` direktifiyle başlar — tüm sayfa client component.

İçindeki ana parçalar:

- **State**: `txs` (transaction listesi), `text` (input), `date`, `sortMode`, `catSortMode`, `openCategory`, `openDay`, `showCalendar`, `showAllTx`, `showAllCat`, `calMonth`.
- **Persistence**: İki `useEffect` — biri açılışta `localStorage` okur, diğeri her değişiklikte yazar (`STORAGE_KEY = "budget-app:transactions"`).
- **Türetilen veriler** (`useMemo`):
  - `sortedTxs` — Transactions listesi sıralı.
  - `dayTotals` — `Map<YYYY-MM-DD, {expense, income}>`, takvim hücreleri ve günlük modal için.
  - `byCategory` — Her kategori için expense/income/total + en eski/en yeni tarih.
  - `knownCategories` — Default + kullanıcının doğal dilden ürettiği kategoriler (LLM'e gönderilir).
- **Submit handler** (`submit`): metni `/api/parse`'a POST eder, dönen JSON'dan yeni transaction yaratır, listeye ekler.
- **Bileşenler** (aynı dosyada):
  - `Card` — Balance/Income/Expense özet kartları (`surface-strong`).
  - `MoneyCounter` — Maymun görseli.
  - `CalendarWidget` — Sağ üstte küçük platinum-stil tarih chip'i.
  - `Calendar` — Tam aylık grid (modal içinde açılır).
  - `SortBtn` — Sıralama chip'i (aktifken altın).
  - `DayModal` — Tek bir güne ait işlemler.
  - `CategoryModal` — Tek bir kategorinin işlemleri + tutar bar'ı.

**Tema (`app/globals.css`)**

- `body::before` → `position: fixed`, 4 büyük yumuşak yeşil radial blob + altın highlight, `filter: blur(140px)` — bulanık doğal yeşil arka plan hissi.
- `.surface` → kutular için solid teal + üst highlight + alt iç gölge + 2 katmanlı dış drop shadow → buton-yüzeyi 3D.
- `.surface-strong` → daha açık teal + altın hairline kenarlık → premium kart (Visa Platinum havası).
- `.gold` → Add butonu ve aktif sıralama chip'i için gradient altın.
- `.ink-input` → Tarih input ve textarea için koyu transparan + altın focus ring.

---

## Backend

Backend, ayrı bir sunucu **değil** — Next.js'in kendi Route Handler'ı. Aynı `npm run dev` süreci hem frontend hem API'yi serve eder.

**Tek endpoint: `POST /api/parse`** — `app/api/parse/route.ts`

| Özellik | Detay |
|---|---|
| Runtime | `nodejs` (Edge değil) |
| Yöntem | `POST` |
| Request body | `{ text: string, knownCategories?: string[] }` |
| Response | `{ description, amount, type, category, isNewCategory }` |
| Hatalar | 400 (boş metin / fiyat okunamadı), 500 (env eksik), 502 (Gemini hatası) |

**Akış:**
1. Body'den `text` ve `knownCategories` çıkarılır.
2. `GEMINI_API_KEY` env'den okunur.
3. Sistem prompt'u (TR + EN örnekler, kategori ipuçları, "income → daima `Income` kategorisi", "expense'te yeni kategori uydurabilirsin" kuralları) hazırlanır.
4. Gemini `generateContent` REST endpoint'ine `responseSchema` (structured output) ile çağrı atılır → JSON garantisi.
5. Sonuç doğrulanır (amount > 0, type expense/income, category trim/30 char), `isNewCategory` flag'i set edilir, JSON döner.

**Kullanılan harici servis**

| Servis | Model | Neden |
|---|---|---|
| **Google Gemini** (Generative Language API) | `gemini-2.5-flash-lite` (env'den override edilebilir) | En ucuz + structured output destekliyor + TR/EN doğal dilde iyi |

> SDK kullanılmıyor; doğrudan `fetch` ile REST çağrısı. Bu sayede `package.json`'da ekstra dependency yok.

---

## Veri katmanı

**Veritabanı yok.** Tüm transaction'lar tarayıcının `localStorage`'ında saklanır:

- Anahtar: `budget-app:transactions`
- Format: `Tx[]` (`{ id, description, amount, type, category, date }`)
- Migrasyon: Açılışta her tx için `category` boşsa `"Other"` yazılır (geri uyumluluk için).

Sonuç: Veri tarayıcıya bağlı. Farklı bir cihazdan aynı veriye ulaşılmaz, browser cache temizlenirse silinir.

---

## Çalıştırma

```bash
# bir kerelik kurulum
cd budget-app
echo "GEMINI_API_KEY=..." > .env.local

# her seferinde
npm run dev
```

`npm run dev` script'i Windows'ta `next dev & start http://localhost:3000` çalıştırır → dev server başlar ve tarayıcı otomatik açılır.

---

## Bağımlılıklar (`package.json`)

**dependencies**
- `next@16.2.4`
- `react@19.2.4`
- `react-dom@19.2.4`

**devDependencies**
- `typescript`, `@types/*`
- `tailwindcss@^4`, `@tailwindcss/postcss`
- `eslint`, `eslint-config-next`

**LLM SDK eklenmedi** — Gemini'a doğrudan `fetch` ile gidiliyor.

---

## Şu an çalışan özellikler (özet)

- Doğal dil girişi (TR + EN) → Gemini parse → otomatik kategori
- Yeni kategori isteği prompt içinden ("...put in Gifts category") veya LLM'in kendi uydurması
- Income → her zaman `Income` kategorisi
- Tarih seçici (varsayılan bugün, ileri/geri serbest)
- Sıralama: Transactions ve By Category bölümlerinde bağımsız (Newest/Oldest/Highest/Lowest)
- "+ N more" / "Show less" — her iki listede ilk 5
- Mini takvim widget'ı (sağ üst) → tıkla → tam aylık takvim modal'ı → güne tıkla → o günün işlemleri
- Kategoriye tıkla → o kategorinin tüm işlemleri (bar grafiği + tarihler)
- LCW kasası tarzı maymun mascot başlık solunda
- Premium teal tema: blurlu yeşil zemin, 3D buton-yüzeyi kartlar, altın aksanlar

---

## Bilinen sınırlamalar / not edilecekler

- Veri sadece localStorage'da — kalıcı backend yok.
- Gemini API key client'a sızdırılmıyor (route handler sunucuda çalışıyor) — production'a deploy edilirken aynı şekilde server-side kalmalı.
- Multi-currency desteği yok; her şey USD.
- `.env.local` Vercel/Netlify gibi platforma deploy edilirken **environment variable** olarak ayrıca eklenmeli.
