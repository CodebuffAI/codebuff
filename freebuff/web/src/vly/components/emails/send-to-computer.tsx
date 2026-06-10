import React from "react";

interface TicketReplyEmailProps {
  recipientName: string;
  ticketTitle: string;
  messageContent: string;
  ticketUrl: string;
}

export const TicketReplyEmail: React.FC<Readonly<TicketReplyEmailProps>> = ({
  recipientName,
  ticketTitle,
  messageContent,
  ticketUrl,
}) => (
  <div
    style={{
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      color: "#1f2937",
      background: "#f3f4f6",
      padding: "40px 20px",
    }}
  >
    <div
      style={{
        maxWidth: "600px",
        margin: "0 auto",
        background: "white",
        borderRadius: "8px",
        padding: "40px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      {/* Alert Banner */}
      <div
        style={{
          background: "#f59e0b",
          color: "#78350f",
          padding: "16px 20px",
          borderRadius: "8px",
          marginBottom: "24px",
          fontSize: "14px",
          fontWeight: "500",
        }}
      >
        New reply on your ticket: "{ticketTitle}"
      </div>

      {/* Greeting */}
      <p style={{ margin: "0 0 20px 0", fontSize: "15px", color: "#1f2937" }}>
        Hi {recipientName},
      </p>

      <p
        style={{
          margin: "0 0 24px 0",
          fontSize: "15px",
          lineHeight: "1.6",
          color: "#4b5563",
          background: "#f3f4f6",
          padding: "8px 12px",
          borderRadius: "4px",
        }}
      >
        Unread Message
      </p>
      {/* Message Content */}
      <p
        style={{
          margin: "0 0 24px 0",
          fontSize: "15px",
          lineHeight: "1.6",
          color: "#4b5563",
        }}
      >
        {messageContent}
      </p>

      {/* CTA Button */}
      <div style={{ textAlign: "center", margin: "32px 0" }}>
        <a
          href={ticketUrl}
          style={{
            display: "inline-block",
            background: "#2563eb",
            color: "white",
            padding: "12px 32px",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "15px",
            fontWeight: "600",
          }}
        >
          View Ticket
        </a>
      </div>
      {/* Footer */}
      <div
        style={{
          color: "#9ca3af",
          fontSize: "13px",
          marginTop: "40px",
          paddingTop: "24px",
          borderTop: "1px solid #e5e7eb",
          textAlign: "center",
        }}
      >
        <p style={{ margin: "0" }}>
          This is an automated message from Freebuff Web support system. Please do not
          reply to this email.
        </p>
      </div>
    </div>
  </div>
);

function formatCreditsForEmail(credits: number): string {
  if (credits >= 1_000_000) {
    const m = credits / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    const k = credits / 1_000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return credits.toLocaleString();
}

interface BountySubmissionResultEmailProps {
  recipientName: string;
  bountyTitle: string;
  approved: boolean;
  rewardAmount: number;
}

export const BountySubmissionResultEmail: React.FC<
  Readonly<BountySubmissionResultEmailProps>
> = ({ recipientName, bountyTitle, approved, rewardAmount }) => (
  <div>
    <p>Hi {recipientName},</p>

    <p>
      {approved ? (
        <>
          Your submission for the bounty "{bountyTitle}" has been approved. You
          have been awarded {formatCreditsForEmail(rewardAmount)} credits.
        </>
      ) : (
        <>
          Your submission for the bounty "{bountyTitle}" was not approved and no
          reward was granted.
        </>
      )}
    </p>

    <p>This is an automated reply. Please do not reply to this email.</p>
    <p>
      <a href="https://discord.gg/yXG3w7wxfs">Join Discord</a> to contact the
      founders.
    </p>
  </div>
);
