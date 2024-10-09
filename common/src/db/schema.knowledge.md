# Database Schema Design Principles

## General Guidelines

- Prefer simplicity and efficiency in schema design.
- Reuse existing fields when possible instead of creating new ones.
- Use composite primary keys where appropriate to avoid unnecessary unique identifiers.

## Specific Fields

### User Table

- `quota`: This field is used to track user credits. It should be used for features like referral rewards instead of creating a separate credits field.
- `referral_code`: Store the user's referral code in the user table rather than in a separate referrals table.

## Referrals Table Design

When implementing a referrals system:

- Use a composite primary key of `referrer_id` and `referred_id` instead of a separate unique identifier.
- Avoid duplicating information that can be stored in the user table (e.g., referral_code).
- Utilize the existing `quota` field in the user table for tracking and updating referral rewards.

