# Codebuff Web Application

## Authentication Flow

1. **Auth Code Validation**:

   - Login page validates auth code from URL
   - Checks token expiration and handles invalid codes
   - Configured in `web/src/app/login/page.tsx`

2. **OAuth Flow**:

   - Uses NextAuth.js with GitHub
   - Configured in `web/src/app/api/auth/[...nextauth]/auth-options.ts`

3. **User Onboarding**:

   - After successful OAuth, the onboarding page (`web/src/app/onboard/page.tsx`) processes the auth code.
   - It creates a new session, linking the `fingerprintId` with the user's account.

4. **Referral Processing**:

   - During onboarding, it handles any referral codes, applying bonuses if valid.

5. **Session Management**:
   - Establishes a session for the authenticated user.
   - Provides necessary user data for the npm app to retrieve via WebSocket.

### Interaction with Other Components

- **npm app**: Initiates the process by generating a `fingerprintId` and opening the login URL.
- **Backend**: Handles WebSocket communications and session verification.

### Key Security Considerations

- Validate auth codes thoroughly to prevent unauthorized access.
- Use secure, HTTP-only cookies for session management.
- Implement proper CSRF protection for all authenticated routes.

## UI Patterns

### HTML Structure in Components

- Avoid nesting `<p>` tags inside other `<p>` tags - this causes React hydration errors
- Use `<div>` tags instead of `<p>` tags when nesting is needed
- This is especially important in card components where content may be nested

### Section Title Gradients

- Use blue-to-purple gradients for hero and call-to-action sections:
  ```tsx
  'bg-gradient-to-br from-blue-600 via-blue-800 to-purple-700 dark:from-blue-400 dark:via-blue-600 dark:to-purple-500'
  ```
- Use simple foreground fade for content section headers:
  ```tsx
  'bg-gradient-to-b from-foreground to-foreground/70'
  ```
- This creates visual hierarchy: vibrant gradients for first/last impressions, subtle fades for content sections

### CRT Screen Effects

When creating retro CRT monitor effects:

- Use linear gradients instead of radial for screen edges - radial creates unrealistic circular vignetting
- Combine horizontal and vertical gradients for authentic edge darkening
- Keep content area clear (97% transparent in middle)
- Use subtle rounded corners (40px/30px) to match real CRT monitors
- Layer multiple effects: scanlines, text flicker, and screen glow

### Demo Content Guidelines

When creating interactive demos:

- Show suggested actions rather than simulated errors
- Use welcoming, positive messaging
- Include emojis and clear descriptions for each action
- Provide a clear path for users to discover features
- Keep help/documentation easily accessible

### Terminal Component Usage

#### Component Wrapping Pattern

- When a third-party component needs consistent styling:

  - Create a wrapper component in components/ui/
  - Pass through all props using ...props spread
  - Add className support using cn() utility
  - Apply default styles that can be overridden
  - This ensures consistent styling while maintaining flexibility

- When using react-terminal-ui's TerminalOutput component:
  - Must provide a single string/element as children, not an array
  - Use template literals for dynamic content instead of JSX interpolation
  - Always provide unique key props for dynamic terminal lines
  - Use theme.dark to determine ColorMode.Dark vs ColorMode.Light
  - Wrap Terminal component in a div with text-sm to control font size
  - Font size can't be controlled directly through Terminal props
  - Height handling quirks:
    - Use flex layout with fixed container height
    - Terminal wrapper should be flex-col with h-full
    - Terminal content should be flex-1 with overflow-y-auto
    - Set min-height: 0 to allow flex child to scroll
    - Parent controls height with responsive Tailwind classes:
      ```tsx
      <div className="h-[200px] md:h-[600px] lg:h-[800px]">
        <Terminal />
      </div>
      ```
    - Prefer Tailwind breakpoints over custom hooks for responsive design
    - This prevents content growth from breaking layout
  - Text wrapping strategies:
    - Try break-words + overflow-hidden for basic word wrapping
    - overflow-wrap-anywhere for more aggressive wrapping
    - max-w-full + break-words to force width-based wrapping
    - grid layout with min-w-0 to handle flex container overflow
    - For side-by-side layouts with fixed heights:
      - Set fixed height on parent container
      - Use grid layout to avoid flex container growth
      - Add min-w-0 to allow content to shrink below its natural width
      - Combine multiple strategies for best results:
        - whitespace-pre-wrap to preserve newlines but allow wrapping
        - break-words to handle word breaks when needed
        - overflow-x-auto as fallback if wrapping fails
        - min-w-0 to allow container to shrink below content width
        - For react-terminal-ui specifically:
          - Wrap TerminalOutput content in <p className="text-wrap">
          - Create a wrapper component to handle this automatically
          - This ensures consistent text wrapping across all terminal output
  - For responsive height:
    - Set base height prop for mobile
    - Use lg:!h-[size] to override on desktop
    - Important (!) needed to override inline styles

