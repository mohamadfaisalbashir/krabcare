#!/usr/bin/env python3
"""Impor dataset riil NOAA NERRS SWMP ke sismon_kepiting lewat endpoint ingest gateway.

Stasiun gndblwq (Grand Bay NERR, Bangs Lake, Mississippi), file gndblwq2020.csv ..
gndblwq2024.csv, interval 15 menit. Dataset ini menggantikan data sintetis sebagai
sumber data utama untuk membangun FLRG & mengukur RMSE FTS Chen; dummy_readings.py
tetap ada tapi turun peran jadi alat uji jalur anomali saja.

Berdiri sendiri seperti script lain di folder ini — tidak diimpor modul mana pun,
dan boleh pakai pandas karena jalan di host (BUKAN di container backend; jangan
tambahkan pandas ke backend/requirements.txt).

Pipeline:
  1. Baca semua CSV di --input-dir, gabung, parse DateTimeStamp (MM/DD/YYYY H:MM).
  2. Ekstrak kode flag QAQC dari F_Temp/F_pH/F_Sal — hanya angka di dalam <>.
  3. Simpan hanya baris yang KETIGA flagnya berkode 0 (membuang ~23,6% baris,
     termasuk nilai rusak pH -88,7 & Temp -6,6 yang ada di data mentah).
  4. Potong ke rentang bulan --months (default 5-10, musim hangat Grand Bay).
  5. Rename ke skema SensorReadingBatchIn.
  6. POST batch ke /api/v1/ingest/readings.

    python ml/scripts/import_nerr_dataset.py --dry-run
    python ml/scripts/import_nerr_dataset.py
    python ml/scripts/import_nerr_dataset.py --months 11-4 --device-code NERR-GNDBL-COLD
"""

import argparse
import os
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.fts import FTS_PARAMS
from ml.scripts.api_client import api_post

# Kolom sumber -> nama field SensorReadingIn. SpCond tidak ikut dikirim (skema
# reading belum punya kolomnya), tapi tetap dibaca untuk statistik validasi
# sensor TDS nanti.
_COLUMN_MAP = {"Temp": "temperature_c", "pH": "ph", "Sal": "salinity_ppt"}
_FLAG_COLUMNS = {"Temp": "F_Temp", "pH": "F_pH", "Sal": "F_Sal"}

# Kolom sumber -> nama parameter di ml/fuzzy/fts.py (buat cek universe of discourse).
_FTS_PARAMETER = {"Temp": "suhu", "pH": "ph", "Sal": "salinitas"}

_SAMPLING_MINUTES = 15
_FLAG_CODE_RE = re.compile(r"^<(-?\d+)>")


def _load_raw(input_dir: Path, years: range) -> pd.DataFrame:
    """Baca & gabung seluruh CSV tahunan, parse timestamp secara eksplisit.

    Format DateTimeStamp-nya MM/DD/YYYY H:MM, BUKAN ISO — inferensi pandas bisa
    salah menebak day-first, jadi format-nya dipaksa.
    """
    files = sorted(f for y in years if (f := input_dir / f"gndblwq{y}.csv").exists())
    if not files:
        raise SystemExit(
            f"Tidak ada file gndblwq<tahun>.csv di {input_dir} untuk tahun {years.start}-"
            f"{years.stop - 1}. Ekstrak dulu zip dataset NERR ke folder itu."
        )

    print(f"Membaca {len(files)} file: {', '.join(f.name for f in files)}")
    df = pd.concat([pd.read_csv(f, low_memory=False) for f in files], ignore_index=True)
    df["DateTimeStamp"] = pd.to_datetime(df["DateTimeStamp"], format="%m/%d/%Y %H:%M")
    return df.sort_values("DateTimeStamp").reset_index(drop=True)


def _filter_qaqc(df: pd.DataFrame) -> pd.DataFrame:
    """Sisakan baris yang ketiga flag QAQC-nya berkode 0.

    Format flag: `<kode> [KUALIFIER] (KUALIFIER)`. HANYA angka di dalam <> yang
    menentukan lolos/tidak — `<0> [GSM] (CWD)` tetap LOLOS. Filter berdasarkan
    flag, bukan berdasarkan rentang nilai: nilai rusak seperti pH -88,7 memang
    ada di data mentah dan sudah ditandai <-2>/<-3> oleh NERR.
    """
    passed = pd.Series(True, index=df.index)
    for flag_column in _FLAG_COLUMNS.values():
        code = df[flag_column].astype(str).str.extract(_FLAG_CODE_RE, expand=False)
        passed &= code == "0"
    return df[passed].copy()


def _parse_months(spec: str) -> list[int]:
    """Ubah '5-10' jadi [5..10]; rentang yang melewati akhir tahun ('11-4') ikut ditangani."""
    start, _, end = spec.partition("-")
    start, end = int(start), int(end or start)
    if start <= end:
        return list(range(start, end + 1))
    return list(range(start, 13)) + list(range(1, end + 1))


