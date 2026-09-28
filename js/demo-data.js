const ts = (s) => ({ toDate: () => new Date(s) });

export const demoCourses = [
  {
    id: "algo", name: "Algoritma & Struktur Data",
    weeks: [
      {
        id: "w1", title: "Week 1 - Kompleksitas Algoritma", createdAt: ts("2026-09-01"),
        outline: ["Apa itu algoritma", "Notasi Big-O", "Best, average, worst case"],
        summary: "Kompleksitas algoritma mengukur berapa banyak sumber daya (waktu/memori) yang dibutuhkan seiring bertambahnya ukuran input.\n\nNotasi Big-O menggambarkan batas atas pertumbuhan, misalnya O(n) untuk linear search dan O(log n) untuk binary search.",
        terms: [
          { term: "Big-O", definition: "Notasi untuk batas atas laju pertumbuhan waktu/memori algoritma." },
          { term: "Binary Search", definition: "Pencarian pada data terurut dengan membagi dua ruang pencarian setiap langkah." },
        ],
        quiz: [
          { question: "Kompleksitas binary search adalah…", options: ["O(n)", "O(log n)", "O(n²)", "O(1)"], answer: "O(log n)" },
          { question: "Big-O menggambarkan…", options: ["Batas bawah", "Batas atas", "Rata-rata", "Memori saja"], answer: "B" },
        ],
      },
      {
        id: "w2", title: "Week 2 - Linked List", createdAt: ts("2026-09-08"),
        outline: ["Node & pointer", "Singly vs doubly linked list"],
        summary: "Linked list menyimpan elemen dalam node yang saling terhubung lewat pointer, sehingga insert/delete di awal list bernilai O(1).",
        terms: [{ term: "Node", definition: "Unit data yang berisi nilai dan pointer ke node berikutnya." }],
        quiz: [{ question: "Insert di head singly linked list bernilai…", options: ["O(1)", "O(n)", "O(log n)"], answer: 0 }],
      },
    ],
  },
  {
    id: "uiux", name: "Desain UI/UX", status: "done",
    weeks: [
      {
        id: "w1", title: "Week 1 - Tipografi dalam UX", createdAt: ts("2026-09-03"),
        outline: ["Hierarki visual", "Keterbacaan"],
        summary: "Tipografi yang baik membantu pengguna memindai informasi dengan cepat melalui hierarki ukuran, ketebalan, dan jarak.",
        terms: [{ term: "Leading", definition: "Jarak antar baris teks." }],
        quiz: [{ question: "Jarak antar baris disebut…", options: ["Kerning", "Leading", "Tracking"], answer: "Leading" }],
      },
    ],
  },
];

export const demoAllowed = {
  emails: ["teman@gmail.com"],
  domains: ["kampus.ac.id"],
};

// data demo untuk latihan ujian, bookmark, catatan, statistik
export const demoStore = { attempts: [], bookmarks: [], notes: [], days: [], srs: {} };
