-- REGISTRI DEVICE PRODUKSI KrabCare — bukan data dummy, JANGAN DIHAPUS.
--
-- device_code = MAC address ESP32 tanpa pemisah, huruf BESAR
-- (WiFi.macAddress() lalu buang ':'). Harus PERSIS sama dengan yang dikirim
-- firmware — pencocokannya case-sensitive.
--
-- Backend TIDAK melakukan auto-register: ingest_base.find_devices_by_code() cuma
-- SELECT, dan /api/v1/ingest/readings membalas 201 dengan unknown_device_codes
-- untuk kode asing — reading-nya dibuang DIAM-DIAM, bukan error. Tanpa baris di
-- bawah ini, ESP32 kirim data dan nol baris tersimpan tanpa pesan apa pun.
--
-- parent_device_id sengaja NULL: master node belum didaftarkan (MAC-nya belum
-- diketahui). Begitu ada, tambahkan master-nya lalu UPDATE kolom ini.
--
-- Aman dijalankan berulang (idempoten).

INSERT INTO devices (device_code, device_type, level_number, rack_label, location_note)
VALUES ('54D660E9BFB4', 'slave_node', 1, 'Rak A',
        'ESP32 slave node tingkat 1 Rak A — sensor pH, suhu, salinitas')
ON CONFLICT (device_code) DO NOTHING;
