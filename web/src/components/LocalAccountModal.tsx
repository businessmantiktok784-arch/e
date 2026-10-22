import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, MessageCircle, UserRound, X } from 'lucide-react';
import {
  CONTRIBUTOR_ROLES,
  signInLocalAccount,
  useLocalAccount,
  type LocalAccount,
} from '../services/localAccount.js';

interface LocalAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the created account so the caller can continue what it was doing. */
  onSignedIn?: (account: LocalAccount) => void;
  /** Opens the WhatsApp-verified sign-in when the reader prefers it. */
  onUseWhatsApp?: () => void;
}

/**
 * Sign-in for Community Discovery.
 *
 * Community Discovery is read-only until a reader signs in. This is the
 * low-friction path: a display name and, optionally, how they are involved in
 * geoscience. No phone number, no password and no personal data - the identity
 * lives only in this browser. A reader who wants the WhatsApp-verified account
 * (to own posts on the map) can switch to it instead.
 */
export const LocalAccountModal: React.FC<LocalAccountModalProps> = ({
  isOpen,
  onClose,
  onSignedIn,
  onUseWhatsApp,
}) => {
  const existing = useLocalAccount();
  const [name, setName] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(existing?.display_name ?? '');
    setRole(existing?.role ?? null);
    setError(null);
    const timer = window.setTimeout(() => nameRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, existing]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter the name you want shown with your contributions.');
      return;
    }
    try {
      const account = signInLocalAccount(name, role);
      onSignedIn?.(account);
      onClose();
    } catch {
      setError('Your details could not be saved in this browser.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to contribute"
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
              <h2 className="text-lg font-medium text-[#1f1f1f]">Join the discussion</h2>
              <p className="text-xs text-[#5e5e5e]">Reading is open to everyone. Contributing needs an identity.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="g-icon-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3] text-xs text-[#5e5e5e] leading-relaxed">
            <UserRound className="w-4 h-4 mt-0.5 shrink-0 text-[#3c4043]" aria-hidden="true" />
            <span>
              Your name stays in this browser. It is used to identify your own contributions to you,
              such as on your reputation panel. What other people see is a pseudonymous handle
              derived from a random token in this browser, such as &quot;Field Explorer #A82F&quot; -
              never your name. You can change it at any time.
            </span>
          </div>

          {error && (
            <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-[#ffdad8] border border-[#d32f28]/30 text-[#c5221f] text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="local-account-name" className="block text-xs font-medium text-[#3c4043] mb-1.5">
              Display name
            </label>
            <input
              id="local-account-name"
              ref={nameRef}
              type="text"
              maxLength={60}
              placeholder="e.g. Aline M. or Field Explorer"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] placeholder-[#8f8f8f] text-sm focus:outline-none focus:border-[#0b57d0] focus:shadow-[inset_0_0_0_1px_#0b57d0]"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[#3c4043] mb-1.5">
              How are you involved? <span className="font-normal text-[#8f8f8f]">(optional)</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CONTRIBUTOR_ROLES.map((option) => {
                const selected = role === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRole(selected ? null : option)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      selected
                        ? 'bg-[#2b7f3f] border-[#2b7f3f] text-white'
                        : 'bg-white border-[#c7c7c7] text-[#3c4043] hover:bg-[#f0f4f9]'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-[#8f8f8f]">
              Kept in this browser and shown only to you. It is never treated as proof of expertise.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              className="g-btn g-btn-filled h-10 px-4 text-sm"
            >
              Continue
            </button>
            {onUseWhatsApp && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onUseWhatsApp();
                }}
                className="inline-flex items-center gap-1.5 text-xs text-[#0b57d0] hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                Sign in with WhatsApp instead
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

/** Small inline affordance shown where a signed-out reader may not act. */
export const SignedOutNotice: React.FC<{ onSignIn: () => void; verb?: string }> = ({
  onSignIn,
  verb = 'take part',
}) => (
  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5e5e5e]">
    <span>You are reading as a visitor. To {verb},</span>
    <button
      type="button"
      onClick={onSignIn}
      className="inline-flex items-center gap-1 text-[#0b57d0] hover:underline font-medium"
    >
      <ArrowLeft className="w-3 h-3 rotate-180" aria-hidden="true" />
      sign in first
    </button>
  </div>
);
