import requests, time

waktu = []
for i in range(5):
    start = time.time()
    requests.get("https://api-domain.com/endpoint")
    waktu.append(time.time() - start)

print("Rata-rata:", sum(waktu)/len(waktu), "detik")
print("Maksimum:", max(waktu))
print("Minimum:", min(waktu))