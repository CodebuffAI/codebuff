/**
 * Credits and Referral Row Component
 * Handles the layout of credits display and optional referral button
 */

interface CreditsAndReferralRowProps {
  /** Credits display component */
  credits: React.ReactNode;
  /** Referral button component (can be AnimatePresence with conditional children) */
  referral: React.ReactNode;
}

export function CreditsAndReferralRow({
  credits,
  referral,
}: CreditsAndReferralRowProps) {
  return (
    <div className="flex min-h-[60px] items-end gap-3">
      {/* Agent Credits */}
      {credits}

      {/* Compact Referral Section - AnimatePresence handles show/hide */}
      {referral}
    </div>
  );
}
