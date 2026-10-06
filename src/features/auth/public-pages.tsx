"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { LandingPage } from "@/features/auth/landing-page";
import { Badge, Field, ErrorState, LoadingState } from "@/components/common/ui";
import { HelpCenter } from "@/features/common/help/help-center";
import {
  activateAccount,
  getCurrentUser,
  getResetStatus,
  verifyResetCode,
  requestCompanyAccess,
  login,
  verifyMfa,
  passwordChecks,
  requestPasswordReset,
  resetPassword,
  isFrontendMockAuthEnabled,
} from "@/lib/api/auth.service";
import { roleHome } from "@/lib/permissions";

function MfaCodeInput({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");
  const update = (index: number, next: string) => {
    const clean = next.replace(/\D/g, "");
    const nextDigits = digits.slice();
    if (!clean) {
      nextDigits[index] = "";
      onChange(nextDigits.join("").replace(/\s+$/, ""));
      return;
    }
    clean.slice(0, 6 - index).split("").forEach((digit, offset) => { nextDigits[index + offset] = digit; });
    onChange(nextDigits.join("").slice(0, 6));
    refs.current[Math.min(index + clean.length, 5)]?.focus();
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    onChange(event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6));
    refs.current[Math.min(event.clipboardData.getData("text").replace(/\D/g, "").length, 5)]?.focus();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      const next = digits.slice(); next[index - 1] = ""; onChange(next.join("").trimEnd()); refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    else if (event.key === "ArrowRight" && index < 5) refs.current[index + 1]?.focus();
  };
  return <div className="mfa-code-input" role="group" aria-label="Six-digit authenticator code">
    {digits.map((digit, index) => <input key={index} ref={(element) => { refs.current[index] = element; }}
      aria-label={`Authenticator digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"}
      maxLength={1} pattern="[0-9]" value={digit} disabled={disabled}
      onChange={(event) => update(index, event.target.value)} onPaste={paste} onKeyDown={(event) => keyDown(event, index)} />)}
  </div>;
}

export function PublicPage({ page }: { page: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const activation = params.get("token") ?? "";
  const [resetReady, setResetReady] = useState(false);
  const [welcomeUser, setWelcomeUser] = useState<Awaited<ReturnType<typeof getCurrentUser>>>(null);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaSetup, setMfaSetup] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<"totp" | "email">("totp");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaOtpAuthUrl, setMfaOtpAuthUrl] = useState("");
  const [manualKeyVisible, setManualKeyVisible] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSecondsLeft, setMfaSecondsLeft] = useState(60);
  const titles: Record<string, string> = {
    login: "Welcome back",
    welcome: "Welcome!",
    "request-access": "Register your company",
    activate: "Activate your account",
    "forgot-password": "Forgot your password?",
    "reset-password": "Create a new password",
    help: "Help & support",
  };
  useEffect(() => {
    let cancelled = false;
    if (page === "reset-password") {
      getResetStatus().then(() => { if (!cancelled) setResetReady(true); })
        .catch(() => { if (!cancelled) router.replace("/forgot-password"); });
    }
    if (page === "welcome") {
      getCurrentUser().then((user) => {
        if (cancelled) return;
        if (user) setWelcomeUser(user);
        else router.replace("/login");
      }).catch(() => { if (!cancelled) router.replace("/login"); });
    }
    return () => { cancelled = true; };
  }, [page, router]);
  useEffect(() => {
    if (!mfaStep || mfaMethod !== "email") return;
    const timer = window.setInterval(() => setMfaSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [mfaStep, mfaMethod]);
  useEffect(() => {
    if (!otpStep) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpStep]);

  async function resendOtp() {
    if (busy || secondsLeft > 0) return;
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(resetEmail);
      setOtp("");
      setSecondsLeft(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend code.");
    } finally { setBusy(false); }
  }

  async function continueReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await verifyResetCode(resetEmail, otp.trim());
      router.push("/reset-password");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to verify code.");
    } finally { setBusy(false); }
  }

  async function continueMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const verifiedUser = await verifyMfa(mfaCode);
      // Accountants continue directly to the mandatory first-password screen
      // after email MFA; privileged TOTP users retain the welcome handoff.
      router.push(verifiedUser.mustChangePassword !== false ? roleHome(verifiedUser.role) : "/welcome");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to verify authenticator code.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      if (page === "login") {
        const result = await login(email, password);
        if ("mfaRequired" in result) {
          setMfaSetup(result.enrollmentRequired);
          setMfaMethod(result.mfaMethod ?? "totp");
          setMfaSecondsLeft(60);
          setMfaSecret(result.totpSecret ?? "");
          setMfaOtpAuthUrl(result.otpauthUrl ?? "");
          setManualKeyVisible(false);
          setMfaCode("");
          setMfaStep(true);
        } else {
          router.push("/welcome");
        }
      } else if (page === "request-access") {
        await requestCompanyAccess({
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
  if (page === "welcome" && !welcomeUser) return <LoadingState />;
  if (page === "reset-password" && !resetReady) return <LoadingState />;
  if (page === "help")
    return (
      <div className="home-wash auth-wash help-wash">
        <header className="hp-header">
          <Link href="/" className="hp-brand">
            Accounting
            <span>Intelligence.</span>
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
    <div className="home-wash auth-wash">
      <header className="hp-header">
        <Link href="/" className="hp-brand">
          Accounting
          <span>Intelligence.</span>
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
            : accessPage
              ? "hp-hero auth-hero"
              : "auth-stage"
        }
      >
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
        {accessPage && (
          <div>
            <p className="hp-eyebrow">Company accounting intelligence</p>
            <p className="hp-quiet">
              {page === "login" && mfaStep
                ? "Complete the authenticator check"
                : page === "login"
                ? "SAIC secure · company email opens the workspace"
                : otpStep
                  ? "Waiting for the code from the company email"
                  : "Reset stays inside this workspace"}
            </p>
            <h1>
              {page === "login" && mfaStep ? (
                <>
                  Complete the <span>{mfaMethod === "email" ? "email code check." : "authenticator check."}</span>
                </>
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
              {page === "login" && mfaStep
                ? mfaSetup
                  ? "Privileged accounts require an authenticator app. Add this account using the setup key, then enter the current six-digit code."
                  : "Enter the current six-digit code from your authenticator app."
                : page === "login"
                ? "From invoice to trusted record."
                : otpStep
                  ? "The code is valid for 10 minutes."
                  : "Use the company email on the account."}
            </p>
            <p className="hp-copy">
              {page === "login" && mfaStep
                ? "Your company account needs one more security check. Scan the QR code with your authenticator app, then enter the six-digit code it generates."
                : page === "login"
                ? "Enter the company email you were issued. That address opens the right workspace. People are invited; there is no public self-signup."
                : otpStep
                  ? "Enter the code from your email, then continue to choose a new password."
                  : "Enter your account email. If it belongs to an active account, we will email you a reset code."}
            </p>
          </div>
        )}
        <div
          className={`auth-card${page === "request-access" ? " register-card" : ""}${page === "login" ? " login-card" : ""}${page === "forgot-password" ? " reset-card" : ""}`}
        >
          {!accessPage && page !== "request-access" && (
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
          {page === "forgot-password" && otpStep && (
            <form className="otp-wait" onSubmit={continueReset}>
              <span className="auth-icon">
                <LockKeyhole size={20} />
              </span>
              <p className="hp-eyebrow">Account access</p>
              <h2>Enter the code</h2>
              <p>If {resetEmail || "the company email"} belongs to an active account, a code has been sent. It stays valid for 10 minutes.</p>
              {error && <ErrorState message={error} />}
              <Field label="Code *">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="6-digit code"
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                />
              </Field>
              <p className="otp-timer" aria-live="polite">
                {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "You can resend the code."}
              </p>
              <button className="btn primary full" type="submit" disabled={busy}>
                Continue reset password <ArrowRight size={16} />
              </button>
              <button
                className="otp-resend"
                type="button"
                disabled={busy || secondsLeft > 0}
                onClick={resendOtp}
              >
                Resend code
              </button>
              <p className="form-bottom">
                Wrong email?{" "}
                <button type="button" className="form-link" disabled={busy} onClick={() => { setOtpStep(false); setError(""); }}>
                  Change company email
                </button>
              </p>
            </form>
          )}
          {page === "login" && mfaStep && (
            <form className="otp-wait" onSubmit={continueMfa}>
              <span className="auth-icon">
                <ShieldCheck size={20} />
              </span>
              <p className="hp-eyebrow">Privileged account security</p>
              <h2>{mfaMethod === "email" ? "Enter the email code." : mfaSetup ? "Set up your authenticator." : "Enter your authenticator code."}</h2>
              {mfaMethod === "email" ? <p className="mfa-setup">A six-digit sign-in code was sent to the accountant email on your account. It expires in 60 seconds. Code expires in <strong>00:{String(mfaSecondsLeft).padStart(2, "0")}</strong>.</p> : mfaSetup && (
                <div className="mfa-setup">
                  <p>
                    Scan the QR code with your authenticator app. Then enter the current six-digit code it displays.
                  </p>
                  <Field label="Authenticator setup key">
                    {mfaOtpAuthUrl && <div className="mfa-qr-wrap"><QRCodeSVG value={mfaOtpAuthUrl} size={176} includeMargin level="M" aria-label="Authenticator QR code" /></div>}
                    <p className="mfa-manual-title">Can&apos;t scan the QR code?</p>
                    <p className="mfa-manual-copy">Enter this setup key manually in your authenticator app.</p>
                    <button type="button" className={`mfa-secret-reveal${manualKeyVisible ? " revealed" : ""}`} onClick={() => setManualKeyVisible((visible) => !visible)} aria-label={manualKeyVisible ? "Hide setup key" : "Reveal setup key"}>
                      <code className="mfa-secret">{mfaSecret}</code>
                    </button>
                  </Field>
                </div>
              )}
              {error && <ErrorState message={error} />}
              <Field
                label={mfaMethod === "email" ? "Email code *" : "Authenticator code *"}
                hint={mfaMethod === "email" ? "Enter the six-digit code sent to the accountant email on your account." : "Enter the current six-digit code from your authenticator app."}
              >
                <MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={busy} />
                <input className="sr-only" tabIndex={-1} required value={mfaCode} onChange={() => undefined} aria-hidden="true" />
              </Field>
              <button className="btn primary full" type="submit" disabled={busy}>
                {busy ? "Please wait…" : mfaSetup ? "Enable and sign in" : "Verify and sign in"}
                <ArrowRight size={16} />
              </button>
              <p className="form-bottom">
                <button
                  type="button"
                  className="form-link"
                  disabled={busy}
                  onClick={() => {
                    setMfaStep(false);
                    setMfaSecret("");
                    setMfaOtpAuthUrl("");
                    setManualKeyVisible(false);
                    setMfaCode("");
                    setError("");
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </form>
          )}
          {page === "welcome" ? (
            <div className="success-state">
              <CheckCircle2 size={40} />
              <h2>Successful and welcome!</h2>
              <p>
                Welcome{welcomeUser ? `, ${welcomeUser.name}` : ""}.
                Your secure workspace is ready.
              </p>
              <Link
                className="btn primary"
                href={welcomeUser ? roleHome(welcomeUser.role) : "/login"}
              >
                Continue to dashboard <ArrowRight size={16} />
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
              {isFrontendMockAuthEnabled && (
                <div className="hp-copy" role="note">
                  <strong>Frontend mock sign-in is active.</strong>
                  <br />
                  Enter one of these sample emails and any non-empty password:
                  <br />
                  Super Admin: admin@saic.example
                  <br />
                  Local Admin: alice@abc.example
                  <br />
                  Accountant: rachel@abc.example
                  <br />
                  This tests frontend role routing only; it does not test backend authentication.
                </div>
              )}
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
              {page === "activate" && !activation && (
                <ErrorState message="Open the activation link provided by your administrator." />
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
                    <span>Use a unique password that is difficult to guess.</span>
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
              <button className={`btn primary full${page === "reset-password" ? " reset-submit" : ""}`} disabled={busy || (page === "reset-password" && !resetReady) || (page === "activate" && !activation)}>
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
          <div className="secure-note">
            <ShieldCheck size={15} />
            <span>
              {page === "request-access"
                ? "Company registration is reviewed by SAIC before workspace activation."
                : "Your account access is protected by your company credentials."}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