### Plan Type Management

- Use UsageLimits enum from common/constants.ts for all plan types
- Avoid string literals for plan names - use PLAN_CONFIGS[UsageLimits].displayName
- All plans, including special plans like Team, should be defined in PLAN_CONFIGS
- This ensures type safety and consistent plan naming across the application

### Logo Usage

- Include the Codebuff logo alongside the company name in key UI components
- Logo placement:
  - Navbar: Primary placement
  - Footer: Left side of sitemap
- Use Image component from Next.js for optimized loading
- Logo files:
  - `/public/favicon/apple-touch-icon.png`: Main logo
  - `/public/favicon/favicon.ico`: Favicon
  - `/public/favicon/favicon-16x16.ico`: Small variant

### Code Snippets

When displaying inline code snippets with copy buttons:

- Use `inline-block` on the container, not `inline-flex` or `flex`
- Keep the flex layout for internal alignment between code and copy button
- Example structure:

```jsx
<div className="inline-block">
  <div className="px-4 bg-gray-800 rounded-lg p-4 flex items-center gap-2">
    <code>npm install ...</code>
    <CopyIcon />
  </div>
</div>
```

### Toast Notifications

- Close buttons (X) should always be visible, not just on hover/focus
- This helps with discoverability and matches the project's emphasis on clear user interactions
- Implementation: Remove the `opacity-0` class from the close button's base styles

### Banner Design

- For mobile layouts:
  - Remove decorative elements (icons, illustrations) that don't add functional value
  - Focus on essential content and actions
  - Prefer clean, text-focused layouts over visual embellishments
- For desktop:
  - Can include supplementary visual elements to enhance aesthetics
  - Maintain proper spacing between icons and text
  - Consider text alignment and element placement

### Text Selection

- When users click to copy command snippets or code blocks, select the entire text
- This improves UX by making it clear what will be copied
- Implementation: Add `user-select: all` to clickable code elements
- Use this pattern for npm install commands, terminal commands, and other copyable snippets

### Video Player Behavior

- Prefer focused video watching over multitasking
- When embedding videos, implement UI that encourages users to finish or explicitly exit video before continuing page navigation
- This promotes better engagement with video content
- Consider modal/overlay implementations for video players rather than inline embedding

### Terminal Component Usage

- When using react-terminal-ui's TerminalOutput component:
  - Must provide a single string/element as children, not an array
  - Use template literals for dynamic content instead of JSX interpolation
  - Always provide unique key props for dynamic terminal lines
  - Use theme.dark to determine ColorMode.Dark vs ColorMode.Light
  - When handling code blocks in responses:
    - Use regex to extract only the code content between backticks
    - Don't include non-code text in the output
    - Join multiple code blocks with newlines
    - Keep original text for message display, replacing code blocks with placeholders
  - For proper text wrapping in terminal input:
    - Use whitespace-pre-wrap for preserving newlines while allowing wrapping
    - Use break-all to prevent overflow on long strings without spaces
    - Wrap input content in a div with these classes for consistent wrapping
    - Use flex flex-row items-center to keep cursor on same line as text
    - For auto-scrolling:
      - Keep ref to terminal container div
      - Scroll to bottom on user input and when lines change
      - Use smooth scrolling behavior for better UX

