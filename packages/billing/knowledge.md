# Billing Package

This package contains Codebuff's billing and credit management system.

## Overview

The billing system handles:

- Credit balance calculation and tracking
- Credit grants and resets
- Auto top-up functionality
- Credit grant operations (referrals, purchases, etc.)

## Key Components

- `auto-topup.ts`: Handles automatic credit purchases when balance is low
- `balance-calculator.ts`: Calculates current credit balance and usage
- `constants.ts`: Billing-related constants
- `grant-credits.ts`: Manages credit grant operations
- `utils.ts`: Utility functions for billing operations

## Dependencies

Currently depends on code from the `common` package for:

- Database access (`common/db`)
- Stripe integration (`common/util/stripe`)
- Database schema (`common/db/schema`)
- Types (`common/types/usage`)
- Date utilities (`common/util/date`)
- Transaction handling (`common/db/transaction`)

These dependencies will be maintained through TypeScript path mappings until they are migrated to their own packages.