def _print_summary(df: pd.DataFrame, label: str) -> None:
    """Ringkasan yang jadi bahan Bab 4 — jangan diam-diam, selalu dicetak sebelum POST."""
    print(f"\n--- Statistik {label} ({len(df):,} baris) ---")
    if df.empty:
        return

    print(f"Rentang waktu : {df.DateTimeStamp.min()} s.d. {df.DateTimeStamp.max()}")
    in_universe_all = pd.Series(True, index=df.index)
    for source_column, parameter in _FTS_PARAMETER.items():
        p = FTS_PARAMS[parameter]
        values = pd.to_numeric(df[source_column], errors="coerce")
        inside = values.between(p["d_min"], p["d_max"])
        in_universe_all &= inside
        print(
            f"{source_column:<6}: mean={values.mean():7.2f}  min={values.min():8.2f}  "
            f"max={values.max():7.2f}  dalam U=[{p['d_min']}, {p['d_max']}]: "
            f"{100 * inside.mean():.2f}%"
        )
    print(f"Ketiga parameter sekaligus dalam universe: {100 * in_universe_all.mean():.2f}%")

    # Celah temporal: FLR tidak boleh dibentuk melintasinya (ml/fuzzy/fts.py:_build_flrg).
    gaps = df.DateTimeStamp.diff().dropna()
    gaps = gaps[gaps > pd.Timedelta(minutes=_SAMPLING_MINUTES)]
    print(
        f"Celah temporal >{_SAMPLING_MINUTES} menit: {len(gaps)} "
        f"(>24 jam: {(gaps > pd.Timedelta(hours=24)).sum()}, "
        f"terpanjang: {gaps.max() if len(gaps) else '-'}, "
        f"total hilang: {gaps.sum() if len(gaps) else '-'})"
    )


def _to_readings(df: pd.DataFrame, device_code: str) -> list[dict]:
    """Ubah ke payload SensorReadingBatchIn. Satuan sumber sudah benar, tanpa konversi."""
    out = df.rename(columns=_COLUMN_MAP)
    return [
        {
            "device_code": device_code,
            "time": row.DateTimeStamp.isoformat(),
            "ph": float(row.ph),
            "temperature_c": float(row.temperature_c),
            "salinity_ppt": float(row.salinity_ppt),
        }
        for row in out.itertuples()
    ]


def _post_batches(base_url: str, api_key: str, readings: list[dict], batch_size: int) -> None:
    """Kirim per batch — 67 ribu baris dalam satu request pasti kena timeout/limit body."""
    url = f"{base_url}/api/v1/ingest/readings"
    total_inserted = total_skipped = 0

    for start in range(0, len(readings), batch_size):
        batch = readings[start : start + batch_size]
        response = api_post(url, api_key, {"readings": batch})
        inserted = response.get("inserted", 0)
        skipped = len(response.get("skipped_duplicates", []))
        unknown = response.get("unknown_device_codes") or []
        total_inserted += inserted
        total_skipped += skipped

        if unknown:
            raise SystemExit(
                f"Device {unknown} belum terdaftar. Apply seed-nya dulu:\n"
                "  docker compose exec -T db psql -U sismon_kepiting -d sismon_kepiting_db "
                "< database/init/09_seed_nerr_device.sql"
            )
        print(
            f"  batch {start // batch_size + 1:>3}/{-(-len(readings) // batch_size)} "
            f"({start + len(batch):>6}/{len(readings)}): inserted={inserted} "
            f"skipped_duplicates={skipped}"
        )

    print(f"\nSelesai: inserted={total_inserted}, skipped_duplicates={total_skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--input-dir", type=Path, default=Path("data/nerr"))
    parser.add_argument(
        "--device-code",
        default="NERR-GNDBL",
        help="Device khusus benchmark — jangan pakai device produksi mitra",
    )
    parser.add_argument("--months", default="5-10", help="Rentang bulan, mis. 5-10 atau 1-12")
    parser.add_argument("--years", default="2020-2024", help="Rentang tahun file CSV")
    parser.add_argument(
        "--base-url", default=os.environ.get("SISMON_KEPITING_BASE_URL", "http://localhost:8000")
    )
    parser.add_argument("--api-key", default=os.environ.get("GATEWAY_API_KEY", "ai-dilarangbaca"))
    parser.add_argument("--batch-size", type=int, default=1000, help="Baris per request POST")
    parser.add_argument(
        "--dry-run", action="store_true", help="Hitung & cetak statistik saja, tanpa POST"
    )
    args = parser.parse_args()

    year_start, _, year_end = args.years.partition("-")
    df = _load_raw(args.input_dir, range(int(year_start), int(year_end or year_start) + 1))
    n_raw = len(df)
    print(f"Baris mentah: {n_raw:,}")

    df = _filter_qaqc(df)
    print(
        f"Lolos QAQC (F_Temp/F_pH/F_Sal semua <0>): {len(df):,} "
        f"({100 * (1 - len(df) / n_raw):.1f}% dibuang)"
    )

    months = _parse_months(args.months)
    df = df[df.DateTimeStamp.dt.month.isin(months)]
    print(f"Setelah dipotong ke bulan {args.months}: {len(df):,} baris")

    _print_summary(df, f"bulan {args.months}")

    if df.empty:
        raise SystemExit("Tidak ada baris tersisa — cek --months/--years.")

    readings = _to_readings(df, args.device_code)

    if args.dry_run:
        print(f"\n[dry-run] {len(readings):,} baris SIAP dikirim ke '{args.device_code}', "
              "tidak ada yang di-POST. Contoh payload pertama:")
        print(f"  {readings[0]}")
        return

    print(f"\nMengirim {len(readings):,} baris ke {args.base_url} sebagai '{args.device_code}' "
          f"({args.batch_size} baris/request)...")
    _post_batches(args.base_url, args.api_key, readings, args.batch_size)

    print(
        "\nKalau semua batch balas unknown_device_codes, seed device-nya belum ada "
        "(file database/init/ cuma auto-jalan saat volume pgdata masih kosong). Apply manual:\n"
        "  docker compose exec -T db psql -U sismon_kepiting -d sismon_kepiting_db "
        "< database/init/09_seed_nerr_device.sql"
    )


if __name__ == "__main__":
    main()