### Code Editor Preview

When showing code previews in the UI:

- Use browser-like window styling to provide familiar context
- Include title bar with traffic light circles (red, yellow, green)
- Show filename/path in URL-like bar
- Use system colors that adapt to light/dark mode
- Keep content area scrollable and monospaced
- For dynamic iframes with Tailwind:
  - Include Tailwind via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
  - Configure Tailwind theme inside iframe to match app's theme
  - Define custom colors in tailwind.config to match app's color scheme
  - Remove redundant CSS when using Tailwind classes
- For gradient borders:
  - Use p-[1px] with gradient background on outer div
  - Wrap content in inner div with solid background
  - This creates a gradient border effect that works in both light/dark modes
- For side-by-side layouts with fixed heights:
  - Set fixed height on parent container
  - Use flex layout with h-full on children
  - Allow content areas to scroll independently
  - This prevents unbounded growth from height="100%" components
- For side-by-side layouts with fixed heights:
  - Set fixed height on parent container
  - Use flex layout with h-full on children
  - Allow content areas to scroll independently
  - This prevents unbounded growth from height="100%" components

## Component Architecture

### React Query Mutation Patterns

Important: When using useMutation with UI state:

- Let mutation handlers (onMutate, onSuccess, onError) own their state updates
- Avoid setting state after awaiting mutation if handlers also set state
- For components with both local and mutation-driven state:

  ```typescript
  // Handle local state updates first
  if (isLocalAction(input)) {
    setLocalState(newState)
    return
  }

  // Let mutation handlers own their state for API calls
  await mutation.mutateAsync(input)
  ```

- This pattern prevents race conditions between local state updates and mutation handlers
- Keeps state management responsibilities clear and separated

### Success State Pattern

- Use shadcn Card component for consistent card styling
- For floating cards (e.g., cookie consent, notifications):
  - Wrap in container class for proper horizontal alignment
  - Use md:!px-0 to override container padding on desktop
  - For desktop left alignment:
    - Add md:left-4 and md:right-auto for positioning
    - Use md:ml-0 to override any auto margins
  - For mobile full-width:
    - Use inset-x-0 for edge-to-edge positioning
    - Keep container class for centered content
  - Add backdrop-blur-sm and bg-background/80 for semi-transparent effect
  - Set z-50 to ensure card appears above other content
- For success states:
  - Use CardWithBeams component
  - Examples: Payment success, onboarding completion
  - Include title, description, and optional next steps
  - Can include media (images, icons)

### MDX Code Blocks

