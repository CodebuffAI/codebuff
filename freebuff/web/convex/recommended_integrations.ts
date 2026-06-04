import { internalMutation } from "./_generated/server";

// Function to create recommended integrations
export const createRecommendedIntegrationsData = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if recommended integrations already exist
    const existingResend = await ctx.db
      .query("integration")
      .filter((q) => q.eq(q.field("reference_id"), "resend"))
      .first();

    const existingAutumn = await ctx.db
      .query("integration")
      .filter((q) => q.eq(q.field("reference_id"), "autumn_payments"))
      .first();

    const existingOpenRouter = await ctx.db
      .query("integration")
      .filter((q) => q.eq(q.field("reference_id"), "openrouter"))
      .first();

    const existingTwilio = await ctx.db
      .query("integration")
      .filter((q) => q.eq(q.field("reference_id"), "twilio_sms"))
      .first();

    const existingTwitter = await ctx.db
      .query("integration")
      .filter((q) => q.eq(q.field("reference_id"), "twitter_api"))
      .first();

    const existingConvexGeospatial = await ctx.db
      .query("integration")
      .filter((q) => q.eq(q.field("reference_id"), "convex_geospatial"))
      .first();

    // Create Resend integration if it doesn't exist
    if (!existingResend) {
      await ctx.db.insert("integration", {
        cover_image: "https://resend.com/static/favicons/favicon-32x32.png",
        reference_id: "resend",
        title: "Resend",
        description:
          "A straightforward API for sending emails from your application.",
        tags: ["Email", "API", "Transactional", "SMTP"],
        type: "official",
        public: true,
        recommended: true,
        documentation_urls: [
          "https://resend.com/docs/introduction",
          "https://resend.com/docs/send-with-nodejs",
          "https://resend.com/docs/api-reference/emails/send-email",
        ],
        llm_instructions: `### 1. Overview

Resend is a modern email API that provides a simple, developer-friendly interface for sending transactional emails. It's designed to be a reliable alternative to traditional email services with better deliverability and easier integration.

### 2. Installation

Install the Resend SDK using your package manager:

\`\`\`bash
# Install the resend package
npm install resend
\`\`\`

### 3. Basic Setup

Initialize the Resend client with your API key:

\`\`\`typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
\`\`\`

### 4. Sending Emails

#### Basic Email

\`\`\`typescript
async function sendEmail(to: string, subject: string, html: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Your App <noreply@yourdomain.com>',
      to: [to],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error('Error sending email:', error);
      return { success: false, error };
    }

    console.log('Email sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
}
\`\`\`

#### Email with Text and HTML

\`\`\`typescript
async function sendEmailWithTextAndHtml(to: string, subject: string, text: string, html: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Your App <noreply@yourdomain.com>',
      to: [to],
      subject: subject,
      text: text,
      html: html,
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
\`\`\`

### 5. Email Templates

#### Welcome Email

\`\`\`typescript
async function sendWelcomeEmail(to: string, userName: string) {
  const html = \`
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Welcome to Our App!</h1>
      <p>Hi \${userName},</p>
      <p>Thank you for signing up. We're excited to have you on board!</p>
      <p>Get started by exploring our features and let us know if you have any questions.</p>
      <p>Best regards,<br>The Team</p>
    </div>
  \`;

  return await sendEmail(to, 'Welcome to Our App!', html);
}
\`\`\`

#### Password Reset Email

\`\`\`typescript
async function sendPasswordResetEmail(to: string, resetLink: string) {
  const html = \`
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Password Reset Request</h1>
      <p>You requested a password reset. Click the button below to reset your password:</p>
      <a href="\${resetLink}" 
         style="display: inline-block; padding: 12px 24px; background-color: #007cba; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
        Reset Password
      </a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
  \`;

  return await sendEmail(to, 'Password Reset Request', html);
}
\`\`\`

### 6. Bulk Email

\`\`\`typescript
async function sendBulkEmail(recipients: string[], subject: string, html: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Your App <noreply@yourdomain.com>',
      to: recipients,
      subject: subject,
      html: html,
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
\`\`\`

### 7. Email with Attachments

\`\`\`typescript
async function sendEmailWithAttachment(to: string, subject: string, html: string, attachmentPath: string) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const attachment = fs.readFileSync(attachmentPath);
    const filename = path.basename(attachmentPath);

    const { data, error } = await resend.emails.send({
      from: 'Your App <noreply@yourdomain.com>',
      to: [to],
      subject: subject,
      html: html,
      attachments: [
        {
          filename: filename,
          content: attachment,
        },
      ],
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
\`\`\`

### 8. React Email Integration

Resend works great with React Email for creating beautiful, responsive email templates:

\`\`\`bash
# Install React Email packages
npm install react-email @react-email/components
\`\`\`

\`\`\`tsx
// emails/WelcomeEmail.tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

interface WelcomeEmailProps {
  userName: string;
  loginUrl: string;
}

export function WelcomeEmail({ userName, loginUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Arial, sans-serif' }}>
        <Container>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>
            Welcome, {userName}!
          </Text>
          <Text>
            Thank you for joining our platform. We're excited to have you on board.
          </Text>
          <Button href={loginUrl} style={{ backgroundColor: '#007cba', color: 'white', padding: '12px 24px' }}>
            Get Started
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
\`\`\`

\`\`\`typescript
import { render } from '@react-email/render';
import { WelcomeEmail } from './emails/WelcomeEmail';

async function sendWelcomeEmailWithReact(to: string, userName: string, loginUrl: string) {
  const html = render(WelcomeEmail({ userName, loginUrl }));
  
  return await sendEmail(to, 'Welcome to Our App!', html);
}
\`\`\`

### 9. Environment Variables

Set the following environment variable:

- \`RESEND_API_KEY\`: Your Resend API key

### 10. Domain Verification

To send emails from your own domain, you need to:
1. Add and verify your domain in the Resend dashboard
2. Configure DNS records (SPF, DKIM, DMARC)
3. Use your verified domain in the 'from' field

### 11. Error Handling

\`\`\`typescript
async function sendEmailWithErrorHandling(to: string, subject: string, html: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Your App <noreply@yourdomain.com>',
      to: [to],
      subject,
      html,
    });

    if (error) {
      if (error.name === 'validation_error') {
        return { success: false, error: 'Invalid email parameters' };
      } else if (error.name === 'missing_required_field') {
        return { success: false, error: 'Missing required email field' };
      } else {
        return { success: false, error: 'Failed to send email' };
      }
    }

    return { success: true, data };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error: 'Unexpected error occurred' };
  }
}
\`\`\`

### 12. Best Practices

1. **Domain Verification**: Always verify your sending domain for better deliverability
2. **Unsubscribe Links**: Include unsubscribe links in marketing emails
3. **Rate Limiting**: Respect rate limits and implement proper retry logic
4. **Email Validation**: Validate email addresses before sending
5. **Templates**: Use React Email or HTML templates for consistent branding
6. **Testing**: Test emails thoroughly across different email clients`,
        human_added_notes:
          "This is a recommended integration for implementing email functionality with better deliverability than traditional SMTP.",
        env_variables: [
          {
            id: "RESEND_API_KEY",
            description:
              "Your Resend API key for authenticating requests. You can create a new API key by navigating to the API Keys section in your Resend dashboard.",
          },
        ],
        user_instructions: `1. Create a Resend account at https://resend.com

2. Navigate to the API Keys section in the dashboard at https://resend.com/api-keys

3. Click "Create API Key", give it a name, and select "Sending access" for the permission

4. Copy the generated API key and set it as an environment variable named RESEND_API_KEY

5. (Optional) Add and verify your domain:
   - Go to Domains section in the dashboard
   - Add your domain and configure the required DNS records
   - Wait for verification to complete

6. Update your email 'from' address to use your verified domain`,
        images: [],
        last_updated: Date.now(),
      });
    }

    // Create Autumn Payments integration if it doesn't exist
    if (!existingAutumn) {
      await ctx.db.insert("integration", {
        cover_image:
          "https://framerusercontent.com/images/F6dnECLFzPUx2q6IzjL3rfjoAxg.png",
        reference_id: "autumn_payments",
        title: "Autumn Payments",
        description:
          "Payments layer over Stripe that simplifies implementing pricing models, managing entitlements, and handling payment flows.",
        tags: [
          "Payments",
          "Billing",
          "Subscriptions",
          "Stripe",
          "Entitlements",
        ],
        type: "official",
        public: true,
        recommended: true,
        documentation_urls: [
          "https://docs.useautumn.com/introduction",
          "https://docs.useautumn.com/quickstart",
          "https://github.com/useautumn/autumn",
        ],
        llm_instructions: `### 1. Overview

Autumn provides a simplified interface for managing complex billing logic such as subscriptions, credit systems, and usage-based models on top of Stripe. This integration involves setting up a backend handler to communicate with Autumn's API and a frontend provider to make customer and subscription data available to your React application.

### 2. Installation

Install the \`autumn-js\` library in both your frontend and backend directories:

\`\`\`bash
# Install the autumn-js package
npm install autumn-js
\`\`\`

### 3. Backend Setup (Convex with Node.js)

You will need to mount the Autumn handler on your server. This handler exposes API routes that the frontend hooks will use to interact with Autumn.

The documentation provides an example for an Express server. You will adapt this for your Convex HTTP action.

**Example from Documentation (for Express):**

\`\`\`typescript
// From Autumn Documentation for Express
import { autumnHandler } from "autumn-js/express";

// This example assumes an Express app \`app\` is already initialized.
// app.use(express.json()); // Ensure the request body is parsed before the autumnHandler
  app.use(
    "/api/autumn",
    autumnHandler({
      identify: async (req: any) => {
        // The following is an example and needs to be adapted to your auth system.
        if (!req.isAuthenticated() || !req.user?.claims?.sub) {
          throw new Error("User not authenticated");
        }

        const user = await storage.getUser(req.user.claims.sub);
        return {
          customerId: req.user.claims.sub,
          customerData: {
            name: user?.firstName && user?.lastName
              ? \`\${user.firstName} \${user.lastName}\`
              : user?.email?.split('@')[0] || "User",
            email: user?.email || req.user.claims.email,
          },
        };
      },
    })
  );
\`\`\`

**Note on \`identify\` function:** The \`identify\` function is crucial. It's an async function that should return the \`customerId\`. This ID is typically the internal user ID from your authentication provider. Autumn will create a new customer if the \`customerId\` is new. You can also pass \`customerData\` to pre-fill customer information in Autumn.

### 4. Frontend Setup (React + Vite)

Wrap your main application component with the \`<AutumnProvider />\`

\`\`\`tsx
// In your main application entry file (e.g., main.tsx or App.tsx)
import { AutumnProvider } from "autumn-js/react";
import App from "./App";

// ... other imports

// Wrap your App component with AutumnProvider
<AutumnProvider
  backendUrl="YOUR_BACKEND_URL" // Replace with the URL of your Convex backend
>
  <App />
</AutumnProvider>
\`\`\`

If you are using a full-stack framework where the frontend and backend are on the same domain, you might be able to use an empty string for \`backendUrl\`. However, with a separate Convex backend, you will need to provide the full URL to your backend where the Autumn handler is exposed.

### 5. Usage

To verify the integration, you can use the \`useCustomer\` hook in any of your React components to fetch and display the current customer's data from Autumn.

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

function MyComponent() {
  const { customer } = useCustomer();

  console.log("Autumn Customer", customer);

  // You can now use the customer object in your component
  return (
    <div>
      {customer ? (
        <p>Welcome, {customer.name || 'user'}!</p>
      ) : (
        <p>Loading customer data...</p>
      )}
    </div>
  );
}
\`\`\`

The \`useCustomer\` hook returns the current customer object. The value will be \`undefined\` if the customer is not yet known or logged in.

### 6. Required Secrets

The following secret key needs to be set as an environment variable in your Convex backend:

*   \`AUTUMN_SECRET_KEY\`: Your secret API key from the Autumn dashboard.`,
        human_added_notes:
          "This is a recommended integration for implementing payments and billing functionality.",
        env_variables: [
          {
            id: "AUTUMN_SECRET_KEY",
            description:
              "To get your Autumn Secret API Key, create an Autumn account and then generate the key from the developer section of the dashboard. This key is used to authenticate with the Autumn API from your backend.",
          },
        ],
        user_instructions: `Create an Autumn account at https://useautumn.com/. Once you have created an account, navigate to the "Dev" or "API Keys" section of the sandbox environment at https://app.useautumn.com/sandbox/dev to generate your \`AUTUMN_SECRET_KEY\`.`,
        images: [
          "https://harmless-tapir-303.convex.cloud/api/storage/7c81b4ea-d2c3-4c9c-ad4c-5f2c07af54c1",
        ],
        last_updated: Date.now(),
      });
    }

    // Create OpenRouter integration if it doesn't exist
    if (!existingOpenRouter) {
      await ctx.db.insert("integration", {
        cover_image: "https://openrouter.ai/favicon.ico",
        reference_id: "openrouter",
        title: "OpenRouter",
        description:
          "Access to multiple AI models through a single API for building AI agents and applications.",
        tags: ["AI", "LLM", "OpenAI", "Claude", "Gemini", "API"],
        type: "official",
        public: true,
        recommended: true,
        documentation_urls: [
          "https://openrouter.ai/docs",
          "https://openrouter.ai/docs/quick-start",
          "https://openrouter.ai/docs/requests",
          "https://openrouter.ai/docs/responses",
        ],
        llm_instructions: `### 1. Overview

OpenRouter provides access to multiple AI models through a single API, including OpenAI GPT models, Anthropic Claude, Google Gemini, and many others. This integration allows you to build AI agents and applications that can switch between different AI providers seamlessly.

### 2. Installation

OpenRouter is compatible with the OpenAI SDK, so you can use the standard OpenAI package:

\`\`\`bash
# Install the openai package
npm install openai
\`\`\`

### 3. Basic Setup

Initialize the OpenAI client with OpenRouter's base URL and your API key:

\`\`\`typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://your-app.com', // Optional: for rankings
    'X-Title': 'Your App Name', // Optional: for rankings
  },
});
\`\`\`

### 4. Sending Chat Completions

#### Basic Chat Completion

\`\`\`typescript
async function sendChatMessage() {
  try {
    const completion = await openai.chat.completions.create({
      model: 'anthropic/claude-3-haiku', // or any other model
      messages: [
        {
          role: 'user',
          content: 'Hello, how are you?'
        }
      ],
      max_tokens: 100,
    });

    const response = completion.choices[0].message.content;
    console.log('AI Response:', response);
    return { success: true, response };
  } catch (error) {
    console.error('Error sending chat message:', error);
    return { success: false, error };
  }
}
\`\`\`

#### Streaming Responses

\`\`\`typescript
async function sendStreamingMessage() {
  try {
    const stream = await openai.chat.completions.create({
      model: 'anthropic/claude-3-haiku',
      messages: [
        {
          role: 'user',
          content: 'Tell me a story'
        }
      ],
      stream: true,
      max_tokens: 500,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        process.stdout.write(content);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error streaming message:', error);
    return { success: false, error };
  }
}
\`\`\`

### 5. Popular Models

OpenRouter supports many models. Here are some popular ones:

\`\`\`typescript
const models = {
  // OpenAI Models
  gpt4: 'openai/gpt-4',
  gpt4Turbo: 'openai/gpt-4-turbo',
  gpt35Turbo: 'openai/gpt-3.5-turbo',
  
  // Anthropic Models
  claude3Opus: 'anthropic/claude-3-opus',
  claude3Sonnet: 'anthropic/claude-3-sonnet',
  claude3Haiku: 'anthropic/claude-3-haiku',
  
  // Google Models
  geminiPro: 'google/gemini-pro',
  geminiProVision: 'google/gemini-pro-vision',
  
  // Other Models
  llama2: 'meta-llama/llama-2-70b-chat',
  mixtral: 'mistralai/mixtral-8x7b-instruct',
};

async function useSpecificModel(modelName: string) {
  try {
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'user',
          content: 'What model are you?'
        }
      ],
      max_tokens: 100,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error(\`Error with model \${modelName}:\`, error);
    return null;
  }
}
\`\`\`

### 6. Environment Variables

Set the following environment variable:

- \`OPENROUTER_API_KEY\`: Your OpenRouter API key from the OpenRouter dashboard

### 7. Advanced Usage

#### Function Calling

\`\`\`typescript
async function callFunction() {
  try {
    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-4',
      messages: [
        {
          role: 'user',
          content: 'What is the weather like in San Francisco?'
        }
      ],
      functions: [
        {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA'
              }
            },
            required: ['location']
          }
        }
      ],
      function_call: 'auto',
    });

    const functionCall = completion.choices[0].message.function_call;
    if (functionCall) {
      console.log('Function called:', functionCall.name);
      console.log('Arguments:', functionCall.arguments);
    }

    return { success: true, completion };
  } catch (error) {
    console.error('Error with function calling:', error);
    return { success: false, error };
  }
}
\`\`\`

#### Model Routing with Fallback

\`\`\`typescript
async function sendWithFallback(message: string) {
  const models = [
    'anthropic/claude-3-haiku',
    'openai/gpt-3.5-turbo',
    'google/gemini-pro'
  ];

  for (const model of models) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 100,
      });

      return {
        success: true,
        response: completion.choices[0].message.content,
        model: model
      };
    } catch (error) {
      console.warn(\`Model \${model} failed, trying next...\`);
      continue;
    }
  }

  return { success: false, error: 'All models failed' };
}
\`\`\`

### 8. Error Handling

Always implement proper error handling:

\`\`\`typescript
async function sendMessageWithErrorHandling(message: string) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'anthropic/claude-3-haiku',
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 100,
    });

    return {
      success: true,
      response: completion.choices[0].message.content
    };
  } catch (error: any) {
    if (error.status === 429) {
      console.error('Rate limit exceeded');
      return { success: false, error: 'Rate limit exceeded' };
    } else if (error.status === 401) {
      console.error('Invalid API key');
      return { success: false, error: 'Invalid API key' };
    } else if (error.status === 400) {
      console.error('Bad request:', error.message);
      return { success: false, error: 'Bad request' };
    } else {
      console.error('Unknown error:', error);
      return { success: false, error: 'Unknown error' };
    }
  }
}
\`\`\`

### 9. Best Practices

1. **Model Selection**: Choose the right model for your use case based on cost, speed, and capability
2. **Rate Limiting**: Implement proper rate limiting and retry logic
3. **Error Handling**: Always handle API errors gracefully
4. **Streaming**: Use streaming for better user experience in chat applications
5. **Cost Management**: Monitor your usage and costs through the OpenRouter dashboard
6. **Model Fallbacks**: Implement fallback logic for better reliability`,
        human_added_notes:
          "This is a recommended integration for implementing AI functionality with access to multiple AI models.",
        env_variables: [
          {
            id: "OPENROUTER_API_KEY",
            description:
              "Your OpenRouter API key from the OpenRouter dashboard. Go to https://openrouter.ai/keys to generate a new API key.",
          },
        ],
        user_instructions: `1. Go to OpenRouter website at https://openrouter.ai/

2. Click "Sign In" or "Sign Up" to create an account

3. Once logged in, navigate to the "Keys" section at https://openrouter.ai/keys

4. Click "Create Key" button

5. Give your API key a name (e.g., "My Project")

6. Set any usage limits if desired (optional)

7. Click "Create Key" to generate the key

8. Copy the generated API key (it will start with "sk-or-")

9. Add this key to your environment variables as OPENROUTER_API_KEY

Note: Keep your API key secure and never share it publicly.`,
        images: [],
        last_updated: Date.now(),
      });
    }

    // Create Twilio SMS integration if it doesn't exist
    if (!existingTwilio) {
      await ctx.db.insert("integration", {
        cover_image:
          "https://www.twilio.com/content/dam/twilio-com/global/en/favicons/favicon-32x32.png",
        reference_id: "twilio_sms",
        title: "Twilio SMS",
        description:
          "Send SMS text messages and notifications using Twilio's powerful messaging API.",
        tags: ["SMS", "Messaging", "Notifications", "Text", "Communication"],
        type: "official",
        public: true,
        recommended: true,
        documentation_urls: [
          "https://www.twilio.com/docs/sms",
          "https://www.twilio.com/docs/libraries/node",
          "https://www.twilio.com/docs/sms/quickstart/node",
          "https://github.com/twilio/twilio-node",
        ],
        llm_instructions: `### 1. Overview

Twilio SMS provides a simple, reliable API for sending SMS text messages and notifications. This integration allows you to send text messages to users for notifications, alerts, OTP verification, and other communication needs.

### 2. Installation

Install the Twilio Node.js library:

\`\`\`bash
# Install the twilio package
npm install twilio
\`\`\`

### 3. Basic Setup

Initialize the Twilio client with your Account SID and Auth Token:

\`\`\`typescript
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
\`\`\`

### 4. Sending SMS Messages

#### Basic SMS

\`\`\`typescript
async function sendSMS(to: string, message: string) {
  try {
    const sms = await client.messages.create({
      body: message,
      to: to, // Must include country code, e.g., '+1234567890'
      from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio phone number
    });

    console.log('SMS sent successfully:', sms.sid);
    return { success: true, messageSid: sms.sid };
  } catch (error) {
    console.error('Error sending SMS:', error);
    return { success: false, error };
  }
}
\`\`\`

#### SMS with Media (MMS)

\`\`\`typescript
async function sendMMS(to: string, message: string, mediaUrl: string) {
  try {
    const mms = await client.messages.create({
      body: message,
      to: to,
      from: process.env.TWILIO_PHONE_NUMBER,
      mediaUrl: [mediaUrl], // Array of media URLs
    });

    console.log('MMS sent successfully:', mms.sid);
    return { success: true, messageSid: mms.sid };
  } catch (error) {
    console.error('Error sending MMS:', error);
    return { success: false, error };
  }
}
\`\`\`

### 5. Notification Templates

#### Welcome Message

\`\`\`typescript
async function sendWelcomeMessage(to: string, userName: string) {
  const message = \`Welcome to our service, \${userName}! We're excited to have you on board.\`;
  
  return await sendSMS(to, message);
}
\`\`\`

#### OTP Verification

\`\`\`typescript
async function sendOTPVerification(to: string, otp: string) {
  const message = \`Your verification code is: \${otp}. This code will expire in 10 minutes.\`;
  
  return await sendSMS(to, message);
}
\`\`\`

#### Order Updates

\`\`\`typescript
async function sendOrderUpdate(to: string, orderNumber: string, status: string) {
  const message = \`Order #\${orderNumber} has been \${status}. Track your order at: https://your-app.com/orders/\${orderNumber}\`;
  
  return await sendSMS(to, message);
}
\`\`\`

### 6. Bulk SMS

\`\`\`typescript
async function sendBulkSMS(recipients: string[], message: string) {
  const results = [];
  
  for (const recipient of recipients) {
    try {
      const result = await sendSMS(recipient, message);
      results.push({ recipient, ...result });
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      results.push({ 
        recipient, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  return results;
}
\`\`\`

### 7. Message Status Tracking

\`\`\`typescript
async function getMessageStatus(messageSid: string) {
  try {
    const message = await client.messages(messageSid).fetch();
    
    return {
      success: true,
      status: message.status,
      dateCreated: message.dateCreated,
      dateSent: message.dateSent,
      dateUpdated: message.dateUpdated,
      price: message.price,
      priceUnit: message.priceUnit,
    };
  } catch (error) {
    console.error('Error fetching message status:', error);
    return { success: false, error };
  }
}
\`\`\`

### 8. Phone Number Validation

\`\`\`typescript
async function validatePhoneNumber(phoneNumber: string) {
  try {
    const lookup = await client.lookups.v1.phoneNumbers(phoneNumber).fetch();
    
    return {
      success: true,
      isValid: true,
      phoneNumber: lookup.phoneNumber,
      nationalFormat: lookup.nationalFormat,
      countryCode: lookup.countryCode,
    };
  } catch (error) {
    console.error('Phone number validation error:', error);
    return { success: false, isValid: false, error };
  }
}
\`\`\`

### 9. Error Handling

\`\`\`typescript
async function sendSMSWithErrorHandling(to: string, message: string) {
  try {
    // Validate phone number first
    const validation = await validatePhoneNumber(to);
    if (!validation.isValid) {
      return { success: false, error: 'Invalid phone number' };
    }

    const sms = await client.messages.create({
      body: message,
      to: to,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    return { success: true, messageSid: sms.sid };
  } catch (error: any) {
    if (error.code === 21211) {
      return { success: false, error: 'Invalid To number' };
    } else if (error.code === 21212) {
      return { success: false, error: 'Invalid From number' };
    } else if (error.code === 21408) {
      return { success: false, error: 'Permission denied for destination number' };
    } else if (error.code === 21610) {
      return { success: false, error: 'Message blocked as spam' };
    } else {
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to send SMS' };
    }
  }
}
\`\`\`

### 10. Environment Variables

Set the following environment variables:

- \`TWILIO_ACCOUNT_SID\`: Your Twilio Account SID
- \`TWILIO_AUTH_TOKEN\`: Your Twilio Auth Token  
- \`TWILIO_PHONE_NUMBER\`: Your Twilio phone number (for sending messages)

### 11. Best Practices

1. **Phone Number Format**: Always use E.164 format (+1234567890)
2. **Rate Limiting**: Implement delays between bulk messages
3. **Error Handling**: Handle specific Twilio error codes appropriately
4. **Message Length**: SMS messages are limited to 160 characters (longer messages are split)
5. **Compliance**: Follow SMS marketing regulations and opt-out requirements
6. **Cost Management**: Monitor usage and costs through the Twilio Console`,
        human_added_notes:
          "This is a recommended integration for implementing SMS notifications and messaging functionality.",
        env_variables: [
          {
            id: "TWILIO_ACCOUNT_SID",
            description:
              "Your Twilio Account SID found in the Twilio Console dashboard. This identifies your Twilio account.",
          },
          {
            id: "TWILIO_AUTH_TOKEN",
            description:
              "Your Twilio Auth Token found in the Twilio Console dashboard. This is used to authenticate API requests.",
          },
          {
            id: "TWILIO_PHONE_NUMBER",
            description:
              "Your Twilio phone number in E.164 format (e.g., +1234567890). This is the number that will send the SMS messages.",
          },
        ],
        user_instructions: `1. Go to the Twilio website at https://www.twilio.com/

2. Click "Sign up" to create a new account or "Log in" if you already have one

3. Complete the account verification process (phone and email verification)

4. Once logged in, go to the Twilio Console at https://console.twilio.com/

5. On the dashboard, you'll find your Account SID and Auth Token

6. Copy the Account SID (starts with "AC")

7. Click the "show" button next to Auth Token and copy it

8. To get a phone number:
   - Go to "Phone Numbers" > "Manage" > "Buy a number"
   - Choose your country and select a number
   - Complete the purchase

9. Add these to your environment variables:
   - TWILIO_ACCOUNT_SID: Your Account SID
   - TWILIO_AUTH_TOKEN: Your Auth Token
   - TWILIO_PHONE_NUMBER: Your purchased phone number

Note: Keep your Auth Token secure and never share it publicly.`,
        images: [],
        last_updated: Date.now(),
      });
    }

    // Create Twitter API integration if it doesn't exist
    if (!existingTwitter) {
      await ctx.db.insert("integration", {
        cover_image: "https://abs.twimg.com/favicons/twitter.2.ico",
        reference_id: "twitter_api",
        title: "Twitter API",
        description:
          "Post tweets, interact with users, and access Twitter's features using the official Twitter API v2.",
        tags: ["Social Media", "Twitter", "API", "Posting", "Social"],
        type: "official",
        public: true,
        recommended: true,
        documentation_urls: [
          "https://developer.twitter.com/en/docs/twitter-api",
          "https://github.com/plhery/node-twitter-api-v2",
          "https://developer.twitter.com/en/docs/authentication",
          "https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/introduction",
        ],
        llm_instructions: `### 1. Overview

The Twitter API v2 allows you to post tweets, interact with users, and access Twitter's features programmatically. This integration uses the twitter-api-v2 library, which provides a comprehensive TypeScript-friendly interface for both v1.1 and v2 endpoints.

### 2. Installation

Install the twitter-api-v2 library:

\`\`\`bash
# Install the twitter-api-v2 package
npm install twitter-api-v2
\`\`\`

### 3. Authentication Setup

Initialize the Twitter API client with your credentials:

\`\`\`typescript
import { TwitterApi } from 'twitter-api-v2';

// For OAuth 1.0a (user context - recommended for posting tweets)
const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// For OAuth 2.0 (app-only - read-only access)
const bearerClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
\`\`\`

### 4. Posting Tweets

#### Basic Tweet

\`\`\`typescript
async function postTweet(text: string) {
  try {
    const tweet = await client.v2.tweet(text);
    
    console.log('Tweet posted successfully:', tweet.data.id);
    return { 
      success: true, 
      tweetId: tweet.data.id, 
      text: tweet.data.text 
    };
  } catch (error) {
    console.error('Error posting tweet:', error);
    return { success: false, error };
  }
}
\`\`\`

#### Tweet with Poll

\`\`\`typescript
async function postTweetWithPoll(text: string, options: string[], durationMinutes: number = 60) {
  try {
    const tweet = await client.v2.tweet(text, {
      poll: {
        duration_minutes: durationMinutes,
        options: options
      }
    });

    console.log('Tweet with poll posted:', tweet.data.id);
    return { success: true, tweetId: tweet.data.id };
  } catch (error) {
    console.error('Error posting tweet with poll:', error);
    return { success: false, error };
  }
}
\`\`\`

#### Tweet with Media

\`\`\`typescript
async function postTweetWithImage(text: string, imagePath: string) {
  try {
    // Upload media using v1.1 API
    const mediaId = await client.v1.uploadMedia(imagePath);
    
    // Post tweet with media using v2 API
    const tweet = await client.v2.tweet(text, {
      media: { media_ids: [mediaId] }
    });

    console.log('Tweet with image posted:', tweet.data.id);
    return { success: true, tweetId: tweet.data.id };
  } catch (error) {
    console.error('Error posting tweet with image:', error);
    return { success: false, error };
  }
}
\`\`\`

### 5. Tweet Thread

\`\`\`typescript
async function postTweetThread(tweets: string[]) {
  try {
    const thread = await client.v2.tweetThread(tweets);
    
    const tweetIds = thread.map(tweet => tweet.data.id);
    console.log('Thread posted successfully:', tweetIds);
    
    return { success: true, tweetIds };
  } catch (error) {
    console.error('Error posting thread:', error);
    return { success: false, error };
  }
}
\`\`\`

### 6. Replying to Tweets

\`\`\`typescript
async function replyToTweet(tweetId: string, replyText: string) {
  try {
    const reply = await client.v2.reply(replyText, tweetId);
    
    console.log('Reply posted:', reply.data.id);
    return { success: true, replyId: reply.data.id };
  } catch (error) {
    console.error('Error posting reply:', error);
    return { success: false, error };
  }
}
\`\`\`

### 7. Tweet Interactions

#### Like a Tweet

\`\`\`typescript
async function likeTweet(userId: string, tweetId: string) {
  try {
    await client.v2.like(userId, tweetId);
    
    console.log('Tweet liked successfully');
    return { success: true };
  } catch (error) {
    console.error('Error liking tweet:', error);
    return { success: false, error };
  }
}
\`\`\`

#### Retweet

\`\`\`typescript
async function retweetTweet(userId: string, tweetId: string) {
  try {
    await client.v2.retweet(userId, tweetId);
    
    console.log('Tweet retweeted successfully');
    return { success: true };
  } catch (error) {
    console.error('Error retweeting:', error);
    return { success: false, error };
  }
}
\`\`\`

### 8. Reading Tweets and User Data

#### Get User Information

\`\`\`typescript
async function getUserInfo(username: string) {
  try {
    const user = await client.v2.userByUsername(username);
    
    return {
      success: true,
      user: {
        id: user.data.id,
        name: user.data.name,
        username: user.data.username,
        description: user.data.description,
        publicMetrics: user.data.public_metrics
      }
    };
  } catch (error) {
    console.error('Error fetching user info:', error);
    return { success: false, error };
  }
}
\`\`\`

#### Get User Timeline

\`\`\`typescript
async function getUserTimeline(userId: string, maxResults: number = 10) {
  try {
    const timeline = await client.v2.userTimeline(userId, {
      max_results: maxResults,
      'tweet.fields': ['created_at', 'public_metrics']
    });

    const tweets = timeline.data.data || [];
    
    return {
      success: true,
      tweets: tweets.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at,
        metrics: tweet.public_metrics
      }))
    };
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return { success: false, error };
  }
}
\`\`\`

### 9. Search Tweets

\`\`\`typescript
async function searchTweets(query: string, maxResults: number = 10) {
  try {
    const tweets = await client.v2.search(query, {
      max_results: maxResults,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics']
    });

    return {
      success: true,
      tweets: tweets.data.data?.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id,
        createdAt: tweet.created_at,
        metrics: tweet.public_metrics
      })) || []
    };
  } catch (error) {
    console.error('Error searching tweets:', error);
    return { success: false, error };
  }
}
\`\`\`

### 10. Delete Tweet

\`\`\`typescript
async function deleteTweet(tweetId: string) {
  try {
    await client.v2.deleteTweet(tweetId);
    
    console.log('Tweet deleted successfully');
    return { success: true };
  } catch (error) {
    console.error('Error deleting tweet:', error);
    return { success: false, error };
  }
}
\`\`\`

### 11. Error Handling

\`\`\`typescript
async function postTweetWithErrorHandling(text: string) {
  try {
    const tweet = await client.v2.tweet(text);
    return { success: true, tweetId: tweet.data.id };
  } catch (error: any) {
    if (error.code === 403) {
      return { success: false, error: 'Forbidden - Check your API permissions' };
    } else if (error.code === 429) {
      return { success: false, error: 'Rate limit exceeded - Try again later' };
    } else if (error.errors?.[0]?.code === 187) {
      return { success: false, error: 'Duplicate tweet detected' };
    } else if (error.errors?.[0]?.code === 186) {
      return { success: false, error: 'Tweet is too long' };
    } else {
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to post tweet' };
    }
  }
}
\`\`\`

### 12. Environment Variables

Set the following environment variables:

For OAuth 1.0a (User Context):
- \`TWITTER_API_KEY\`: Your Twitter API Key (Consumer Key)
- \`TWITTER_API_SECRET\`: Your Twitter API Secret (Consumer Secret)
- \`TWITTER_ACCESS_TOKEN\`: Your Access Token
- \`TWITTER_ACCESS_SECRET\`: Your Access Token Secret

For OAuth 2.0 (App-only, read-only):
- \`TWITTER_BEARER_TOKEN\`: Your Bearer Token

### 13. Best Practices

1. **Rate Limits**: Twitter has strict rate limits. Implement proper retry logic and respect limits
2. **Authentication**: Use OAuth 1.0a for posting tweets, OAuth 2.0 for read-only operations
3. **Content Policy**: Follow Twitter's content policy and terms of service
4. **Error Handling**: Handle specific Twitter API error codes appropriately
5. **Media Uploads**: Use v1.1 API for media uploads, then reference in v2 tweets
6. **Monitoring**: Monitor your API usage through the Twitter Developer Dashboard`,
        human_added_notes:
          "This is a recommended integration for implementing Twitter functionality and social media posting.",
        env_variables: [
          {
            id: "TWITTER_API_KEY",
            description:
              "Your Twitter API Key (Consumer Key) from the Twitter Developer Dashboard. This identifies your Twitter application.",
          },
          {
            id: "TWITTER_API_SECRET",
            description:
              "Your Twitter API Secret (Consumer Secret) from the Twitter Developer Dashboard. Used for application authentication.",
          },
          {
            id: "TWITTER_ACCESS_TOKEN",
            description:
              "Your Twitter Access Token from the Twitter Developer Dashboard. Used for user authentication and posting tweets.",
          },
          {
            id: "TWITTER_ACCESS_SECRET",
            description:
              "Your Twitter Access Token Secret from the Twitter Developer Dashboard. Used with the access token for authentication.",
          },
        ],
        user_instructions: `1. Go to the Twitter Developer Portal at https://developer.twitter.com/

2. Click "Sign up" or "Sign in" with your Twitter account

3. Apply for a developer account:
   - Select your use case (e.g., "Building tools for Twitter users")
   - Fill out the application form with your intended use
   - Wait for approval (can take 1-2 business days)

4. Once approved, create a new project:
   - Click "Create Project"
   - Choose your use case and give it a name
   - Create an app within the project

5. In your app settings, generate your keys:
   - Go to "Keys and tokens" tab
   - Generate API Key and Secret (these are your Consumer Key/Secret)
   - Generate Access Token and Secret

6. Set up your environment variables:
   - TWITTER_API_KEY: Your API Key (Consumer Key)
   - TWITTER_API_SECRET: Your API Secret (Consumer Secret)  
   - TWITTER_ACCESS_TOKEN: Your Access Token
   - TWITTER_ACCESS_SECRET: Your Access Token Secret

7. Enable proper permissions:
   - Go to "Settings" tab
   - Set App permissions to "Read and write" (for posting tweets)

Note: Keep all tokens secure and never share them publicly. Twitter API v2 requires approved developer access.`,
        images: [],
        last_updated: Date.now(),
      });
    }

    // Create Convex Geospatial integration if it doesn't exist
    if (!existingConvexGeospatial) {
      await ctx.db.insert("integration", {
        cover_image: "https://docs.convex.dev/img/logo.svg",
        reference_id: "convex_geospatial",
        title: "Convex Geospatial",
        description:
          "Build location-aware applications with geospatial data storage, querying, and real-time updates in Convex.",
        tags: [
          "Geospatial",
          "Location",
          "Maps",
          "GPS",
          "Coordinates",
          "Database",
        ],
        type: "official",
        public: true,
        recommended: true,
        documentation_urls: [
          "https://docs.convex.dev/database/schemas",
          "https://docs.convex.dev/database/indexes",
          "https://docs.convex.dev/functions/query-functions",
          "https://github.com/get-convex/aggregate",
        ],
        llm_instructions: `### 1. Overview

This integration provides patterns and utilities for building geospatial applications with Convex. It includes location data storage, proximity queries, geofencing, and real-time location updates for building location-aware applications.

### 2. Schema Setup

Define your geospatial data schema in Convex:

\`\`\`typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  locations: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    latitude: v.number(),
    longitude: v.number(),
    altitude: v.optional(v.number()),
    address: v.optional(v.string()),
    category: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    metadata: v.optional(v.object({
      radius: v.optional(v.number()),
      tags: v.optional(v.array(v.string())),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_category", ["category"])
    .index("by_lat_lng", ["latitude", "longitude"])
    .index("by_created_at", ["createdAt"]),

  user_locations: defineTable({
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    altitude: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    timestamp: v.number(),
    isActive: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_timestamp", ["timestamp"]),

  geofences: defineTable({
    name: v.string(),
    centerLatitude: v.number(),
    centerLongitude: v.number(),
    radius: v.number(), // in meters
    userId: v.id("users"),
    isActive: v.boolean(),
    notifications: v.optional(v.object({
      onEnter: v.optional(v.boolean()),
      onExit: v.optional(v.boolean()),
      message: v.optional(v.string()),
    })),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_active", ["isActive"]),
});
\`\`\`

### 3. Distance Calculation Utilities

\`\`\`typescript
// convex/utils/geospatial.ts

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Calculate bounding box for a given center point and radius
 */
export function getBoundingBox(
  centerLat: number,
  centerLng: number,
  radiusMeters: number
) {
  const R = 6371000; // Earth's radius in meters
  const latOffset = (radiusMeters / R) * (180 / Math.PI);
  const lngOffset = latOffset / Math.cos((centerLat * Math.PI) / 180);

  return {
    minLat: centerLat - latOffset,
    maxLat: centerLat + latOffset,
    minLng: centerLng - lngOffset,
    maxLng: centerLng + lngOffset,
  };
}

/**
 * Check if a point is within a circular geofence
 */
export function isPointInCircle(
  pointLat: number,
  pointLng: number,
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): boolean {
  const distance = calculateDistance(pointLat, pointLng, centerLat, centerLng);
  return distance <= radiusMeters;
}
\`\`\`

### 4. Location Management

#### Create Location

\`\`\`typescript
// convex/locations.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createLocation = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    latitude: v.number(),
    longitude: v.number(),
    altitude: v.optional(v.number()),
    address: v.optional(v.string()),
    category: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    const locationId = await ctx.db.insert("locations", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    return locationId;
  },
});
\`\`\`

#### Find Nearby Locations

\`\`\`typescript
import { calculateDistance, getBoundingBox } from "./utils/geospatial";

export const findNearbyLocations = query({
  args: {
    latitude: v.number(),
    longitude: v.number(),
    radiusMeters: v.number(),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { latitude, longitude, radiusMeters, category, limit = 50 } = args;
    
    // Get bounding box for initial filtering
    const bbox = getBoundingBox(latitude, longitude, radiusMeters);
    
    // Query locations within bounding box
    let locationsQuery = ctx.db
      .query("locations")
      .withIndex("by_lat_lng", (q) =>
        q.gte("latitude", bbox.minLat).lte("latitude", bbox.maxLat)
      );

    if (category) {
      locationsQuery = ctx.db
        .query("locations")
        .withIndex("by_category", (q) => q.eq("category", category));
    }

    const locations = await locationsQuery.collect();

    // Filter by precise distance and add distance field
    const nearbyLocations = locations
      .map((location) => {
        const distance = calculateDistance(
          latitude,
          longitude,
          location.latitude,
          location.longitude
        );
        
        return {
          ...location,
          distance,
        };
      })
      .filter((location) => location.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return nearbyLocations;
  },
});
\`\`\`

### 5. User Location Tracking

#### Update User Location

\`\`\`typescript
export const updateUserLocation = mutation({
  args: {
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    altitude: v.optional(v.number()),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, latitude, longitude, altitude, accuracy } = args;
    const timestamp = Date.now();

    // Deactivate previous location
    const existingActive = await ctx.db
      .query("user_locations")
      .withIndex("by_user_active", (q) => 
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    if (existingActive) {
      await ctx.db.patch(existingActive._id, { isActive: false });
    }

    // Insert new location
    const locationId = await ctx.db.insert("user_locations", {
      userId,
      latitude,
      longitude,
      altitude,
      accuracy,
      timestamp,
      isActive: true,
    });

    return locationId;
  },
});

export const getUserLocation = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const location = await ctx.db
      .query("user_locations")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .first();

    return location;
  },
});
\`\`\`

### 6. Geofencing

#### Create Geofence

\`\`\`typescript
export const createGeofence = mutation({
  args: {
    name: v.string(),
    centerLatitude: v.number(),
    centerLongitude: v.number(),
    radius: v.number(),
    userId: v.id("users"),
    notifications: v.optional(v.object({
      onEnter: v.optional(v.boolean()),
      onExit: v.optional(v.boolean()),
      message: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const geofenceId = await ctx.db.insert("geofences", {
      ...args,
      isActive: true,
      createdAt: Date.now(),
    });

    return geofenceId;
  },
});
\`\`\`

#### Check Geofence Triggers

\`\`\`typescript
import { isPointInCircle } from "./utils/geospatial";

export const checkGeofenceTriggers = query({
  args: {
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, latitude, longitude } = args;

    // Get user's active geofences
    const geofences = await ctx.db
      .query("geofences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const triggers = [];

    for (const geofence of geofences) {
      const isInside = isPointInCircle(
        latitude,
        longitude,
        geofence.centerLatitude,
        geofence.centerLongitude,
        geofence.radius
      );

      if (isInside && geofence.notifications?.onEnter) {
        triggers.push({
          geofenceId: geofence._id,
          type: "enter",
          message: geofence.notifications.message || \`Entered \${geofence.name}\`,
        });
      }
    }

    return triggers;
  },
});
\`\`\`

### 7. Spatial Aggregation with Convex Components

For advanced spatial analytics, you can use the Convex Aggregate component:

\`\`\`typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(aggregate, { name: "locationAggregates" });

export default app;
\`\`\`

\`\`\`typescript
// convex/spatial_analytics.ts
import { components } from "./_generated/api";
import { TableAggregate } from "@convex-dev/aggregate";
import { DataModel } from "./_generated/dataModel";

const locationsByGrid = new TableAggregate<{
  Key: [number, number]; // [lat_grid, lng_grid]
  DataModel: DataModel;
  TableName: "locations";
}>(components.locationAggregates, {
  sortKey: (doc) => [
    Math.floor(doc.latitude * 100), // Grid precision
    Math.floor(doc.longitude * 100),
  ],
});

// Count locations in a grid cell
export const getLocationDensity = query({
  args: {
    latGrid: v.number(),
    lngGrid: v.number(),
  },
  handler: async (ctx, args) => {
    const bounds = { prefix: [args.latGrid, args.lngGrid] };
    const count = await locationsByGrid.count(ctx, { bounds });
    return count;
  },
});
\`\`\`

### 8. Frontend Integration

\`\`\`typescript
// React component example
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export function LocationTracker() {
  const updateLocation = useMutation(api.locations.updateUserLocation);
  const nearbyLocations = useQuery(api.locations.findNearbyLocations, {
    latitude: userLocation?.latitude || 0,
    longitude: userLocation?.longitude || 0,
    radiusMeters: 5000,
  });

  const handleLocationUpdate = async () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await updateLocation({
            userId: "user_id", // Get from auth
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => console.error("Location error:", error)
      );
    }
  };

  return (
    <div>
      <button onClick={handleLocationUpdate}>
        Update Location
      </button>
      
      <h3>Nearby Locations</h3>
      {nearbyLocations?.map((location) => (
        <div key={location._id}>
          <h4>{location.name}</h4>
          <p>{Math.round(location.distance)}m away</p>
        </div>
      ))}
    </div>
  );
}
\`\`\`

### 9. Best Practices

1. **Indexing**: Create proper indexes for latitude/longitude queries
2. **Precision**: Use appropriate precision for coordinates based on your use case
3. **Bounding Box**: Use bounding box filtering before precise distance calculations
4. **Rate Limiting**: Implement rate limiting for location updates
5. **Privacy**: Handle location data with appropriate privacy controls
6. **Real-time**: Leverage Convex's real-time features for live location updates
7. **Performance**: Consider spatial partitioning for large datasets

### 10. Advanced Features

- Grid-based spatial indexing for performance
- Real-time location sharing between users
- Historical location tracking and analytics
- Integration with mapping services (Google Maps, Mapbox)
- Spatial clustering and heatmaps
- Route calculation and optimization`,
        human_added_notes:
          "This integration provides comprehensive geospatial functionality for building location-aware applications with Convex.",
        env_variables: [],
        user_instructions: `This integration doesn't require any external API keys as it uses Convex's built-in database capabilities.

To get started:

1. Install the Convex Aggregate component (optional for advanced features):
   - Install the package: \`npm install @convex-dev/aggregate\`

2. Set up your schema:
   - Copy the provided schema examples to your convex/schema.ts file
   - Modify the schema to match your specific use case

3. Create utility functions:
   - Add the geospatial utility functions to convex/utils/geospatial.ts

4. Implement location functions:
   - Add the provided mutations and queries to your Convex functions
   - Customize them based on your application needs

5. Frontend integration:
   - Use the provided React examples as a starting point
   - Implement location tracking in your frontend application

6. Test your implementation:
   - Test location creation, nearby searches, and geofencing
   - Verify real-time updates work correctly

Note: This integration leverages Convex's built-in database and real-time capabilities for geospatial functionality.`,
        images: [],
        last_updated: Date.now(),
      });
    }

    console.log("Recommended integrations created successfully");
    return { success: true };
  },
});
