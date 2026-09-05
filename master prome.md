# MASTER PROMPT — OPTIMASI & PENGEMBANGAN WEB GENERATOR FOTO/VIDEO

Saya memiliki sebuah website yang digunakan untuk membuat/generate foto dan video berdasarkan input nama.

Saya ingin Anda **memperbaiki dan mengembangkan website yang sudah ada**, bukan membuat ulang dari nol.

## ATURAN UTAMA

1. Pertahankan seluruh fitur yang sudah berjalan.
2. Jangan menghapus fitur lama kecuali memang diperlukan untuk memperbaiki bug.
3. Jangan mengubah struktur UI secara drastis.
4. Tingkatkan kualitas, performa, dan usability website.
5. Semua fitur baru harus terintegrasi dengan fitur lama.
6. Pastikan website tetap responsive untuk desktop.
7. Gunakan kode yang clean, modular, dan mudah dikembangkan.
8. Jangan menggunakan solusi yang menyebabkan browser menjadi terlalu berat.
9. Prioritaskan kualitas output hasil generate.
10. Sebelum melakukan perubahan besar, pahami terlebih dahulu struktur project dan fungsi setiap file.

---

# 1. OPTIMASI FITUR VIDEO

Perbaiki sistem pembuatan video agar hasilnya lebih optimal.

### Format output

Video hasil generate **WAJIB menggunakan format MP4**.

Gunakan codec yang kompatibel dengan browser dan perangkat umum, misalnya:

* Container: MP4
* Video codec: H.264
* Pastikan video dapat diputar di Chrome, Edge, Firefox, Android, dan perangkat umum.

### Optimasi kualitas

Video harus memiliki kualitas HD.

Target default:

* Resolution: minimal 1280 × 720
* Aspect ratio mengikuti template yang digunakan
* FPS: 30 FPS
* Bitrate disesuaikan agar kualitas tetap bagus tetapi ukuran file tidak berlebihan.

Jika template menggunakan resolusi berbeda, pertahankan aspect ratio agar tidak terjadi stretching.

### Optimasi proses rendering

Perbaiki proses rendering video supaya:

* tidak menyebabkan browser freeze;
* progress rendering terlihat jelas;
* pengguna dapat mengetahui persentase proses;
* proses generate tidak membuat UI menjadi tidak responsif;
* memory usage seminimal mungkin;
* file video yang dihasilkan tidak corrupt.

# 2. FORMAT FOTO

Foto hasil generate harus menggunakan:

**JPG**

Target:
* kualitas HD
* resolusi mengikuti template

# 3. PENINGKATAN KUALITAS FOTO

Tingkatkan kualitas output foto agar tidak blur atau pecah.

Pastikan:
* canvas menggunakan resolusi yang cukup tinggi;
* jangan melakukan scaling berkali-kali;
* gunakan high-DPI / devicePixelRatio jika relevan;

Jangan hanya memperbesar ukuran canvas tanpa memperhatikan kualitas rendering.


# 4. PERBESAR FONT

Semua teks yang ditampilkan pada hasil akhir harus dibuat lebih mudah dibaca.

Perbesar ukuran font untuk:

* Nama
* Nomor telepon
* antonny photoboth
* welcome
* smile 
* tombol start
* dan semua element font 

Namun jangan hard-code jika sistem template memungkinkan konfigurasi.

Nama harus lebih dominan daripada nomor telepon.

Contoh layout:

NAMA LENGKAP
08xxxxxxxxxx

Pastikan text memiliki:

* alignment yang baik;
* spacing yang cukup;
* tidak keluar dari frame;
* tidak bertabrakan dengan logo;
* tidak bertabrakan dengan elemen lain.

---

# 5. TAMBAHKAN NOMOR TELEPON

Saat user memasukkan nama, tambahkan field:

### Nama

`[________________]`

### Nomor Telepon

`[________________]`

Hasil akhir harus menampilkan:

```text
NAMA USER
08XXXXXXXXXX
```

Pastikan nomor telepon ikut masuk ke hasil export.

---

# 6. FORMAT NAMA FILE OUTPUT

Nama file hasil harus menggunakan nama + nomor telepon.

Untuk FOTO:

```text
NamaNomorTelepon.png
```

Contoh:

```text
BudiSantoso08123456789.png
```

Untuk VIDEO:

```text
NamaNomorTelepon.mp4
```

Contoh:

```text
BudiSantoso08123456789.mp4
```

Jika nama mengandung spasi atau karakter yang tidak valid untuk filename, sanitasi nama tersebut.

Contoh:

```text
Budi Santoso
```

menjadi:

```text
BudiSantoso08123456789.png
```

atau format filename yang aman.

---

# 7. FOTO DENGAN GARIS TENGAH / CUTTING GUIDE

Tambahkan fitur khusus pada foto berupa **garis tengah** untuk membantu proses pemotongan/cutting.

