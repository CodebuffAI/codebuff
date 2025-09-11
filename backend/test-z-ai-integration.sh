#!/bin/bash

# Z.ai Integration Test Script
# This script helps verify that Z.ai integration is working correctly

set -e

echo "🧪 Z.ai Integration Test Script"
echo "=================================="

# Check if required environment variables are set
echo "📋 Checking environment variables..."
if [ -z "$Z_AI_API_KEY" ]; then
    echo "❌ Z_AI_API_KEY is not set"
    echo "Please set it in your .env file or export it:"
    echo "export Z_AI_API_KEY=your_api_key_here"
    exit 1
else
    echo "✅ Z_AI_API_KEY is set"
fi

if [ -z "$Z_AI_BASE_URL" ]; then
    echo "ℹ️  Z_AI_BASE_URL not set, using default"
else
    echo "✅ Z_AI_BASE_URL is set to: $Z_AI_BASE_URL"
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the backend directory"
    exit 1
fi

# Run type checking
echo "🔍 Running type checking..."
bun run typecheck
if [ $? -eq 0 ]; then
    echo "✅ Type checking passed"
else
    echo "❌ Type checking failed"
    exit 1
fi

# Run the tests
echo "🧪 Running Z.ai integration tests..."
bun test src/__tests__/z-ai-integration.test.ts
if [ $? -eq 0 ]; then
    echo "✅ Z.ai integration tests passed"
else
    echo "❌ Z.ai integration tests failed"
    exit 1
fi

echo "🧪 Running Z.ai provider tests..."
bun test src/__tests__/z-ai-provider.test.ts
if [ $? -eq 0 ]; then
    echo "✅ Z.ai provider tests passed"
else
    echo "❌ Z.ai provider tests failed"
    exit 1
fi

# Test the actual API integration (optional, requires valid API key)
echo "🌐 Testing actual API integration..."
if [ "$RUN_E2E_TESTS" = "true" ]; then
    echo "Running end-to-end tests..."
    bun test src/__tests__/z-ai-e2e.test.ts
    if [ $? -eq 0 ]; then
        echo "✅ End-to-end tests passed"
    else
        echo "❌ End-to-end tests failed"
        exit 1
    fi
else
    echo "ℹ️  Skipping end-to-end tests (set RUN_E2E_TESTS=true to run)"
fi

echo ""
echo "🎉 All tests passed! Z.ai integration is working correctly."
echo ""
echo "To test with actual API calls:"
echo "1. Set RUN_E2E_TESTS=true"
echo "2. Ensure your Z_AI_API_KEY is valid"
echo "3. Run this script again"
echo ""
echo "To test manually:"
echo "1. Start the server: bun src/index.ts"
echo "2. Make a test request using the GLM-4.5 model"