- Always use markdown code blocks (```) instead of the `CodeDemo` component for code blocks:

  ````tsx
  // Instead of:
  <CodeDemo language="bash">npm install</CodeDemo>
  ↓ ```

  ```bash
  // Use:
  npm install
  ````

- This ensures consistent styling and copy functionality across all code examples
- Supports all common languages (bash, typescript, javascript, etc.)

### ContentLayer Configuration

- When adding remark plugins to ContentLayer:
  - Use array syntax for plugin configuration: `remarkPlugins: [[myPlugin]]`
  - Plugin must return `Plugin<any[], Root>` type for proper typing
  - Example:
    ```ts
    function myPlugin(): Plugin<any[], Root> {
      return function transformer(tree) {
        // Transform the AST
      }
    }
    ```
  - This ensures proper type compatibility with ContentLayer's MDX processing
  - For code block transformations:
    - Check node.lang to detect if language is specified
    - Skip transformation for plain code blocks (no lang)
    - This allows mixing transformed and untransformed code blocks
- Important: Code blocks must handle mobile overflow:

  - Use whitespace-pre-wrap to allow text wrapping
  - Use break-words to prevent horizontal overflow
  - Always test on narrow viewports
  - For component height management:

    - Components should use h-full internally and accept className prop
    - Let parent components control final height with Tailwind classes
    - Example:

      ```tsx
      // Component
      const MyComponent = ({ className }) => (
        <div className={cn("h-full", className)}>...</div>
      )

      // Usage
      <div className="h-[200px] md:h-[800px]">
        <MyComponent />
      </div>
      ```

    - This allows for responsive heights and better composition

  - For component height management:

    - Components should use h-full internally and accept className prop
    - Let parent components control final height with Tailwind classes
    - Example:

      ```tsx
      // Component
      const MyComponent = ({ className }) => (
        <div className={cn("h-full", className)}>...</div>
      )

      // Usage
      <div className="h-[200px] md:h-[800px]">
        <MyComponent />
      </div>
      ```

    - This allows for responsive heights and better composition

### Card Design

- Use shadcn Card component for consistent card styling
- For floating cards (e.g., cookie consent, notifications), two approaches:
  1. Container-based positioning:
     - Use container class for consistent page margins
     - Use inset-x-0 for full-width on mobile
     - Add md:left-4 and md:right-auto for desktop positioning
     - Use md:ml-0 to override auto margins
  2. Fixed positioning with explicit margins:
     - Use fixed with bottom-4 left-4 right-4 for mobile
     - Use md:left-8 md:right-auto for desktop (matches container padding)
     - Simpler approach when container class causes positioning issues
  - Common styles for both approaches:
    - Add backdrop-blur-sm and bg-background/80 for semi-transparent effect
    - Set z-50 to ensure card appears above other content
    - Use transition-opacity for smooth fade effects

### Responsive Card Positioning

For cards that need different positioning on mobile vs desktop:

- Use container class with md: breakpoint modifiers
- Position fixed with inset-x-0 for full-width on mobile
- Use md:left-4 md:right-auto for left-aligned on desktop
- Set md:max-w-sm to constrain width on larger screens
- Add rounded corners only on desktop with md:rounded-lg
- Example use case: Cookie consent card that converts from banner to card

### Code Style

- Use ts-pattern's match syntax instead of complex if/else chains
- Match syntax provides better type safety and more readable code
- Especially useful when handling multiple related conditions
- Example:
  ```typescript
  await match(input)
    .with('exact-match', () => {
      /* handle exact match */
    })
    .with(P.string.includes('partial'), () => {
      /* handle partial match */
    })
    .with(
      P.when((s: string) => s.includes('a') && s.includes('b')),
      () => {
        /* handle multiple conditions */
      }
    )
    .otherwise(() => {
      /* handle default case */
    })
  ```

### Error Handling

#### Rate Limit Handling

- Use HTTP status code 429 to detect rate limits
- Show user-friendly error messages in the UI
- For React Query mutations:

  ```typescript
  interface ApiResponse {
    // response type
  }

  const mutation = useMutation<ApiResponse, Error, string>({
    mutationFn: async (input) => {
      const response = await fetch('/api/endpoint')
      if (!response.ok) {
        const error = await response.json()
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a minute.')
        }
        throw new Error(error.error || 'Failed to get response')
      }
      return response.json()
    }
  })

  // Use mutation.isPending (not isLoading) for loading state
  return (
    <div className={mutation.isPending ? 'opacity-50' : ''}>
      {mutation.isPending && <LoadingSpinner />}
    </div>
  )

  // Important: Use isPending instead of isLoading in React Query v5+
  // - isPending: true during the first mutation
  // - isLoading: deprecated in v5, use isPending instead
  ```

### UI Component State Management

- Separate independent visual states into their own state variables
- Avoid deriving visual states from content/data states
- Pass visual states as explicit props to child components
- Example: For a component with error and content:

  ```typescript
  // Good
  const [showError, setShowError] = useState(true)
  const [content, setContent] = useState('')

  // Avoid
  const [content, setContent] = useState('error')
  const showError = content === 'error'
  ```

### UI Component Library

- Use shadcn UI components instead of native HTML elements
- Maintain consistency with existing component patterns
- Example: Prefer shadcn Dialog over HTML dialog element
- Find components in `web/src/components/ui/`
- Install new shadcn components with: `bunx --bun shadcn@latest add [component-name]`
- Use Lucide icons instead of raw SVGs for consistency
- Import icons from 'lucide-react' package
- For theme-aware components:
  - Use CSS variables defined in globals.css (e.g. --background, --foreground)
  - Use utility classes like bg-primary and text-primary-foreground
  - These automatically handle light/dark mode transitions
  - Example: `bg-primary text-primary-foreground hover:bg-primary/90`
- For subtle interactive elements:
  - Use semi-transparent backgrounds matching parent container theme
  - Add matching borders with reduced opacity
  - Increase background opacity on hover while staying in theme
  - Example: If parent uses `bg-blue-50`, use:
    ```
    bg-blue-50/50 hover:bg-blue-100/50
    border-blue-100 dark:border-blue-900/50
    ```
- For collapsible headers:
  - Combine the summary and trigger into one interactive element
  - Use flex with gap for consistent spacing between elements
  - Keep chevron icon on the right as a subtle expand indicator
  - Example: `<CollapsibleTrigger><div class="flex gap-2"><span>Label</span><span>Value</span></div><ChevronDown /></CollapsibleTrigger>`
- For collapsible animations:
  - Use group on trigger and group-data-[state=open] on animated element
  - Add transform and origin-center for smooth rotation
  - Combine with transition-transform, duration, and ease-in-out
  - Example: `group-data-[state=open]:-rotate-180 transform transition-transform duration-200 ease-in-out origin-center`

### Component Architecture

- Use shadcn UI components from `web/src/components/ui/`
- Install new components: `bunx --bun shadcn@latest add [component-name]`
- Keep components focused and reusable
- Extract shared styles into base components
- Let parent components control height with Tailwind classes
- Use Lucide icons from 'lucide-react' package
- Theme-aware components use CSS variables from globals.css

### Mobile Support

- Use shadcn's Sidebar component for mobile navigation
- Support swipe gestures and bottom sheets
- Preserve scroll position when dismissing sheets
- Keep drag indicators visible during scroll
- Handle responsive layouts with Tailwind breakpoints

### Terminal Component

- Must provide single string/element as children
- Use theme.dark for ColorMode
- Support text wrapping and overflow handling
- Handle height responsively with Tailwind classes
- Auto-scroll to bottom on new content
- Extract code blocks from responses
- Support command history and input handling

## Analytics Implementation

### PostHog Integration

- Initialize after user consent
- Respect Do Not Track setting
- Track events with consistent naming: `category.event_name`
- Include relevant context (theme, referrer, etc.)
- Place PostHogProvider above other providers
- Handle cleanup with posthog.shutdown()

### Event Categories

- home.\* - Home page events
- demo_terminal.\* - Terminal interactions
- auth.\* - Authentication events
- subscription.\* - Plan changes
- referral.\* - Referral system
- docs.\* - Documentation views
- usage.\* - Usage tracking
- navigation.\* - User navigation
- toast.\* - Notifications

### Event Properties

Include relevant properties for each event type:

```typescript
// Auth events
{
  provider: 'github' | 'google',
  success: boolean,
  error?: string
}

