export function AccountingLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`accounting-loader${compact ? " accounting-loader-compact" : ""}`} role="img" aria-label="Loading Accounting Intelligence SAIC">
      <div className="accounting-loader-mark" aria-hidden="true"><div className="accounting-loader-orb"><span /><span /><span /><span /></div></div>
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
          <p>Preparing your workspace</p>

          <div className="saic-loader-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </main>
  );
}
