export function AccountingLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`accounting-loader${compact ? " accounting-loader-compact" : ""}`} role="img" aria-label="Loading Accounting Intelligence SAIC">
      <svg className="accounting-loader-defs" aria-hidden="true"><defs>
        <linearGradient id="accounting-loader-purple" x1="0" y1="62" x2="0" y2="2"><stop stopColor="#973BED" /><stop offset="1" stopColor="#007CFF" /></linearGradient>
        <linearGradient id="accounting-loader-gold" x1="0" y1="64" x2="0" y2="0"><stop stopColor="#FFC800" /><stop offset=".5" stopColor="#F0F" /><stop offset="1" stopColor="#FFC800" /></linearGradient>
        <linearGradient id="accounting-loader-green" x1="0" y1="62" x2="0" y2="2"><stop stopColor="#00E0ED" /><stop offset="1" stopColor="#00DA72" /></linearGradient>
      </defs></svg>
      <div className="accounting-loader-mark" aria-hidden="true">
        <div className="accounting-loader-orb"><span /><span /><span /><span /></div>
      </div>
      <div className="accounting-loader-name"><strong>Accounting Intelligence</strong><span>SAIC</span></div>
    </div>
  );
}

export function AppLoader() {
  return (
    <main
      className="saic-loading-screen"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparing Accounting Intelligence workspace"
    >
      <div className="saic-loader-ambient" aria-hidden="true">
        <span className="saic-ambient-one" />
        <span className="saic-ambient-two" />
      </div>

      <div className="saic-loader-content">
        <AccountingLoader />

        <div className="saic-loader-copy">
          <div className="saic-loader-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </main>
  );
}
