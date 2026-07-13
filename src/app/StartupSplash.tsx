import React from "react";

export function StartupSplash() {
  return (
    <main className="startup-splash" aria-label="Starting Kurogi Motion">
      <div className="startup-orbit startup-orbit-one" />
      <div className="startup-orbit startup-orbit-two" />
      <section className="startup-card">
        <div className="startup-brand-mark">K</div>
        <div className="startup-motion-stage" aria-hidden="true">
          <svg viewBox="0 0 520 250" role="presentation">
            <defs>
              <linearGradient id="kuroStroke" x1="0" x2="1">
                <stop offset="0" stopColor="#8f6cf6" />
                <stop offset="1" stopColor="#c8b5ff" />
              </linearGradient>
            </defs>
            <rect className="startup-frame" x="44" y="32" width="432" height="154" rx="22" />
            <rect className="startup-card-a" x="86" y="76" width="124" height="70" rx="17" />
            <circle className="startup-card-b" cx="315" cy="111" r="39" />
            <path className="startup-motion-path" d="M94 208 C174 150 258 242 338 176 C386 136 422 154 462 113" />
            <circle className="startup-playhead-dot" cx="94" cy="208" r="7" />
            <line className="startup-playhead-line" x1="94" y1="190" x2="94" y2="228" />
          </svg>
        </div>
        <div className="startup-copy">
          <strong>kurogi<span>motion</span></strong>
          <small>Preparing your motion workspace</small>
        </div>
        <div className="startup-progress"><i /></div>
      </section>
    </main>
  );
}
