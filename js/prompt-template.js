// Prompt untuk AI (ChatGPT/Claude/Gemini) agar mengekstrak PDF lecture note ke format JSON upload.
export const EXTRACT_PROMPT = `Tolong ekstrak lecture notes yang saya lampirkan ini (semua halaman, baca
sampai selesai — jangan cuma outline/halaman awal) menjadi format JSON
berikut, sesuai isi materinya:

{
  "course": "<nama mata kuliah>",
  "week": <nomor minggu/LN, angka>,
  "title": "<judul LN, misal LN01>",
  "outline": ["<poin outline 1>", "<poin outline 2>", ...],
  "summary": "<ringkasan LENGKAP dari isi seluruh halaman (bukan cuma
    outline), bahasa sederhana, jelaskan dari dasar/fundamental. Kalau
    ada beberapa sub-topik besar, bagi summary per sub-topik supaya
    tetap lengkap dan tidak ada bagian yang kelewat>",
  "terms": [
    {
      "term": "<istilah teknis>",
      "definition": "<penjelasan simpel>",
      "image_url": "",
      "image_note": "<KOSONGKAN kalau istilah ini tidak ada gambar
        pendukung di PDF. Kalau ADA gambar/diagram terkait istilah ini
        (misal 'Gambar 1.1'), isi dengan: nomor gambar, halaman berapa
        di PDF, dan deskripsi singkat isi gambarnya — supaya nanti saya
        tahu gambar mana yang perlu di-crop dan diupload>"
    }
  ],
  "quiz": [
    {
      "question": "<pertanyaan>",
      "options": ["<opsi A>", "<opsi B>", "<opsi C>", "<opsi D>"],
      "answer": "<opsi yang benar, sama persis teksnya dengan salah satu options>"
    }
  ]
}

KETENTUAN:
- Baca dan proses SELURUH halaman PDF, jangan berhenti di outline atau
  beberapa halaman awal saja.
- Summary harus mencakup semua sub-topik/section yang ada di outline,
  masing-masing dijelaskan (bukan cuma disebutkan judulnya).
- Kumpulkan semua istilah teknis penting yang muncul di seluruh
  halaman, bukan cuma dari bagian awal.
- Untuk setiap istilah yang di PDF ada gambar/diagram pendukungnya,
  isi image_note dengan nomor gambar + halaman + deskripsi singkat.
  Field image_url selalu dikosongkan (akan diisi manual nanti lewat
  halaman upload).
- Buat TEPAT 10 soal quiz, sebar meratanya ke semua sub-topik di
  outline (jangan numpuk di 1-2 topik saja).
- Output HARUS JSON valid, tanpa teks tambahan/markdown/penjelasan di
  luar JSON, biar bisa langsung saya paste ke halaman upload.`;
