-- Data contoh untuk pengujian lokal (development). Aman dijalankan berulang (idempoten).

INSERT INTO devices (device_code, device_type, rack_label, location_note)
VALUES ('master', 'master_node', 'Rak A', 'ESP32 master, agregasi data dari slave node Rak A')
ON CONFLICT (device_code) DO NOTHING;

INSERT INTO devices (device_code, device_type, level_number, rack_label, parent_device_id)
VALUES
    ('SLV1', 'slave_node', 1, 'Rak A', (SELECT id FROM devices WHERE device_code = 'master')),
    ('SLV2', 'slave_node', 2, 'Rak A', (SELECT id FROM devices WHERE device_code = 'master')),
    ('SLV3', 'slave_node', 3, 'Rak A', (SELECT id FROM devices WHERE device_code = 'master'))
ON CONFLICT (device_code) DO NOTHING;
