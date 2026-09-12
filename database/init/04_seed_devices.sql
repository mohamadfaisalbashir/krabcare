-- Registri device produksi KrabCare.

INSERT INTO devices (device_code, device_type, rack_label, location_note)
VALUES ('54D660E9BFB4', 'slave_node', 'Rak A',
        'ESP32 slave node Rak A, sensor pH, suhu, salinitas')
ON CONFLICT (device_code) DO NOTHING;