Tujuannya agar satu hasil foto dapat lebih mudah dipotong menjadi bagian-bagian yang diperlukan.

Tambahkan garis:

```text
-------------------------
          |
          |
          |
-------------------------
```

Namun garis tersebut harus berupa elemen visual yang rapi dan tidak mengganggu desain utama.

### Requirement
* pastikan garis yang muncul berada di tengah di foto combaine
* Garis berada tepat di tengah sesuai area pemotongan.
* Garis harus memiliki posisi yang konsisten.
* Garis harus mengikuti ukuran canvas.
* Garis harus terlihat pada preview.

### Penting

* hanya masuk ke png dan tidak ada di preview 
* hanya ada di foto combaine antara kanan dan kiri 

# 8. PREVIEW

Preview harus menampilkan hasil sebenarnya sebelum download.

Pastikan preview:

* memiliki ukuran yang proporsional;
* tidak blur;

# 9. UI / UX

Perbesar font UI agar lebih mudah digunakan.
Gunakan ukuran text yang nyaman:
* Heading: besar
* Label: medium
* Input: medium/besar
* Button: medium/besar

Input nama dan nomor telepon harus mudah ditemukan.

Contoh:

```text
DATA PESERTA

Nama
[ Budi Santoso                 ]

Nomor Telepon
[ 08123456789                  ]
```


# 10. VALIDASI INPUT

Tambahkan validasi.

Nama:

* tidak boleh kosong.

Nomor telepon:

* tidak boleh kosong jika memang diwajibkan;
* hanya menerima format nomor yang valid;
* jangan menyebabkan error jika user memasukkan spasi atau tanda `+`.

Contoh:

```text
+62 812-3456-7890
```

dapat dinormalisasi menjadi filename yang aman.

---

# 11. PERFORMANCE

Optimalkan website supaya tetap cepat.

Perhatikan:

* image compression hanya jika diperlukan;
* jangan melakukan rendering berulang;
* gunakan canvas dengan benar;
* gunakan Web Worker jika proses berat dan teknologi project memungkinkan;
* release object URL setelah tidak digunakan;
* jangan menyimpan image/video besar secara berlebihan di memory;
* gunakan lazy loading untuk preview jika diperlukan.

---

# 12. RESPONSIVE

Website harus tetap nyaman digunakan:

### Desktop

Layout dapat menggunakan beberapa kolom.

### Tablet

Layout menyesuaikan.

### Mobile

Input dan preview harus menjadi satu kolom.

Button harus mudah ditekan dengan touchscreen.

---

# 13. STRUKTUR TEMPLATE

Buat sistem template yang mudah dikembangkan.

Idealnya setiap template mempunyai konfigurasi seperti:

```javascript
{
  background: "...",
  frame: "...",
  logo: "...",

  photo: {
    x: 0,
    y: 0,
    width: 500,
    height: 600
  },

  name: {
    x: 0,
    y: 0,
    fontSize: 48,
    align: "center"
  },

  phone: {
    x: 0,
    y: 0,
    fontSize: 32,
    align: "center"
  }
}
```

Dengan sistem seperti ini saya dapat mengganti asset tanpa harus mengubah seluruh kode.

---

# 14. JANGAN MERUSAK FITUR LAMA

Sebelum melakukan perubahan:

1. Analisis seluruh source code.
2. Identifikasi fungsi generate foto.
3. Identifikasi fungsi generate video.
4. Identifikasi sistem input.
5. Identifikasi sistem template.
6. Identifikasi sistem export/download.
7. Identifikasi dependency yang digunakan.

Setelah itu lakukan perubahan seminimal mungkin pada bagian yang tidak berkaitan.

Jangan menghapus fungsi lama hanya karena membuat implementasi baru lebih mudah.

---

# 15. TESTING

Setelah selesai melakukan perubahan, lakukan testing terhadap:

### Foto

* 1 nama
* banyak nama
* nama dengan spasi
* nama panjang
* nomor telepon
* nomor dengan +62
* PNG HD
* cutting guide ON
* cutting guide OFF

### Video

* MP4
* HD
* video pendek
* video panjang
* banyak data
* download video
* playback video

### Responsive

* desktop
* tablet
* mobile

---


# INSTRUKSI TERAKHIR

**Jangan langsung menulis ulang seluruh project.**

Pertama-tama:

1. Inspect project.
2. Pahami struktur dan teknologi yang digunakan.
3. Identifikasi bagian yang berhubungan dengan generator foto/video.
4. Buat rencana perubahan.
5. Implementasikan perubahan secara bertahap.
6. Test setiap perubahan.
7. Pastikan build berjalan.
8. Pastikan seluruh fitur lama tetap bekerja.

Jika terdapat beberapa pilihan implementasi, pilih solusi yang:

**paling stabil + ringan + kompatibel browser + mudah dikembangkan + menghasilkan output HD.**

Prioritaskan **kualitas output, performa rendering, dan kemudahan mengganti template/asset.**
