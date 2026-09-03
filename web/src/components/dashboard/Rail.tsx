"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

/** Geseran (px) sebelum sebuah pointer dianggap menyeret, bukan mengklik.
 *  Bukan 0: jari maupun mouse selalu bergerak satu-dua piksel saat menekan,
 *  dan pada ambang 0 setiap klik kartu akan ditelan sebagai seretan. */
const DRAG_SLOP = 5;

/** Laju maksimum peluncur, px per frame. Tanpa jepit ini satu sentakan cepat
 *  melempar baris dari ujung ke ujung dalam tiga-empat frame. */
const MAX_V = 60;

/** Sisa laju tiap frame. 0.94 ≈ berhenti dalam ~0,7 detik dari laju penuh —
 *  cukup panjang untuk terbaca sebagai luncuran, cukup pendek untuk baris tidak
 *  terasa lepas kendali. Ini knob-nya kalau luncurannya terasa terlalu jauh. */
const FRICTION = 0.94;

/**
 * Laju bersama seretan & wheel.
 *
 * Fungsinya ditaruh DI LUAR komponen supaya identitasnya tidak berganti tiap
 * render: rAF yang sedang berjalan memegang fungsi ini, dan fungsi yang dirakit
 * ulang tiap render akan meninggalkan closure lama yang menunjuk elemen basi.
 */
type Glide = { v: number; raf: number };

function glideStep(el: HTMLDivElement, g: Glide) {
  g.raf = 0;
  if (Math.abs(g.v) < 0.5) return;
  const before = el.scrollLeft;
  el.scrollLeft = before + g.v;
  // Sudah mentok di ujung: meneruskan berarti rAF berputar tanpa gerakan.
  if (el.scrollLeft === before) return;
  g.v *= FRICTION;
  g.raf = requestAnimationFrame(() => glideStep(el, g));
}

