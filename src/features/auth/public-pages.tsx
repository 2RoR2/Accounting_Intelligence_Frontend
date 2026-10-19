"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import saicLogo from "@/images/saic_logo.png";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Building2,
  CalendarDays,
  UserRound,
  X,
} from "lucide-react";
import { LandingPage } from "@/features/auth/landing-page";
import { Badge, Field, ErrorState } from "@/components/common/ui";
import { HelpCenter } from "@/features/common/help/help-center";
import {
  activateAccount,
  getAccounts,
  login,
  verifyMfa,
  resendMfa,
  requestLostAuthenticatorRecovery,
  verifyResetCode,
  passwordChecks,
  requestPasswordReset,
  resetPassword,
  getCurrentUser,
} from "@/lib/api/auth.service";
import { requestEnterpriseAccess } from "@/lib/api/tenant.service";
import { roleHome } from "@/lib/permissions";
import { useResource } from "@/features/common/hooks/use-resource";

export function PublicPage({ page }: { page: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: accounts } = useResource(getAccounts, "public");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activation, setActivation] = useState(params.get("user") ?? "");
  const [otpStep, setOtpStep] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMethod, setMfaMethod] = useState("authenticator");
  const [mfaEnrollment, setMfaEnrollment] = useState(false);
  const [mfaSecondsLeft, setMfaSecondsLeft] = useState(0);
  const [mfaResending, setMfaResending] = useState(false);
  const [mfaRecoveryOpen, setMfaRecoveryOpen] = useState(false);
  const [mfaRecoveryReason, setMfaRecoveryReason] = useState("");
  const [mfaRecoveryMode, setMfaRecoveryMode] = useState(false);
  const [mfaRecoveryComplete, setMfaRecoveryComplete] = useState(false);
  const [mfaRecoveryPassword, setMfaRecoveryPassword] = useState("");
  const [recoveryHome, setRecoveryHome] = useState("/workspace/dashboard");
  const [totpSecret, setTotpSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [showTotpSecret, setShowTotpSecret] = useState(false);
  const mfaInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [otp, setOtp] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [otpRejected, setOtpRejected] = useState(false);
  const [welcomeUser, setWelcomeUser] = useState<Awaited<ReturnType<typeof getCurrentUser>>>(null);
  const titles: Record<string, string> = {
    login: "Welcome back",
    welcome: "Welcome!",
    "request-access": "Register your company",
    activate: "Activate your account",
    "forgot-password": "Forgot your password?",
    "reset-password": "Create a new password",
    help: "Help & support",
  };
  const selected = accounts?.find((a) => a.id === activation);
  useEffect(() => {
    if (page !== "welcome") return;
    getCurrentUser().then(setWelcomeUser);
  }, [page]);
  useEffect(() => {
    if (!otpStep) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpStep]);
  useEffect(() => {
    if (!mfaStep || mfaSecondsLeft <= 0) return;
    const timer = window.setInterval(() => setMfaSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [mfaStep, mfaSecondsLeft]);

  async function resendOtp() {
    if (!resetEmail || secondsLeft > 0 || busy) return;
    setBusy(true);
    setOtp("");
    setError("");
    setOtpRejected(false);
    try {
      await requestPasswordReset(resetEmail);
      setSecondsLeft(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend the code.");
    } finally {
      setBusy(false);
    }
  }

  async function requestLostAuthenticator() {
    setBusy(true);
    setError("");
    try {
      const result = await requestLostAuthenticatorRecovery(mfaRecoveryPassword);
      setMfaMethod("authenticator");
      setMfaRecoveryMode(true);
      setMfaEnrollment(true);
      setTotpSecret(result.totpSecret);
      setOtpauthUrl(result.otpauthUrl);
      setMfaSecondsLeft(0);
      setMfaRecoveryComplete(false);
      setSuccess("");
      setMfaRecoveryOpen(false);
      setMfaRecoveryPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit the recovery request.");
    } finally {
      setBusy(false);
    }
  }

  async function continueReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyResetCode(resetEmail, otp.trim());
      router.push("/reset-password");
    } catch (e) {
      setOtpRejected(true);
      setError(e instanceof Error ? e.message : "That code is not valid. Check the company email, or resend the code.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      if (page === "login") {
        const result = await login(email, password);
        if (result.mfaRequired) {
          setMfaMethod(result.mfaMethod ?? "authenticator");
          setMfaEnrollment(result.enrollmentRequired ?? false);
          setTotpSecret(result.totpSecret ?? "");
          setOtpauthUrl(result.otpauthUrl ?? "");
          setMfaStep(true);
          setMfaSecondsLeft(result.mfaMethod === "email" ? 60 : 0);
          return;
        }
        if (!result.user) throw new Error("Sign-in did not return a user session.");
        const user = result.user;
        router.push(
          `/welcome?name=${encodeURIComponent(user.name)}&home=${encodeURIComponent(roleHome(user.role))}`,
        );
      } else if (page === "request-access") {
        await requestEnterpriseAccess({
          company: String(f.get("company")),
          registration: String(f.get("registration")),
          contact: String(f.get("contact")),
          email: String(f.get("email")),
          phone: String(f.get("phone")),
          accounts: Number(f.get("accounts")),
          employees: [],
          notes: String(f.get("notes")),
        });
        setSuccess(
          "Company access request submitted. Your request is awaiting SAIC approval.",
        );
      } else if (page === "activate") {
        await activateAccount(
          activation,
          password,
          String(f.get("confirm")),
        );
        setSuccess(
          "Account activated successfully. You can now sign in using your company email.",
        );
      } else if (page === "forgot-password") {
        const entered = String(f.get("email"));
        await requestPasswordReset(entered);
        setResetEmail(entered);
        setOtp("");
        setOtpRejected(false);
        setSecondsLeft(60);
        setOtpStep(true);
      } else {
        await resetPassword(
          password,
          String(f.get("confirm")),
        );
        setSuccess(
          "Password reset completed successfully. You can now sign in with your new password.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await verifyMfa(mfaCode.trim());
      if (mfaRecoveryMode) {
        setRecoveryHome(roleHome(user.role));
        setMfaRecoveryComplete(true);
        return;
      }
      if (user.mustChangePassword) {
        router.push(roleHome(user.role));
        return;
      }
      router.push(`/welcome?name=${encodeURIComponent(user.name)}&home=${encodeURIComponent(roleHome(user.role))}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }
  async function resendMfaCode() {
    if (mfaMethod !== "email" || mfaSecondsLeft > 0 || mfaResending) return;
    setMfaResending(true);
    setError("");
    try {
      const result = await resendMfa();
      setMfaCode("");
      setMfaSecondsLeft(result.expiresIn ?? 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend the code.");
    } finally {
      setMfaResending(false);
    }
  }
  if (page === "help")
    return (
      <div className="home-wash auth-wash help-wash">
        <header className="hp-header">
          <Link href="/" className="hp-brand">
            <Image src={saicLogo} alt="SAIC" width={150} height={46} priority />
          </Link>
          <nav>
            <Link href="/request-access" className="hp-register">
              Register company
            </Link>
            <Link href="/login" className="hp-login">
              Log in
            </Link>
          </nav>
        </header>
        <main className="help-page-main">
          <div className="help-page-copy">
            <p className="hp-eyebrow">Support</p>
            <h1>
              Tutorial and <span>company helpline.</span>
            </h1>
            <p className="hp-lead">
              Learn the workflow, or ask SAIC for help. The same guide opens inside the workspace.
            </p>
          </div>
          <div className="help-page-panel">
            <HelpCenter />
          </div>
        </main>
      </div>
    );

  if (!page) return <LandingPage />;
  const accessPage = page === "login" || page === "forgot-password";
  return (
    <div className={`home-wash auth-wash${page === "welcome" ? " welcome-wash" : ""}`}>
      <header className="hp-header">
        <Link href="/" className="hp-brand">
          <Image src={saicLogo} alt="SAIC" width={150} height={46} priority />
        </Link>
        <nav>
          <Link href="/help">Help</Link>
          <Link href="/request-access" className="hp-register">
            Register company
          </Link>
          <Link href="/login" className="hp-login">
            Log in
          </Link>
        </nav>
      </header>
      <main
        className={
          page === "request-access"
            ? "register-split"
            : mfaStep
              ? "auth-stage mfa-stage"
              : accessPage
              ? "hp-hero auth-hero"
              : page === "welcome"
                ? "welcome-split"
              : "auth-stage"
        }
      >
        {page === "welcome" && (
          <aside className="welcome-brand-panel">
            <Image src={saicLogo} alt="SAIC Accounting Intelligence" width={180} height={55} priority />
            <div className="welcome-brand-copy">
              <h1>Smarter<br />Accounting<br />Starts Here</h1>
              <p>Automate document processing, improve accuracy and simplify your accounting workflow.</p>
            </div>
          </aside>
        )}
        {page === "request-access" && (
          <section className="register-story">
            <p className="hp-eyebrow">Company registration</p>
            <h1>
              Register your company and turn invoices into{" "}
              <span>trusted records.</span>
            </h1>
            <p className="hp-lead">
              Request a company workspace. SAIC reviews it before anyone can sign in.
            </p>
            <p className="register-how">What the workspace is for</p>
            <ul className="register-points">
              <li>
                <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                <span>Extract supplier, date, line items, and total from invoices, bills, and receipts.</span>
              </li>
              <li>
                <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                <span>Send every mismatch to a person. Nothing questionable becomes a record on its own.</span>
              </li>
              <li>
                <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                <span>Write one standard record shape, ready to export.</span>
              </li>
            </ul>
            <p className="register-note">
              No live ledger, tax filing, or payment. This request only opens a company workspace.
            </p>
          </section>
        )}
        {accessPage && !mfaStep && (
          <div>
            <p className="hp-eyebrow">Company accounting intelligence</p>
            <p className="hp-quiet">
              {mfaStep
                ? "Privileged account security"
                : page === "login"
                ? "SAIC secure · company email opens the workspace"
                : otpStep
                  ? "Waiting for the code from the company email"
                  : "Reset stays inside this workspace"}
            </p>
            <h1>
              {mfaStep ? (
                <>Complete the <span>authenticator check.</span></>
              ) : page === "login" ? (
                <>
                  Sign in to the <span>workspace.</span>
                </>
              ) : otpStep ? (
                <>
                  Enter the <span>code.</span>
                </>
              ) : (
                <>
                  Forgot your <span>password?</span>
                </>
              )}
            </h1>
            <p className="hp-lead">
              {mfaStep
                ? "Your account requires one more security check."
                : page === "login"
                ? "From invoice to trusted record."
                : otpStep
                  ? "The code is valid for 15 minutes."
                  : "Use the company email on the account."}
            </p>
            <p className="hp-copy">
              {mfaStep
                ? "Scan the QR code with your authenticator app, then enter the current six-digit code to finish signing in."
                : page === "login"
                ? "Enter the company email you were issued. That address opens the right workspace. People are invited; there is no public self-signup."
                : otpStep
                  ? "Enter the code from the company email, then continue to choose a new password. Sending the email is handled later."
                  : "Enter the company email. This preview records the reset here, then asks for the code before the new password."}
            </p>
          </div>
        )}
        <div
          className={`auth-card${page === "request-access" ? " register-card" : ""}${page === "login" ? " login-card" : ""}${page === "forgot-password" ? " reset-card" : ""}`}
        >
          {!accessPage && page !== "request-access" && page !== "welcome" && (
            <>
              <span className="auth-icon">
                <LockKeyhole size={20} />
              </span>
              <p className="hp-eyebrow">
                {page === "request-access"
                  ? "Company registration"
                  : page === "reset-password"
                    ? "Account access"
                    : "Workspace sign in"}
              </p>
              <h1>{titles[page] ?? "Page not found"}</h1>
              <p>
                {page === "welcome"
                  ? "Your identity has been verified successfully."
                  : page === "request-access"
                    ? "Submit your company details to register for company access. SAIC will review your request."
                    : page === "reset-password"
                      ? "Choose a strong password to keep your workspace secure."
                      : "Secure access starts with your company email."}
              </p>
            </>
          )}
          {page === "request-access" && !success && (
            <>
              <p className="hp-eyebrow">Company details</p>
              <h2>Register your company</h2>
              <p>Complete the form. SAIC reviews the request before the workspace opens.</p>
            </>
          )}
          {accessPage && !success && !otpStep && !mfaStep && (
            <>
              <span className="auth-icon">
                <LockKeyhole size={20} />
              </span>
              <p className="hp-eyebrow">
                {page === "login" ? "Workspace sign in" : "Account access"}
              </p>
              <h2>{page === "login" ? "Company credentials" : "Request a reset"}</h2>
            </>
          )}
          {page === "login" && mfaStep ? (
            mfaRecoveryComplete ? <div className="otp-wait">
              <h2>Authenticator reset authorized</h2>
              <p>Scan this new QR code or enter the manual key in your authenticator app. Keep it private.</p>
              {otpauthUrl && <div style={{ display: "flex", justifyContent: "center", margin: "18px 0" }}><QRCodeSVG value={otpauthUrl} size={220} level="M" includeMargin aria-label="New authenticator QR code" /></div>}
              {totpSecret && <button type="button" className="totp-manual-secret" onClick={() => setShowTotpSecret((visible) => !visible)}><span>New manual setup key</span><input type={showTotpSecret ? "text" : "password"} readOnly value={totpSecret} aria-label="New manual TOTP setup key" tabIndex={-1} /></button>}
              <button className="btn primary full" type="button" onClick={() => router.push(`/welcome?home=${encodeURIComponent(recoveryHome)}`)}>Continue</button>
            </div> : <form className="otp-wait" onSubmit={submitMfa}>
              <button type="button" className="mfa-back-button" onClick={() => { setMfaStep(false); setMfaCode(""); setError(""); }} aria-label="Back to sign in">
                <ArrowLeft size={18} />
              </button>
              <h2>Verify your sign-in</h2>
              <p>{mfaEnrollment ? "Scan the QR code with your authenticator app, then enter the generated six-digit code." : mfaMethod === "email" ? "Enter the six-digit code sent to your email." : "Enter the six-digit code from your authenticator app."}</p>
              {mfaMethod === "email" && <p className="otp-timer" aria-live="polite">{mfaSecondsLeft > 0 ? `You can request a new code in ${mfaSecondsLeft}s.` : "Your code may have expired. Request a new code."}</p>}
              {mfaEnrollment && (
                <div className="form-bottom">
                  <strong>Authenticator setup</strong>
                  <p>Scan the QR code with your authenticator app. If you cannot scan it, use the manual setup key.</p>
                  {otpauthUrl && <div style={{ display: "flex", justifyContent: "center", margin: "18px 0" }}><QRCodeSVG value={otpauthUrl} size={220} level="M" includeMargin aria-label="Authenticator QR code" /></div>}
                  {totpSecret && <button type="button" className="totp-manual-secret" onClick={() => setShowTotpSecret((visible) => !visible)} aria-label="Show or hide manual TOTP setup key">
                    <span>Manual setup key</span>
                    <input type={showTotpSecret ? "text" : "password"} readOnly value={totpSecret} aria-label="Manual TOTP setup key" tabIndex={-1} />
                  </button>}
                </div>
              )}
              {error && <div role="alert" style={{ position: "relative", margin: "12px 0", padding: "14px 42px 14px 14px", borderRadius: 10, border: "1px solid #efb4b4", background: "#fff4f4", color: "#8f1d1d" }}><strong>{error}</strong><button type="button" onClick={() => setError("")} aria-label="Close error" style={{ position: "absolute", top: 8, right: 8, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}><X size={18} /></button></div>}
              <Field label="Authenticator code *">
                <div className="mfa-code-boxes" aria-label="Six-digit authenticator code">
                  {Array.from({ length: 6 }, (_, index) => (
                    <input key={index} ref={(element) => { mfaInputRefs.current[index] = element; }} inputMode="numeric" maxLength={1} value={mfaCode[index] ?? ""} aria-label={`Authenticator digit ${index + 1}`} onKeyDown={(event) => { if (event.key === "Backspace" && !mfaCode[index] && index > 0) mfaInputRefs.current[index - 1]?.focus(); }} onChange={(event) => { const digit = event.target.value.replace(/\D/g, "").slice(-1); const next = mfaCode.split(""); next[index] = digit; setMfaCode(next.join("").slice(0, 6)); if (digit && index < 5) mfaInputRefs.current[index + 1]?.focus(); }} />
                  ))}
                </div>
              </Field>
              <button className="btn primary full" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"} <ArrowRight size={16} /></button>
              {mfaMethod === "email" && <button type="button" className="otp-resend" onClick={resendMfaCode} disabled={mfaSecondsLeft > 0 || mfaResending}>{mfaResending ? "Sending a new code..." : mfaSecondsLeft > 0 ? `Resend code in ${mfaSecondsLeft}s` : "Resend code"}</button>}
              {mfaMethod !== "email" && !mfaEnrollment && <button type="button" className="otp-resend" onClick={() => setMfaRecoveryOpen((open) => !open)}>Lost access to your authenticator?</button>}
              {mfaRecoveryOpen && <div className="form-bottom"><p>Re-enter your account password to generate a new authenticator setup.</p><input type="password" autoComplete="current-password" value={mfaRecoveryPassword} onChange={(event) => setMfaRecoveryPassword(event.target.value)} placeholder="Account password" aria-label="Account password for authenticator recovery" /><button type="button" className="btn" disabled={busy || !mfaRecoveryPassword} onClick={requestLostAuthenticator}>Verify password and generate new key</button></div>}
            </form>
          ) : page === "forgot-password" && otpStep && (
            <form className="otp-wait" onSubmit={continueReset}>
              <span className="auth-icon">
                <LockKeyhole size={20} />
              </span>
              <p className="hp-eyebrow">Account access</p>
              <h2>Enter the code</h2>
              <p>Waiting for the code sent to {resetEmail || "the company email"}. It stays valid for 15 minutes.</p>
              {error && <ErrorState message={error} />}
              <Field label="Code *">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                />
              </Field>
              <p className="otp-timer" aria-live="polite">
                {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "You can resend the code."}
              </p>
              <button className="btn primary full" type="submit">
                Continue reset password <ArrowRight size={16} />
              </button>
              <button
                className="otp-resend"
                type="button"
                disabled={secondsLeft > 0 && !otpRejected}
                onClick={resendOtp}
              >
                Resend code
              </button>
              <p className="form-bottom">
                Wrong email?{" "}
                <button type="button" className="form-link" onClick={() => { setOtpStep(false); setError(""); }}>
                  Change company email
                </button>
              </p>
            </form>
          )}
          {page === "welcome" && welcomeUser ? (
            <div className="welcome-confirmation">
              <span className="welcome-check"><Check size={42} strokeWidth={2.4} /></span>
              <p className="hp-eyebrow">SIGN IN SUCCESSFUL</p>
              <h2>Welcome, {welcomeUser.name}</h2>
              <p className="welcome-lead">Your identity has been verified and you’ve successfully signed in to your workspace.</p>
              <div className="welcome-details">
                <div><Building2 size={22} /><span>Company</span><strong>{welcomeUser.tenantName || (welcomeUser.role === "SUPER_ADMIN" ? "SAIC Platform" : "Company workspace")}</strong></div>
                <div><UserRound size={22} /><span>Role</span><strong>{welcomeUser.role.replaceAll("_", " ")}</strong></div>
                <div><CalendarDays size={22} /><span>Last sign in</span><strong>{welcomeUser.lastLogin ? new Date(welcomeUser.lastLogin).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : "Just now"}</strong></div>
              </div>
              <Link className="btn primary welcome-continue" href={roleHome(welcomeUser.role)}>
                Continue to workspace <ArrowRight size={20} />
              </Link>
              <Link className="welcome-switch" href="/login">Sign in with a different account</Link>
            </div>
          ) : page === "welcome" ? (
            <div className="welcome-session-error">
              <p className="hp-eyebrow">Session unavailable</p>
              <h2>You’re signed in.</h2>
              <p>
                Your session could not be loaded. Please sign in again.
              </p>
              <Link
                className="btn primary"
                href="/login"
              >
                Return to sign in <ArrowRight size={16} />
              </Link>
            </div>
          ) : success ? (
            <div className="success-state">
              <CheckCircle2 size={40} />
              <h2>
                {page === "request-access"
                  ? "Request received"
                  : "You’re all set"}
              </h2>
              <p>{success}</p>
              {page === "request-access" && <Badge>PENDING</Badge>}
              <Link
                className="btn primary"
                href={page === "forgot-password" ? "/reset-password" : "/login"}
              >
                {page === "forgot-password"
                  ? "Continue password reset"
                  : "Continue to login"}
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : otpStep || mfaStep ? null : (
            <form onSubmit={submit}>
              {error && <ErrorState message={error} />}
              {page === "login" && (
                <>
                  <Field label="Company email *">
                    <input
                      type="email"
                      autoComplete="username"
                      placeholder="you@company.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Password *"
                    hint="Enter your account password to continue."
                  >
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                </>
              )}
              {page === "request-access" && (
                <>
                  <div className="form-grid">
                    <Field label="Company name *">
                      <input
                        name="company"
                        required
                        placeholder="Your company Sdn Bhd"
                      />
                    </Field>
                    <Field label="Registration number *">
                      <input
                        name="registration"
                        required
                        placeholder="202601234567"
                      />
                    </Field>
                    <Field label="Contact person / manager *">
                      <input name="contact" required />
                    </Field>
                    <Field label="Company email *">
                      <input
                        name="email"
                        type="email"
                        required
                        defaultValue={params.get("email") ?? ""}
                      />
                    </Field>
                    <Field label="Phone number">
                      <input name="phone" type="tel" />
                    </Field>
                    <Field label="Accounts required *">
                      <input
                        name="accounts"
                        type="number"
                        min="1"
                        max="1000"
                        defaultValue="10"
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Reason / notes">
                    <textarea name="notes" rows={2} />
                  </Field>
                </>
              )}
              {page === "activate" && (
                <>
                  <Field label="Pending invitation">
                    <select
                      required
                      value={activation}
                      onChange={(e) => setActivation(e.target.value)}
                    >
                      <option value="">Select an invitation</option>
                      {accounts
                        ?.filter((a) =>
                          ["INVITED", "INVITATION_EXPIRED"].includes(a.status),
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} · {a.email}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {selected && (
                    <div className="info-box">
                      <strong>{selected.email}</strong>
                      <span>Company: {selected.tenantId}</span>
                      <Badge>{selected.role}</Badge>
                    </div>
                  )}
                </>
              )}
              {page === "forgot-password" && (
                <Field label="Company email *">
                  <input name="email" type="email" required />
                </Field>
              )}
              {["activate", "reset-password"].includes(page) && (
                <div className="password-setup">
                  <div className="password-setup-heading">
                    <strong>Set your password</strong>
                    <span>Use a password only you can guess.</span>
                  </div>
                  <Field label="Create password *">
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  <Field label="Confirm password *">
                    <input
                      required
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                    />
                  </Field>
                  <div className="password-checks" aria-live="polite">
                    <span className="password-checks-title">
                      Password requirements
                    </span>
                    {[
                      "At least 8 characters",
                      "Uppercase letter",
                      "Lowercase letter",
                      "Number",
                      "Special character",
                    ].map((text, i) => (
                      <span
                        className={passwordChecks(password)[i] ? "passed" : ""}
                        key={text}
                      >
                        <Check size={13} />
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button className={`btn primary full${page === "reset-password" ? " reset-submit" : ""}`} disabled={busy}>
                {busy
                  ? "Please wait…"
                  : page === "login"
                    ? "Continue with email"
                    : page === "request-access"
                      ? "Submit company registration"
                      : page === "activate"
                        ? "Activate account"
                        : page === "forgot-password"
                          ? "Request reset"
                          : "Reset password"}
                <ArrowRight size={16} />
              </button>
              {page === "login" && (
                <>
                  <Link href="/forgot-password" className="form-link">
                    Forgot password?
                  </Link>
                  <p className="form-bottom">
                    New to Accounting Intelligence?{" "}
                    <Link href="/request-access">Register company</Link>
                    {" · "}
                    <Link href="/help">Need help?</Link>
                  </p>
                </>
              )}
              {page === "forgot-password" && (
                <p className="form-bottom">
                  Remembered it? <Link href="/login">Back to sign in</Link>
                </p>
              )}
              {page === "request-access" && (
                <p className="form-bottom">
                  Already registered? <Link href="/login">Sign in</Link>
                  {" · "}
                  <Link href="/help">Help & tutorial</Link>
                </p>
              )}
            </form>
          )}
          {page === "request-access" && <div className="secure-note">
            <ShieldCheck size={15} />
            <span>Company registration is reviewed by SAIC before workspace activation.</span>
          </div>}
        </div>
      </main>
    </div>
  );
}