// Subscription events
{
  current_plan: string,
  target_plan?: string,
  source: 'pricing_page' | 'user_menu' | 'usage_warning'
}
```

## Referral System

### API Response Errors

- Always display API error messages to users when present in the response
- Error messages from the API are pre-formatted for user display
- Check for `error` field in API responses before rendering success states
- Error messages should be shown in a prominent location, typically near the top of the component

This helps with:

- Consistent error handling across the application
- Better user experience through clear error communication
- Easier debugging by surfacing backend errors

The referral system is a key feature of the Codebuff web application. It allows users to refer others and earn credits for successful referrals.

### High-Level Workflow

1. **Referral Code Generation**:

   - Each user is assigned a unique referral code upon account creation.
   - Referral codes are stored in the `user` table of the database.

2. **Sharing Referrals**:

   - Users can share their referral code or a referral link.
   - Referral link format: `${env.NEXT_PUBLIC_APP_URL}/redeem?referral_code=${referralCode}`

3. **Redeeming Referrals**:

   - New users can enter a referral code during signup or on the referrals page.
   - The system validates the referral code and creates a referral record.

   - Each referral code has a maximum claim limit - show appropriate messaging when this limit is reached.

4. **Credit Distribution**:

   - Both the referrer and the referred user receive bonus credits.
   - Credit amount is defined by `CREDITS_REFERRAL_BONUS` in constants.

5. **Referral Tracking**:

   - Referrals are tracked in the `referral` table, linking referrer and referred users.
   - The referrals page displays a user's referral history and earned credits.

6. **Quota Management**:
   - Referral credits are added to the user's quota.
   - When users upgrade or downgrade their subscription, referral credits are preserved.

### Key Components

- `web/src/app/referrals/page.tsx`: Main referrals UI
- `web/src/app/api/referrals/route.ts`: API route for referral operations
- `web/src/app/api/stripe/webhook/route.ts`: Handles subscription changes, preserving referral credits
- `common/src/db/schema.ts`: Database schema including user and referral tables

### Important Considerations

- Referral codes are unique per user.
- Referral links redirect unauthenticated users to the login page before processing.
- The system prevents users from referring themselves.
- There's a limit on the number of times a referral code can be used.
- Referral codes can only be submitted through the Codebuff CLI app, not through the website.

### CLI-based Referral Code Submission

To streamline the referral process and integrate it with the CLI tool:

1. The web interface no longer accepts referral code inputs.
2. Users are directed to use the Codebuff CLI app for submitting referral codes.
3. The referrals page should include instructions for installing the CLI tool and using referral codes:
   - Install command: `npm i -g codebuff`
   - Usage: Users should paste their referral code in the CLI after installation.
4. Format CLI commands in a code-like pattern on the web interface for clarity.

This change ensures a consistent user experience across the Codebuff ecosystem and encourages CLI adoption.

## Environment Configuration

The application uses environment variables for configuration, which are managed through the `web/src/env.mjs` file. This setup ensures type-safe access to environment variables and proper validation.

Key points:

- Uses `@t3-oss/env-nextjs` for creating a type-safe environment configuration.
- Loads environment variables from different `.env` files based on the current environment.
- Defines separate server-side and client-side environment variables.
- Includes critical configuration like database URL, authentication secrets, and Stripe API keys.

## Pricing Structure

- Free tier: Limited credits per month
- Pro tier: $99/month with 10,000 credits
- Overage allowance: $0.90 per 100 credits
- Enterprise tier: Custom pricing and features

Pricing information is displayed on the pricing page (`web/src/app/pricing/page.tsx`).

Remember to keep this knowledge file updated as the application evolves or new features are added.

## Testing Protected Routes

Important: When testing protected routes like /usage:

- Always test both authenticated and unauthenticated states
- Sign in with GitHub first to see actual data
- Test with different subscription tiers to verify conditional UI elements

## Deepseek Integration

When using Deepseek in web API routes:

- Use OpenAI's client library with custom baseURL: 'https://api.deepseek.com'
- Model name is 'deepseek-chat' for the chat completion endpoint
- Requires DEEPSEEK_API_KEY in environment variables
- Returns content in the same format as OpenAI's API
- When handling responses with code blocks:
  - Keep text before and after code blocks for context
  - Extract only code content for HTML display
  - Replace code blocks with placeholders in message history
  - Return both HTML and message content separately
- Support arrays of prompts to allow multi-turn conversations

## Interactive Terminal Demo

The demo terminal component supports:

- Special commands (rainbow, theme, fix bug, clear)
- Fallback to Deepseek AI for any unrecognized commands
- Dynamic iframe content injection with proper HTML document structure
- Loading states that maintain terminal interactivity
- Random file selection (2-5 files) from a predefined list to simulate file reading
- Consistent styling and theming across both terminal and preview
- Multi-turn conversations with Deepseek by maintaining message history
- Sends full conversation history to API with each request

Initial state shows a simulated error component that:

- Uses playful emojis (🎭, 💡) to indicate it's a demo
- Has a dashed border to visually separate from real errors
- Includes explicit text mentioning it's simulated
- Provides hints about how to interact with the demo
- Maintains React-like error styling for authenticity
  This creates a better narrative flow for users trying out the demo while avoiding confusion with real errors.

## Usage Tracking

The application includes a usage tracking feature to allow users to monitor their credit consumption:

- A separate page and API endpoint are dedicated to displaying usage data.
- The system tracks and displays the number of credits used in the current month.
- Implementation involves:
  1. Creating a new page for displaying usage data.
  2. Developing a new API endpoint to fetch usage information.
  3. Utilizing existing helper functions (if available) to calculate current month usage.
  4. Ensuring the backend only returns data for the authenticated user's current month usage.

This feature enhances user experience by providing transparency about resource consumption and helps users manage their account effectively.

## Verifying Changes

After making changes to the web application code, always run type checking:

```bash
bun run --cwd common build && bun run --cwd web tsc
```

This ensures type safety is maintained across the application.

Important: When modifying or using code from common:

- Always build common package first before running web type checking
- Changes to common won't be reflected in web until common is rebuilt
- This applies to new exports, type changes, and utility functions

Important: When modifying or using code from common:

- Always build common package first before running web type checking
- Changes to common won't be reflected in web until common is rebuilt
- This applies to new exports, type changes, and utility functions

## UI Patterns

### Analytics Implementation

Important: When integrating PostHog:

- Initialize variables before using them in analytics events
- Calculate derived values before sending them to PostHog
- Avoid using variables in analytics events before they're declared

### Plan Change Terminology

- Use consistent wording for plan changes throughout the app
- "Upgrade" when target plan price is higher than current plan
- "Change" when target plan price is lower or equal
- Use getPlanChangeType utility from lib/utils.ts to determine which term to use
- Apply this consistently in buttons, headers, and error messages

## Type Management

### Documentation

- Content in MDX files under `src/content/`
- Categories: help, tips, showcase, case-studies
- Each doc needs frontmatter (title, section, tags, order)
- Files sorted by order within sections
- Support custom MDX components
- Handle mobile responsiveness

### API Routes

- Split complex routes into focused endpoints
- Include CORS headers in all responses
- Validate requests with Zod
- Handle rate limiting appropriately
- Return consistent error formats
- Use proper HTTP status codes

## Development Guidelines

1. Use React Query for API calls:

   - Automatic caching and revalidation
   - Loading and error states
   - Deduplication of requests

2. Keep business logic in utility files:

   - Payment flows in `src/lib/stripe.ts`
   - Analytics in `src/lib/analytics.ts`
   - Shared utils in `src/lib/utils.ts`

3. Type checking after changes:

   ```bash
   bun run --cwd common build && bun run --cwd web tsc
   ```

4. Component Guidelines:
   - Use client components for interactivity
   - Follow shadcn patterns
   - Keep state management simple
   - Handle loading states appropriately

## Stripe Integration

### Key Points

- Preview subscription changes with retrieveUpcoming()
- Handle webhooks for subscription events
- Track usage with billing.meterEvents.create
- Preserve usage data during plan changes
- Include CORS headers in all responses
- Handle rate limiting appropriately

### Subscription Management

- Cannot add duplicate prices
- Map existing items to new prices
- Set proration_behavior appropriately
- Handle unused time credits automatically
- Validate subscription states
- Track metered usage accurately
- Handle plan upgrades and downgrades
