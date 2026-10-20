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
        <div className="saic-loader-visual" aria-hidden="true">
          <span className="saic-orbit saic-orbit-outer" />
          <span className="saic-orbit saic-orbit-middle" />
          <span className="saic-orbit saic-orbit-inner" />

          <div className="saic-loader-wordmark">
            <span className="saic-wordmark-top">Accounting</span>
            <span className="saic-wordmark-bottom">Intelligence</span>
          </div>
        </div>

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