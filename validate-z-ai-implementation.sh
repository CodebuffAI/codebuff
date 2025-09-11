#!/bin/bash

# Simple validation script to check Z.ai implementation
# This validates the structure without requiring full environment setup

echo "🔍 Z.ai Implementation Validation"
echo "=================================="

# Check if files exist
echo "📁 Checking file structure..."

files=(
    "/Users/gwizz/CascadeProjects/codebuff/backend/src/llm-apis/vercel-ai-sdk/z-ai.ts"
    "/Users/gwizz/CascadeProjects/codebuff/common/src/old-constants.ts"
    "/Users/gwizz/CascadeProjects/codebuff/packages/internal/src/env.ts"
    "/Users/gwizz/CascadeProjects/codebuff/backend/src/llm-apis/vercel-ai-sdk/ai-sdk.ts"
    "/Users/gwizz/CascadeProjects/codebuff/CONTRIBUTION.md"
    "/Users/gwizz/CascadeProjects/codebuff/Z_AI_INTEGRATION_SUMMARY.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $(basename $file) exists"
    else
        echo "❌ $(basename $file) missing"
    fi
done

# Check Z.ai provider implementation
echo ""
echo "🧪 Checking Z.ai provider implementation..."

if grep -q "export const zAi" "/Users/gwizz/CascadeProjects/codebuff/backend/src/llm-apis/vercel-ai-sdk/z-ai.ts"; then
    echo "✅ Z.ai provider exported"
else
    echo "❌ Z.ai provider not found"
fi

# Check environment variables
echo ""
echo "🔧 Checking environment variable configuration..."

if grep -q "Z_AI_API_KEY" "/Users/gwizz/CascadeProjects/codebuff/packages/internal/src/env.ts"; then
    echo "✅ Z_AI_API_KEY configured"
else
    echo "❌ Z_AI_API_KEY not configured"
fi

if grep -q "Z_AI_BASE_URL" "/Users/gwizz/CascadeProjects/codebuff/packages/internal/src/env.ts"; then
    echo "✅ Z_AI_BASE_URL configured"
else
    echo "❌ Z_AI_BASE_URL not configured"
fi

# Check model definitions
echo ""
echo "🤖 Checking model definitions..."

if grep -q "zAiModels" "/Users/gwizz/CascadeProjects/codebuff/common/src/old-constants.ts"; then
    echo "✅ Z.ai models defined"
else
    echo "❌ Z.ai models not defined"
fi

if grep -q "glm4_5" "/Users/gwizz/CascadeProjects/codebuff/common/src/old-constants.ts"; then
    echo "✅ GLM-4.5 model defined"
else
    echo "❌ GLM-4.5 model not defined"
fi

# Check AI SDK integration
echo ""
echo "🔗 Checking AI SDK integration..."

if grep -q "zAiModels" "/Users/gwizz/CascadeProjects/codebuff/backend/src/llm-apis/vercel-ai-sdk/ai-sdk.ts"; then
    echo "✅ AI SDK integration updated"
else
    echo "❌ AI SDK integration not updated"
fi

# Check test files
echo ""
echo "🧪 Checking test files..."

test_files=(
    "/Users/gwizz/CascadeProjects/codebuff/backend/src/__tests__/z-ai-integration.test.ts"
    "/Users/gwizz/CascadeProjects/codebuff/backend/src/__tests__/z-ai-provider.test.ts"
)

for test_file in "${test_files[@]}"; do
    if [ -f "$test_file" ]; then
        echo "✅ $(basename $test_file) exists"
    else
        echo "❌ $(basename $test_file) missing"
    fi
done

# Check test script
if [ -f "/Users/gwizz/CascadeProjects/codebuff/backend/test-z-ai-integration.sh" ]; then
    echo "✅ Test script exists"
    if [ -x "/Users/gwizz/CascadeProjects/codebuff/backend/test-z-ai-integration.sh" ]; then
        echo "✅ Test script is executable"
    else
        echo "❌ Test script is not executable"
    fi
else
    echo "❌ Test script missing"
fi

# Check configuration example
if [ -f "/Users/gwizz/CascadeProjects/codebuff/backend/.env.z-ai.example" ]; then
    echo "✅ Configuration example exists"
else
    echo "❌ Configuration example missing"
fi

echo ""
echo "🎉 Validation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Set up environment variables in your .env file"
echo "2. Run: cd backend && ./test-z-ai-integration.sh"
echo "3. Start the application with: bun src/index.ts"
echo ""
echo "📚 Documentation:"
echo "- CONTRIBUTION.md: Complete implementation guide"
echo "- Z_AI_INTEGRATION_SUMMARY.md: Package overview"
echo "- .env.z-ai.example: Configuration example"