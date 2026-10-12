import serial
import time

# Buka koneksi UART ke modul SIM7600G
modem = serial.Serial('/dev/ttyAMA2', baudrate=115200, timeout=1)
time.sleep(1)  # beri waktu modul stabil

def kirim_at(command, delay=1):
    modem.write((command + '\r\n').encode())
    time.sleep(delay)
    respon = modem.read(modem.in_waiting or 100).decode(errors='ignore')
    print(f">> {command}")
    print(f"<< {respon}")
    print("-" * 40)

# cek provider
kirim_at("AT+COPS?")

#cek kekuatan sinyal
kirim_at("AT+CSQ")

# Cek jaringan
kirim_at("AT+CPSI?")

# set APN
kirim_at('"AT+CGDCONT=1,"IP","m2mplatform"')

# Cek APN
kirim_at("AT+CGDCONT?")

# Cek status attach ke jaringan
kirim_at("AT+CGATT?")

# Test aktivasi PDP context
kirim_at('AT+CGACT=1,1', delay=5)
kirim_at('AT+CGPADDR=1') #cek IP yang didapat modul

#kunci 4G LTE
kirim_at("AT+CNMP=38")

modem.close()