function pushGlide(el: HTMLDivElement, g: Glide, v: number) {
  const clamped = Math.max(-MAX_V, Math.min(MAX_V, v));
  // Gerakan dimatikan pengguna → geser sekali, tanpa sisa luncuran.
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
 * Container utama baris kartu rak: menempatkan, menggeser, dan memberi petunjuk
 * arah — semuanya di satu tempat.
 *
 * Barisnya digeser dengan SERET (klik-tahan) atau wheel; scrollbar-nya
 * disembunyikan lewat kelas `.rail` (globals.css). Elemen scroll-nya tetap
 * `overflow-x-auto`, bukan `hidden`, supaya dua jalur geser yang tidak
 * melibatkan mouse tetap hidup: sentuhan (dengan momentum native-nya) dan
 * keyboard — browser menggulir container sendiri ketika Tab memindahkan fokus
 * ke kartu yang berada di luar layar. Karena itu jangan menambahkan tabIndex,
 * overflow-hidden, atau transform pada scroller ini.
 *
 * Seretan mouse dan wheel bermuara ke SATU peluncur rAF (`glide`). Sebelumnya
 * keduanya menulis scrollLeft langsung: baris berhenti mendadak begitu tombol
 * dilepas, dan melompat sekali per notch wheel — itu yang terbaca kaku.
 * Sentuhan sengaja TIDAK lewat sini; iOS/Android sudah punya momentumnya
 * sendiri dan dua momentum yang bertumpuk terasa licin.
 *
 * Scroll-snap sengaja TIDAK dipakai. `snap-x` proximity menyentak baris ke
 * batas kartu terdekat tepat saat luncuran melambat — persis membatalkan
 * momentum yang baru saja dibangun.
 */
export default function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Satu state untuk dua gradien: keduanya selalu dihitung dari pengukuran yang
  // sama, jadi tidak bisa jatuh tidak sinkron.
  const [edge, setEdge] = useState({ start: false, end: false });

  // Nilai seretan ditaruh di ref, bukan state: dipakai puluhan kali per detik
  // saat pointer bergerak dan tidak satu pun perlu memicu render.
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
    // Toleransi 1px: scrollLeft bisa pecahan pada layar ber-DPR tinggi, dan
    // tanpa bantalan ini gradien kanan tidak pernah benar-benar hilang.
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft < max - 1;
    // Kembalikan objek LAMA kalau jawabannya tidak berubah. Bukan optimasi:
    // measure() dipanggil tiap render (lihat useEffect tanpa dependensi di
    // bawah), dan objek baru tiap kali akan jadi loop render tanpa henti.
    setEdge((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  // Sengaja TANPA array dependensi: jumlah kartu berubah saat data masuk, dan
  // itu mengubah scrollWidth tanpa mengubah ukuran satu elemen pun — jadi tidak
  // ada ResizeObserver yang bisa menangkapnya. Aman berkat bail-out di atas.
  useEffect(measure);

  // Luncuran yang masih berjalan saat komponen dilepas akan terus menyentuh
  // elemen yang sudah tidak ada di dokumen.
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

    // Wheel dipasang manual, BUKAN lewat prop onWheel React: React memasang
    // listener wheel-nya sebagai passive, sehingga preventDefault() di sana
    // diabaikan browser dan halaman ikut bergulir vertikal.
    function onWheel(e: WheelEvent) {
      const node = ref.current;
      if (!node) return;
      // Trackpad yang menggeser mendatar sudah ditangani browser — jangan
      // digandakan.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      const max = node.scrollWidth - node.clientWidth;
      const room =
        (e.deltaY > 0 && node.scrollLeft < max - 1) ||
        (e.deltaY < 0 && node.scrollLeft > 1);
      // Sudah mentok → biarkan lewat, supaya wheel di atas rail tetap bisa
      // menggulir halaman ke bawah alih-alih terasa macet.
      if (!room) return;

      e.preventDefault();
      // DITAMBAHKAN ke laju yang sedang berjalan, bukan menimpanya: memutar
      // wheel beberapa notch beruntun jadi membangun kecepatan, alih-alih
      // menyetel ulang luncurannya tiap notch.
      pushGlide(node, glide.current, glide.current.v + e.deltaY * 0.25);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    // Lebar panel konten berubah saat sidebar menguncup/membentang — itu
    // mengubah jawaban `measure` tanpa ada scroll maupun render.
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [measure]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Sentuhan baru selalu menang atas luncuran lama — termasuk sentuhan jari,
    // yang punya momentum native sendiri dan tidak boleh bertumpuk dengan milik
    // kita. Karena itu penghentian ini di ATAS penyaringan pointerType.
    if (glide.current.raf) cancelAnimationFrame(glide.current.raf);
    glide.current = { v: 0, raf: 0 };

    // Sentuhan & pena punya geseran native yang lebih baik (momentum,
    // overscroll) — jangan diambil alih.
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
    // TIDAK setPointerCapture di sini. Pointer capture ikut mengalihkan
    // compatibility mouse event, jadi `click` akan dilepas di scroller ini —
    // bukan di <button> kartu rak — dan menekan kartu tidak melakukan apa pun.
    // Capture-nya dipasang di onPointerMove, setelah jelas ini seretan.
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;

    if (!drag.current.moved) {
      // Di bawah ambang ini gerakannya masih mungkin sekadar getaran jari saat
      // mengklik — jangan sentuh scroll, dan jangan ambil pointernya.
      if (Math.abs(dx) <= DRAG_SLOP) return;
      drag.current.moved = true;
      // Baru sekarang: ini seretan sungguhan. Capture menjaga geseran tetap
      // mengikuti kursor walau ia keluar dari baris.
      el.setPointerCapture(e.pointerId);
      setDragging(true);
    }

    el.scrollLeft = drag.current.startLeft - dx;

    // Laju untuk luncuran setelah dilepas. Tandanya sengaja `lastX - clientX`:
    // scrollLeft bergerak berlawanan arah kursor. Diratakan dengan laju
    // sebelumnya supaya satu frame yang tersendat tepat sebelum tombol dilepas
    // tidak menentukan seluruh luncuran.
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
    // Hanya melepas kalau memang memegang: seretan yang tidak pernah melewati
    // ambang tidak pernah meminta capture, dan releasePointerCapture pada
    // pointer yang tidak ditangkap melempar InvalidPointerId.
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // Klik biasa (tidak pernah melewati ambang) tidak boleh menggeser apa pun.
    if (el && drag.current.moved) pushGlide(el, glide.current, drag.current.v);
    setDragging(false);
  }

  // Tanpa penjaga ini, melepas seretan di atas kartu ikut membuka detail
  // raknya. Capture phase supaya klik dihentikan sebelum sampai ke <button>
  // kartu, dan flag-nya dibersihkan di sini juga — kalau tidak, klik berikutnya
  // masih ikut tertelan.
  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    // detail === 0 = klik yang dibangkitkan keyboard (Enter di atas kartu yang
    // sedang difokus). Itu tidak pernah berasal dari seretan, jadi jangan
    // ditelan hanya karena seretan sebelumnya belum sempat dibersihkan.
    if (!drag.current.moved || e.detail === 0) return;
    drag.current.moved = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    // -mt di sini BERPASANGAN dengan pb pada banner dashboard: selisih keduanya
    // yang menentukan seberapa dalam kartu menindih banner. Ubah berdua.
    // z-10 supaya kartu tergambar di atas lapisan gradien banner, bukan di
    // baliknya.
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
          // dan bayangan kartu akan terpotong.
          // px ada DI DALAM scroller, bukan di pembungkusnya — kartu pertama
          // jadi sejajar konten lain, sementara kartu terakhir tetap boleh
          // terpotong tepi panel.
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
      >
        {children}
      </div>

      {/* Petunjuk arah pengganti scrollbar. pointer-events-none mutlak: tanpa
          itu 48px pertama & terakhir baris jadi tidak bisa diklik maupun
          diseret. Warnanya `surface` karena panel konten di baliknya putih. */}
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
