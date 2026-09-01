# 📷 Cara Menjalankan Photobooth

## Langkah 1: Buka Terminal / PowerShell
Buka terminal di folder proyek: `c:\Users\ACER\Documents\pppp\photoboth`

## Langkah 2: Jalankan Aplikasi
```bash
npm start
```

**PENTING**: Gunakan `npm start` (BUKAN `npm run client` atau hanya `react-scripts start`)

## Langkah 3: Tunggu Sampai Kedua Server Jalan
Akan muncul 2 pesan:
```
✅ Photobooth server running on http://localhost:5000
📁 Files will be saved to: C:\Users\ACER\Documents\pppp\photoboth\hasil
```

Kemudian React app akan membuka di browser: `http://localhost:3000`

## Langkah 4: Gunakan Aplikasi
1. Klik tombol **Start**
2. Pilih **frame**
3. Ambil **foto** (ada countdown 5 detik)
4. Pilih **stiker** (opsional)
5. Klik **Finish**

## Langkah 5: Hasil Foto
✅ Foto akan **otomatis tersimpan** di folder: `hasil/`
- `photo-strip.png` - Hasil foto dengan frame
- `photobooth-live-[timestamp].webm` - Video live sebelum foto diambil

## ❌ Jika Tidak Jalan
- Pastikan sudah `npm install` semua dependencies
- Pastikan menggunakan `npm start` (bukan `npm run client`)
- Tunggu 5-10 detik hingga kedua server fully running
- Cek folder `hasil/` - file harus muncul di sana
- Lihat console (F12 → Console) untuk error messages
