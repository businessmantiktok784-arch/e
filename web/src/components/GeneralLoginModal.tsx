import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Lock,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { loginExpert } from '../services/expertApi.js';
import { requestCode, verifyCode } from '../services/communityAuth.js';
import type { ExpertUser } from '../types/expert.js';
import type { CommunityUser } from '../types/communityPosts.js';

/** How long a contributor waits before they can request another code. */
const RESEND_COOLDOWN_SECONDS = 30;

interface GeneralLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** A WhatsApp contributor finished verifying: route to My Earth Talk. */
  onUserLogin: (user: CommunityUser) => void;
  /** The administrator signed in: route to Expert reviews. */
  onAdminLogin: (expert: ExpertUser) => void;
}

/**
 * One sign-in surface for both audiences.
 *
 * A contributor signs in with the WhatsApp phone number they used for Earth
 * Talk and a one-time code - there is no password. The administrator signs in
 * with the configured administrator email and password. The single credential
 * field decides which of the two it is by its shape, so there is one entry
 * point rather than two separate portals, and the destination is chosen by what
 * the backend returns: a contributor lands on My Earth Talk, the administrator
 * on Expert reviews. No account is invented here; both paths call the same
 * authenticated endpoints the platform already exposes.
 */
export const GeneralLoginModal: React.FC<GeneralLoginModalProps> = ({
  isOpen,
  onClose,
  onUserLogin,
  onAdminLogin,
}) => {
  const [step, setStep] = useState<'credential' | 'code'>('credential');
  const [credential, setCredential] = useState('');
  const [passcode, setPasscode] = useState('');
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const credentialInputRef = useRef<HTMLInputElement>(null);

  // A fresh code can be requested again after a short cooldown, so a contributor
  // who never received the first message is not stuck waiting out its whole
  // lifetime. The countdown is purely the button's gate; the server still
  // enforces its own per-number rate limit.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  // Return the caret to the credential field whenever the first step is shown,
  // so going back to enter a different number is ready to type immediately.
  useEffect(() => {
    if (isOpen && step === 'credential') credentialInputRef.current?.focus();
  }, [isOpen, step]);

  const isEmail = credential.includes('@');

  if (!isOpen) return null;

  const reset = () => {
    setStep('credential');
    setCredential('');
    setPasscode('');
    setCode('');
    setDelivery(null);
    setHint(null);
    setExpiresIn(null);
    setError(null);
    setIsLoading(false);
    setResendIn(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmail) {
      const email = credential;
      if (!email.trim()) {
        setError('Please enter the administrator email address');
        return;
      }
      if (!passcode) {
        setError('Please enter the administrator password');
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await loginExpert(email.trim(), passcode);
        onAdminLogin(res.expert);
        handleClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const digits = credential.replace(/\D/g, '');
    if (!digits) {
      setError('Enter the phone number you used for Earth Talk.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await requestCode(credential.trim());
      setDelivery(result.delivery);
      setExpiresIn(result.expires_in_seconds);
      setHint(result.message);
      setStep('code');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (!digits) {
      setError('Enter the code you received on WhatsApp.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const resolved = await verifyCode(credential.trim(), code.trim());
      onUserLogin(resolved.user);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The code could not be verified.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await requestCode(credential.trim());
      setDelivery(result.delivery);
      setExpiresIn(result.expires_in_seconds);
      setHint(result.message);
      setCode('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Abandons the code step and clears everything tied to the number that was
  // tried, so the next attempt genuinely starts from a blank credential.
  const handleUseDifferentNumber = () => {
    setStep('credential');
    setCredential('');
    setPasscode('');
    setCode('');
    setDelivery(null);
    setHint(null);
    setExpiresIn(null);
    setResendIn(0);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to Earth Talk"
        className="relative w-full max-w-md bg-white border border-[#e3e3e3] rounded-xl shadow-[var(--g-elev-3)] overflow-hidden text-[#1f1f1f]"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e3e3e3]">
          <div className="flex items-center space-x-3">
            <img
              src="/icon.png"
              alt="Earth Talk"
              className="h-10 w-10 shrink-0 rounded-xl object-contain select-none"
            />
            <div>
              <h2 className="text-lg font-medium text-[#1f1f1f]">Sign in to Earth Talk</h2>
              <p className="text-xs text-[#5e5e5e]">
                {step === 'code'
                  ? 'Enter the code we sent you'
                  : isEmail
                    ? 'Administrator sign in'
                    : 'Contributor sign in with WhatsApp'}
              </p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" className="g-icon-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-[#ffdad8] border border-[#d32f28]/30 text-[#c5221f] text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'credential' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-credential" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                  Phone number or administrator email
                </label>
                <div className="relative">
                  <input
                    id="login-credential"
                    ref={credentialInputRef}
                    type="text"
                    inputMode={isEmail ? 'email' : 'tel'}
                    placeholder="+250 7__ ___ ____ or you@example.org"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    autoComplete="username"
                    className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] placeholder-[#8f8f8f] text-sm focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
                  />
                  {isEmail ? (
                    <ShieldCheck className="w-4 h-4 text-[#8f8f8f] absolute right-3.5 top-3.5" />
                  ) : (
                    <Smartphone className="w-4 h-4 text-[#8f8f8f] absolute right-3.5 top-3.5" />
                  )}
                </div>
                {!isEmail && (
                  <p className="mt-1.5 text-[11px] text-[#5e5e5e]">
                    A six-digit code is sent to this WhatsApp number. Contributors need no password.
                  </p>
                )}
              </div>

              {isEmail && (
                <div>
                  <label htmlFor="login-passcode" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                    Administrator password
                  </label>
                  <div className="relative">
                    <input
                      id="login-passcode"
                      type="password"
                      placeholder="••••••••••••"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      autoComplete="current-password"
                      className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] placeholder-[#8f8f8f] text-sm focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
                    />
                    <Lock className="w-4 h-4 text-[#8f8f8f] absolute right-3.5 top-3.5" />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="g-btn g-btn-filled w-full disabled:opacity-50"
              >
                {isLoading ? (
                  <span>{isEmail ? 'Authenticating…' : 'Requesting code…'}</span>
                ) : isEmail ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign in</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4" />
                    <span>Send me a code</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label htmlFor="login-code" className="block text-xs font-medium text-[#3c4043] mb-1.5">
                  Six-digit verification code
                </label>
                <input
                  id="login-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#c7c7c7] text-center tracking-[0.5em] text-[#1f1f1f] placeholder-[#c7c7c7] text-lg font-medium focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
                />
                {delivery === 'development_console' && (
                  <p className="mt-1.5 text-[11px] text-[#5e5e5e]">
                    Development build: the code is printed in the server console, because no WhatsApp
                    provider is configured on this deployment.
                  </p>
                )}
                {hint && delivery !== 'development_console' && (
                  <p className="mt-1.5 text-[11px] text-[#5e5e5e]">{hint}</p>
                )}
                {expiresIn !== null && (
                  <p className="mt-1 text-[11px] text-[#5e5e5e]">
                    The code expires in {expiresIn} second{expiresIn === 1 ? '' : 's'}.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="g-btn g-btn-filled w-full disabled:opacity-50"
              >
                {isLoading ? (
                  <span>Verifying…</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign in</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading || resendIn > 0}
                className="g-btn g-btn-tonal w-full disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </span>
              </button>

              <button
                type="button"
                className="g-btn g-btn-text w-full text-[13px]"
                onClick={handleUseDifferentNumber}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Use a different number</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
