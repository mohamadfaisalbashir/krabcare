"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

/** Geseran (px) sebelum pointer dianggap menyeret, bukan mengklik. Bukan 0:
 *  jari dan mouse selalu bergerak satu-dua piksel saat menekan, dan pada
 *  ambang 0 setiap klik kartu ditelan sebagai seretan. */
const DRAG_SLOP = 5;

/** Laju maksimum peluncur, px per frame. Tanpa jepit ini satu sentakan cepat
 *  melempar baris dari ujung ke ujung dalam beberapa frame. */
const MAX_V = 60;

/** Sisa laju tiap frame. 0.94 berhenti dalam ~0,7 detik dari laju penuh.
 *  Turunkan kalau luncurannya terasa terlalu jauh. */
const FRICTION = 0.94;

/**
 * Peluncur bersama untuk seretan & wheel. Di luar komponen supaya identitasnya
 * tidak berganti tiap render: rAF yang sedang jalan memegang fungsi ini, dan
 * fungsi baru tiap render meninggalkan closure yang menunjuk elemen basi.
 */
type Glide = { v: number; raf: number };

function glideStep(el: HTMLDivElement, g: Glide) {
  g.raf = 0;
  if (Math.abs(g.v) < 0.5) return;
  const before = el.scrollLeft;
  el.scrollLeft = before + g.v;
  // Sudah mentok di ujung, meneruskan berarti rAF berputar tanpa gerakan.
  if (el.scrollLeft === before) return;
  g.v *= FRICTION;
  g.raf = requestAnimationFrame(() => glideStep(el, g));
}

function pushGlide(el: HTMLDivElement, g: Glide, v: number) {
  const clamped = Math.max(-MAX_V, Math.min(MAX_V, v));
  // Gerakan dimatikan pengguna, geser sekali tanpa sisa luncuran.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.scrollLeft += clamped;
    return;
  }
  g.v = clamped;
  if (!g.raf && Math.abs(clamped) >= 0.5) {
    g.raf = requestAnimationFrame(() => glideStep(el, g));
  }
}

/**
 * Container baris kartu rak: menempatkan, menggeser, dan memberi petunjuk arah.
 *
 * Barisnya digeser dengan seret (klik-tahan) atau wheel. Scrollbar disembunyikan
 * lewat kelas `.rail` (globals.css), tapi elemen scroll-nya tetap
 * `overflow-x-auto`, bukan `hidden`, supaya sentuhan dan keyboard tetap bisa
 * menggulir (browser menggulir sendiri saat Tab memindahkan fokus ke kartu di
 * luar layar). Jangan tambahkan tabIndex, overflow-hidden, atau transform di
 * scroller ini.
 *
 * Seretan mouse dan wheel bermuara ke satu peluncur rAF (`glide`). Sentuhan
 * tidak lewat sini: iOS/Android sudah punya momentum sendiri.
 *
 * Scroll-snap tidak dipakai: `snap-x` proximity menyentak baris ke batas kartu
 * terdekat tepat saat luncuran melambat.
 */
