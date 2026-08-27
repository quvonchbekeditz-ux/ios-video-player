# 🎬 iOS 18 Glass Video Player & File Explorer Pro

![Version](https://img.shields.io/badge/version-2.5.0-blue.svg)
![Python](https://img.shields.io/badge/backend-Python%203.10%2B%20%7C%20aiohttp-yellow.svg)
![Frontend](https://img.shields.io/badge/frontend-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20JS-orange.svg)
![Design](https://img.shields.io/badge/design-Apple%20iOS%2018%20%2F%20visionOS-purple.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Apple **iOS 18** va **visionOS** dizayn falsafasi asosida yaratilgan, yuqori unumdorlikka ega zamonaviy video pleyer hamda butun kompyuter tizimini (barcha qattiq va tashqi disklarni) qamrab oluvchi professional fayl menejeri.

---

## 🌟 Asosiy Imkoniyatlar & Xususiyatlar

### 1. 🗂️ Tizimli Fayl Menejeri (Full System File Explorer)
* **Barcha disklarni qo\'llab-quvvatlash**: C:\, D:\, E:\ va barcha ulangan tashqi USB xotiralar.
* **Tizim papkalariga tezkor kirish**: Desktop, Downloads, Videos, Documents.
* **Deep Video Scan**: Tanlangan jild va barcha ichki jildlardagi videolarni bir zumda skanerlab, bitta oynada ko\'rsatish.
* **Smart Thumbnail Generator**: OpenCV orqali videolardan avtomatik 4K/HD kadrlar olib keshlaydi.
* **Formatlar**: .mp4, .mkv, .webm, .mov, .avi, .m4v, .flv va boshqalar.

### 2. 📱 Apple iOS 18 & visionOS Interfeysi
* **Dynamic Island HUD**: Ovoz, yorqinlik, mavzu almashinuvi va bildirishnomalar uchun jonli orolcha.
* **Frosted Glassmorphism**: ackdrop-filter: blur(24px) va Ultra HD shaffoflik.
* **6 ta premium mavzu**:
  1. *iOS Dark Glass* (Klassik qorong\'u)
  2. *iOS Light Frosted* (Yorqin Cupertino)
  3. *OLED Pure Black* (Haqiqiy chuqur qora)
  4. *Midnight Nebula* (Kosmik binafsha)
  5. *Titanium Gold* (Apple Pro oltin)
  6. *Cyber Neon* (Futuristik yashil/ko\'k)

### 3. 🎥 Professional Video Dvigateli
* **HTTP 206 Partial Content**: Katta hajmdagi 4K/8K videolarni qotmasdan, qismlarga bo\'lib uzluksiz oqimli ijro etish (Byte-Range streaming).
* **Sensor & Sichqoncha Jestlari**:
  * Chap tomonni surish: Yorqinlikni sozlash
  * O\'ng tomonni surish: Ovoz balandligini sozlash
  * Ikki marta bosish: 10 soniya oldinga/orqaga sakrash
  * Sichqoncha g\'ildiragi: 50% dan 300% gacha optik masshtablash (Zoom)
* **Kadrba-kadr tahlil (Frame-by-frame)**: Aniq millisekundli tahlil.
* **A-B Takrorlash (Loop Repeat)**: Belgilangan vaqt oralig\'ini cheksiz takrorlash.
* **Smart Resume**: Oxirgi ko\'rilgan joyidan avtomatik davom ettirish.

### 4. 🎚️ Web Audio Studio & 10-Polosali Ekvalayzer
* **10-Polosali Ekvalayzer (32Hz – 16kHz)**.
* **300% Volume Boost**: Past ovozli videolarni Web Audio GainNode orqali 3 barobargacha kuchaytirish.
* **Audio Delay Sync**: Ovoz va tasvir mos kelmaganda -5.0s dan +5.0s gacha aniq sinxronizatsiya.

### 5. 💬 Subtitrlar Studiyasi & Jonli Transkript
* Video yonidagi .srt va .vtt fayllarni avtomatik o\'qish.
* **Interaktiv transkript**: Har bir jumlani bosish orqali aynan o\'sha sahnaga sakrash.

---

## 📂 Loyiha Strukturasi

`	ext
ios_video_player/
├── server.py              # Asinxron aiohttp backend (video streaming, disk API)
├── run.py                 # Ishga tushirish skripti
├── start.bat              # Windows uchun bir marta bosish orqali ishga tushirish fayli
├── static/                # Front-end fayllar (HTML, CSS, JS, ikonlar)
├── screenshots/           # Ilova skrinshotlari
└── README.md              # To\'liq hujjat
`

---

## 🚀 Ishga Tushirish

1. Talab qilinadigan kutubxonalarni o\'rnating:
   `ash
   pip install aiohttp opencv-python
   `
2. Loyihani ishga tushiring:
   `ash
   python server.py
   `
   yoki Windows-da start.bat fayliga bosing.
3. Brauzerda oching: http://localhost:8080

---

## 📄 Litsenziya

Ushbu loyiha [MIT Litsenziyasi](LICENSE) ostida chiqarilgan.
