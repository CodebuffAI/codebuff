"use client";

import React from "react";

type RatingColor = "green" | "yellow" | "red";

interface StarRatingProps {
  color: RatingColor;
  fullStars: number;
  partialStar?: number;
  starSize?: number;
  className?: string;
}

interface ReviewScoreStripProps extends StarRatingProps {
  rating: string;
  count?: string;
  textSize?: number;
  textWeight?: number;
  className?: string;
}

interface ReviewReplicaCardProps extends StarRatingProps {
  avatarText: string;
  avatarBg: string;
  avatarTextColor?: string;
  avatarSize?: number;
  avatarFontSize?: number;
  reviewerName: string;
  reviewerMeta: string;
  reviewDate: string;
  title?: string;
  body: string;
  className?: string;
}

const COLOR_BY_RATING: Record<RatingColor, string> = {
  green: "#00B67A",
  yellow: "#FBCF24",
  red: "#FF3722",
};

const EMPTY_STAR_BG = "#DCDDDE";

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const TrustStarIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{
      width: Math.round(size * 0.62),
      height: Math.round(size * 0.62),
    }}
  >
    <path
      fill="#FFFFFF"
      d="M12 1.8l2.95 6.07 6.7.99-4.84 4.72 1.15 6.65L12 17.1l-5.96 3.13 1.14-6.65L2.35 8.86l6.7-.99L12 1.8z"
    />
  </svg>
);

const StarCell: React.FC<{ size: number; fill: number; color: string }> = ({
  size,
  fill,
  color,
}) => (
  <div
    className="relative overflow-hidden rounded-[1px]"
    style={{ width: size, height: size }}
  >
    <div
      className="absolute inset-0"
      style={{
        backgroundColor: EMPTY_STAR_BG,
      }}
    />
    <div
      className="absolute inset-y-0 left-0"
      style={{
        width: `${Math.round(clamp(fill) * 100)}%`,
        backgroundColor: color,
      }}
    />
    <div className="absolute inset-0 flex items-center justify-center">
      <TrustStarIcon size={size} />
    </div>
  </div>
);

export const StarRating: React.FC<StarRatingProps> = ({
  color,
  fullStars,
  partialStar = 0,
  starSize = 22,
  className = "",
}) => {
  const fillColor = COLOR_BY_RATING[color];

  return (
    <div className={`flex items-center gap-[1px] ${className}`}>
      {Array.from({ length: 5 }, (_, index) => {
        let fill = 0;

        if (index < fullStars) {
          fill = 1;
        } else if (index === fullStars) {
          fill = partialStar;
        }

        return (
          <StarCell key={index} size={starSize} fill={fill} color={fillColor} />
        );
      })}
    </div>
  );
};

export const ReviewScoreStrip: React.FC<ReviewScoreStripProps> = ({
  rating,
  count,
  textSize = 16,
  textWeight = 500,
  className = "",
  ...starRatingProps
}) => (
  <div className={`inline-flex items-center gap-2 ${className}`}>
    <StarRating {...starRatingProps} />
    <span
      className="leading-none tracking-[-0.02em] text-foreground/85"
      style={{ fontSize: textSize, fontWeight: textWeight }}
    >
      {rating}
      {count ? ` (${count})` : ""}
    </span>
  </div>
);

export const ReviewReplicaCard: React.FC<ReviewReplicaCardProps> = ({
  avatarText,
  avatarBg,
  avatarTextColor = "#1A1A1A",
  avatarSize = 32,
  avatarFontSize = 16,
  reviewerName,
  reviewerMeta,
  reviewDate,
  title,
  body,
  className = "",
  ...starRatingProps
}) => (
  <article
    className={`w-full rounded-xl border border-border bg-card p-4 text-left shadow-lg shadow-black/20 ${className}`}
  >
    <div className="mb-3 flex items-start justify-between gap-1.5 sm:gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="flex shrink-0 items-center justify-center rounded-full font-semibold"
          style={{
            backgroundColor: avatarBg,
            color: avatarTextColor,
            width: avatarSize,
            height: avatarSize,
            fontSize: avatarFontSize,
            lineHeight: 1,
          }}
        >
          {avatarText}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium leading-[1.2] text-foreground">
            {reviewerName}
          </p>
          <p className="text-[12px] leading-[1.25] text-muted-foreground">
            {reviewerMeta}
          </p>
        </div>
      </div>
      <p className="shrink-0 pt-0.5 text-[12px] leading-none text-muted-foreground">
        {reviewDate}
      </p>
    </div>

    <StarRating {...starRatingProps} starSize={13} className="mb-3" />

    {title ? (
      <p className="mb-2.5 text-[14px] font-medium leading-[1.35] text-foreground">
        {title}
      </p>
    ) : null}
    <p className="text-[13px] leading-[1.55] text-foreground/85">{body}</p>
  </article>
);