export default function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Satu state untuk dua gradien, supaya keduanya dihitung dari pengukuran
  // yang sama.
  const [edge, setEdge] = useState({ start: false, end: false });

  // Nilai seretan di ref, bukan state: dipakai puluhan kali per detik saat
  // pointer bergerak dan tidak perlu memicu render.
  const drag = useRef({
    active: false,
    startX: 0,
    startLeft: 0,
    moved: false,
    lastX: 0,
    lastT: 0,
    v: 0,
  });
  const glide = useRef<Glide>({ v: 0, raf: 0 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // Toleransi 1px: scrollLeft bisa pecahan pada layar ber-DPR tinggi, tanpa
    // ini gradien kanan tidak pernah hilang.
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft < max - 1;
    // Kembalikan objek lama kalau jawabannya tidak berubah. measure() dipanggil
    // tiap render (useEffect tanpa dependensi di bawah), objek baru tiap kali
    // jadi loop render tanpa henti.
    setEdge((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  // Tanpa array dependensi: jumlah kartu berubah saat data masuk dan itu
  // mengubah scrollWidth tanpa mengubah ukuran elemen mana pun, jadi tidak
  // tertangkap ResizeObserver. Aman berkat bail-out di atas.
  useEffect(measure);

  // Luncuran yang masih jalan saat komponen dilepas akan menyentuh elemen
  // yang sudah tidak ada di dokumen.
  useEffect(
    () => () => {
      if (glide.current.raf) cancelAnimationFrame(glide.current.raf);
    },
    []
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();

    // Wheel dipasang manual, bukan lewat prop onWheel: React memasang listener
    // wheel sebagai passive, jadi preventDefault() di sana diabaikan browser.
    function onWheel(e: WheelEvent) {
      const node = ref.current;
      if (!node) return;
      // Trackpad yang menggeser mendatar sudah ditangani browser.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      const max = node.scrollWidth - node.clientWidth;
      const room =
        (e.deltaY > 0 && node.scrollLeft < max - 1) ||
        (e.deltaY < 0 && node.scrollLeft > 1);
      // Sudah mentok, biarkan lewat supaya wheel di atas rail tetap bisa
      // menggulir halaman.
      if (!room) return;

      e.preventDefault();
      // Ditambahkan ke laju yang sedang berjalan, bukan menimpanya, supaya
      // beberapa notch beruntun membangun kecepatan.
      pushGlide(node, glide.current, glide.current.v + e.deltaY * 0.25);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    // Lebar panel konten berubah saat sidebar menguncup atau membentang, dan
    // itu mengubah jawaban `measure` tanpa scroll maupun render.
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [measure]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Sentuhan baru selalu menang atas luncuran lama, termasuk jari yang punya
    // momentum native sendiri. Karena itu penghentian ini di atas penyaringan
    // pointerType.
    if (glide.current.raf) cancelAnimationFrame(glide.current.raf);
    glide.current = { v: 0, raf: 0 };

    // Sentuhan & pena punya geseran native yang lebih baik, jangan diambil alih.
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startLeft: el.scrollLeft,
      moved: false,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
    };
    // Jangan setPointerCapture di sini: capture mengalihkan compatibility mouse
    // event, jadi `click` dilepas di scroller, bukan di <button> kartu rak.
    // Capture dipasang di onPointerMove, setelah jelas ini seretan.
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;

    if (!drag.current.moved) {
      // Di bawah ambang ini gerakannya masih mungkin getaran jari saat mengklik.
      if (Math.abs(dx) <= DRAG_SLOP) return;
      drag.current.moved = true;
      // Seretan sungguhan. Capture menjaga geseran tetap mengikuti kursor walau
      // ia keluar dari baris.
      el.setPointerCapture(e.pointerId);
      setDragging(true);
    }

    el.scrollLeft = drag.current.startLeft - dx;

    // Laju untuk luncuran setelah dilepas. `lastX - clientX` karena scrollLeft
    // bergerak berlawanan arah kursor. Diratakan dengan laju sebelumnya supaya
    // satu frame tersendat tidak menentukan seluruh luncuran.
    const now = performance.now();
    const dt = now - drag.current.lastT;
    if (dt > 0) {
      const v = ((drag.current.lastX - e.clientX) / dt) * 16;
      drag.current.v = drag.current.v * 0.7 + v * 0.3;
    }
    drag.current.lastX = e.clientX;
    drag.current.lastT = now;
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    const el = ref.current;
    // Hanya melepas kalau memang memegang: releasePointerCapture pada pointer
    // yang tidak ditangkap melempar InvalidPointerId.
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // Klik biasa (tidak melewati ambang) tidak boleh menggeser apa pun.
    if (el && drag.current.moved) pushGlide(el, glide.current, drag.current.v);
    setDragging(false);
  }

  // Tanpa penjaga ini, melepas seretan di atas kartu ikut membuka detail
  // raknya. Capture phase supaya klik berhenti sebelum sampai ke <button>
  // kartu; flag dibersihkan di sini juga supaya klik berikutnya lolos.
  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    // detail === 0 = klik dari keyboard (Enter di kartu yang difokus). Tidak
    // pernah berasal dari seretan, jadi jangan ditelan.
    if (!drag.current.moved || e.detail === 0) return;
    drag.current.moved = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    // -mt di sini berpasangan dengan pb pada banner dashboard, selisihnya yang
    // menentukan seberapa dalam kartu menindih banner. Ubah berdua.
    // z-10 supaya kartu tergambar di atas lapisan gradien banner.
    <div className="relative z-10 -mt-20 sm:-mt-24">
      <div
        ref={ref}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={clsx(
          "rail flex gap-4 overflow-x-auto px-5 py-2 sm:px-8",
          // py-2 wajib: begitu overflow-x bukan visible, sumbu Y ikut jadi auto
          // dan bayangan kartu terpotong.
          // px di dalam scroller, bukan di pembungkusnya, supaya kartu pertama
          // sejajar konten lain dan kartu terakhir tetap boleh terpotong tepi.
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
      >
        {children}
      </div>

      {/* Petunjuk arah pengganti scrollbar. pointer-events-none wajib: tanpa
          itu 48px pertama dan terakhir baris tidak bisa diklik maupun diseret.
          Warnanya `surface` karena panel konten di baliknya putih. */}
      <Fade side="left" show={edge.start} />
      <Fade side="right" show={edge.end} />
    </div>
  );
}

function Fade({ side, show }: { side: "left" | "right"; show: boolean }) {
  return (
    <div
      aria-hidden
      className={clsx(
        "pointer-events-none absolute inset-y-0 w-12 transition-opacity duration-200",
        side === "left"
          ? "left-0 bg-gradient-to-r from-surface to-transparent"
          : "right-0 bg-gradient-to-l from-surface to-transparent",
        show ? "opacity-100" : "opacity-0"
      )}
    />
  );
}
