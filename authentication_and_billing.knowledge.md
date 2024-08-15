# Authentication and Billing System for Manicode

## Overview

This document outlines the planned features and implementation strategy for adding authentication, database integration, and billing features to the Manicode project.

## Planned Features

1. Authentication for the console app
2. Database integration (PostgreSQL)
3. OAuth integration (Google and GitHub)
4. Referral system
5. Stripe integration for billing
6. Usage tracking and limits

## Implementation Details

### 1. Authentication for Console App

- Implement user authentication in the console application
- Store user credentials securely in the database
- Provide login/logout functionality

### 2. Database Integration (PostgreSQL)

- Set up a PostgreSQL database on Google Cloud SQL
- Database name: manicode
- Host: [Your Cloud SQL instance IP]
- Port: 5432
- User: [Your database user]
- Password: [Your database password]
- Create tables for user information, referrals, and usage data
- Implement database connection and query functions in the backend (see backend/src/db.ts)

### 3. OAuth Integration (Google and GitHub)

- Implement OAuth flow for Google and GitHub
- Create a simple web interface for OAuth redirection
- Handle OAuth callback and token storage

### 4. Referral System

- Generate unique referral links for users
- Track referrals and associate them with user accounts
- Implement a system to award credits based on successful referrals ($10 per referral)

### 5. Stripe Integration for Billing

- Set up Stripe account and integrate Stripe API
- Implement payment processing for paid plans
- Store billing information securely

### 6. Usage Tracking and Limits

- Implement a system to track user usage (e.g., API calls, processing time)
- Enforce usage limits based on user plan (e.g., $10 of credits for free tier)
- Notify users when approaching usage limits
- Implement automatic plan upgrades or service suspension when limits are reached

## Implementation Plan

1. Set up PostgreSQL database
   - Create database schema
   - Implement database connection in the backend

2. Implement basic authentication for console app
   - Create user registration and login functionality
   - Store user credentials securely in the database

3. Develop simple web interface for OAuth
   - Set up a basic web server
   - Create login page with Google and GitHub options

4. Implement OAuth flow
   - Handle OAuth redirects and callbacks
   - Store OAuth tokens securely

5. Integrate OAuth with console app
   - Implement browser redirection from console app
   - Handle OAuth token retrieval and storage

6. Develop referral system
   - Generate and store referral links
   - Track referrals and associate with user accounts

7. Implement usage tracking
   - Create system to log and calculate user usage
   - Store usage data in the database

8. Integrate Stripe for billing
   - Set up Stripe account and API integration
   - Implement payment processing for paid plans

9. Enforce usage limits
   - Implement checks for usage limits
   - Create notification system for approaching limits
   - Develop automatic plan upgrades or service suspension

10. Refine and test the entire system
    - Conduct thorough testing of all components
    - Optimize performance and security

## Considerations

- Security: Ensure all user data, especially authentication and billing information, is encrypted and stored securely.
- Scalability: Design the database and backend to handle a growing number of users and increased usage.
- User Experience: Make the authentication process as smooth as possible, especially when redirecting to the browser for OAuth.
- Error Handling: Implement robust error handling and provide clear feedback to users.
- Documentation: Keep documentation up-to-date as new features are implemented.
