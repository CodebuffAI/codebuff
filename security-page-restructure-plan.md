# Security Page Restructure Plan

## Overview
Split the current security page into two separate pages:
1. **API Keys page** (`/api-keys`) - for Personal Access Token (PAT) management
2. **Profile page** (`/profile`) - with a security section for active sessions

## Changes Required

### 1. Create API Keys Page (`/api-keys`)
- Move PAT creation, listing, and revocation functionality from security page
- Rename all "Personal Access Token" to "API Key" in UI text
- Keep existing functionality but with updated terminology
- Update page title, descriptions, and button text

### 2. Create Profile Page (`/profile`) 
- Create new profile page with tabbed interface:
  - **Usage tab** - move current usage page content (usage display, credit management)
  - **Security tab** - move active sessions management (web/CLI tabs) from security page
  - **Referrals tab** - move referral functionality from separate page
- Keep all existing functionality from moved pages
- Profile tab and Affiliate tab to be added later

### 3. Update Navigation
- Update user dropdown: replace "Security", "Usage", and "Referrals" with single "Profile" link
- Add "API Keys" link to user dropdown  
- Update any internal links that reference `/security`, `/usage`, `/referrals`, or `/affiliates`
- Consider keeping separate referrals/affiliates pages that redirect to profile tabs

### 4. Update API Endpoints (Text Only)
- Update log messages in API routes to use "API Key" instead of "Personal Access Token"
- Keep all API functionality unchanged, only update user-facing text

### 5. File Changes
- `web/src/app/api-keys/page.tsx` - new API keys page
- `web/src/app/profile/page.tsx` - new profile page with usage and security tabs
- `web/src/components/navbar/user-dropdown.tsx` - update navigation links
- `web/src/app/api/api-keys/route.ts` - update log messages to use "API Key"
- Remove `web/src/app/security/page.tsx` (or redirect to profile)
- Update `web/src/app/usage/page.tsx` to redirect to profile page usage tab

## Implementation Steps
1. Create new API keys page with PAT functionality
2. Create new profile page with sessions functionality  
2. Create new profile page with usage and security tabs
3. Update user dropdown navigation
4. Update API route log messages
5. Update usage page to redirect to profile
6. Test both pages work correctly
7. Remove old security page