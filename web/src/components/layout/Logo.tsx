/**
 * `markOnly` dipakai sidebar saat terkuncup jadi rail ikon.
 *
 * Sengaja menghilangkan wordmark lewat conditional render, BUKAN membungkusnya
 * dengan elemen baru: login/page.tsx:46 mewarnai ulang wordmark lewat selektor
 * `[&_span]:text-white [&_span_span]:text-brass-300`, yang bergantung pada persis
 * satu span luar + satu span bersarang. Menambah pembungkus akan merusak logo di
 * layar login tanpa error apa pun. Saat markOnly false, pohon elemennya identik
 * dengan sebelumnya.
 */
export default function Logo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="15" cy="15" r="15" fill="#19A8B2" />
        <path
          d="M6 13c1.6 1.8 3.2 1.8 4.8 0s3.2-1.8 4.8 0 3.2 1.8 4.8 0 3.2-1.8 4.8 0"
          stroke="#E8F6F7"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6 18c1.6 1.8 3.2 1.8 4.8 0s3.2-1.8 4.8 0 3.2 1.8 4.8 0 3.2-1.8 4.8 0"
          stroke="#C1873A"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      {!markOnly && (
        <span className="font-display text-lg font-semibold tracking-tight text-ink">
          {/* brand-600, bukan 500: ini teks di atas latar terang. */}
          sismon<span className="text-brand-600">_kepiting</span>
        </span>
      )}
    </div>
  );
}
