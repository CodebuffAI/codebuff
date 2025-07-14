# Message Format Migration Implementation Guide

## Overview for Future Agent

This document provides a complete roadmap for implementing the **Message → CoreMessage migration** in the Codebuff codebase. This is a high-complexity, cross-cutting change that requires careful coordination between frontend and backend systems.

## 🎯 Mission Statement

**Eliminate the custom `Message[]` type and use `CoreMessage[]` directly throughout the codebase to simplify LLM integration and improve type safety.**

## 🔍 Key Context You Need to Understand

### Current Architecture Pain Points

1. **The `transformMessages()` Bottleneck**: Located in `backend/src/features/llm/providers/vercel-ai-sdk/ai-sdk.ts`, this function is the main conversion point between custom `Message` format and `CoreMessage` format. **Your goal is to eliminate this function entirely.**

2. **WebSocket Protocol Dependency**: The client-server communication uses `Message[]` format. Changing this requires **coordinated frontend/backend updates** - you cannot do this migration backend-only.

3. **Critical `timeToLive` System**: The `CodebuffMessage` type extends `CoreMessage` with a `timeToLive` property that controls message expiration:
   ```typescript
   timeToLive: 'agentStep' | 'userPrompt' | undefined
   ```
   **This system prevents memory leaks and MUST be preserved.**

### Architecture Overview

```
Client (npm-app) ──[Message[]]──> WebSocket ──[Message[]]──> Backend
                                                                │
                                                                ▼
                                                    transformMessages() 
                                                                │
                                                                ▼
                                                         [CoreMessage[]]
                                                                │
                                                                ▼
                                                         LLM Providers
```

**Target Architecture:**
```
Client (npm-app) ──[CoreMessage[]]──> WebSocket ──[CoreMessage[]]──> Backend ──> LLM Providers
```

## 🚨 Critical Success Factors

### 1. **Preserve Message Expiration System**
- The `expireMessages()` function in `backend/src/util/messages.ts` is essential
- Messages with `timeToLive: 'agentStep'` expire after agent steps
- Messages with `timeToLive: 'userPrompt'` expire after user prompts
- **Breaking this will cause memory leaks**

### 2. **Maintain Cache Control Performance**
- Cache control reduces LLM costs significantly
- Functions like `withCacheControlCore()` must continue working
- Cache control is applied to the last message in conversations

### 3. **WebSocket Protocol Compatibility**
- Frontend and backend must be updated together
- Consider implementing protocol versioning
- Plan for graceful degradation during deployment

### 4. **Content Type Transformation**
The biggest complexity is handling different content formats:

**Custom Message format:**
```typescript
// Image with base64 source
{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: string } }
```

**CoreMessage format:**
```typescript
// Image with data URL  
{ type: 'image', image: 'data:image/jpeg;base64,..data..' }
```

## 📋 Implementation Strategy

### Phase 1: Preparation & Analysis
1. **Use `code_search` tool** to find all `Message[]` usage patterns
2. **Read these critical files first**:
   - `backend/src/features/llm/providers/vercel-ai-sdk/ai-sdk.ts` (main transformation logic)
   - `backend/src/util/messages.ts` (message utilities)
   - `common/src/types/message.ts` (type definitions)
   - `common/src/types/session-state.ts` (session state)
   - `backend/src/features/websockets/websocket-action.ts` (WebSocket communication)

### Phase 2: Create Compatibility Layer
1. **Extend CoreMessage with timeToLive**:
   ```typescript
   export type CodebuffMessage = CoreMessage & {
     timeToLive?: 'agentStep' | 'userPrompt'
   }
   ```
2. **Create adapter functions** for gradual migration
3. **Add runtime validation** to catch conversion errors

### Phase 3: Backend Migration
1. **Update message utilities** (`backend/src/util/messages.ts`)
2. **Modify session state** (`common/src/types/session-state.ts`)
3. **Update WebSocket handlers** (`backend/src/features/websockets/`)
4. **Remove `transformMessages()`** function

### Phase 4: Frontend Coordination
1. **Update npm-app WebSocket client** to use CoreMessage format
2. **Modify session state handling** in frontend
3. **Test end-to-end communication**

### Phase 5: Testing & Validation
1. **Run all existing tests** - they should pass
2. **Test WebSocket communication** end-to-end
3. **Validate message expiration** still works correctly
4. **Check cache control** functionality
5. **Performance testing** to ensure no regression

## 🔧 Key Files to Modify

### High Priority (Core Changes)
- `backend/src/features/llm/providers/vercel-ai-sdk/ai-sdk.ts` - Remove transformMessages()
- `backend/src/util/messages.ts` - Update all message utilities
- `common/src/types/message.ts` - Update type definitions
- `common/src/types/session-state.ts` - Update session state types

### Medium Priority (Integration Points)
- `backend/src/features/websockets/websocket-action.ts` - WebSocket communication
- `backend/src/features/llm/providers/message-cost-tracker.ts` - Cost tracking
- `backend/src/features/llm/providers/check-for-loop.ts` - Loop detection

### Frontend Coordination Required
- `npm-app/src/` - WebSocket client and session handling

## 🧪 Testing Strategy

### Unit Tests
- Test message transformation logic
- Validate cache control application  
- Check message expiration functionality
- Test content type conversions

### Integration Tests
- End-to-end WebSocket communication
- LLM provider integration with new format
- Agent execution with CoreMessage format

### Performance Tests
- Measure token counting performance
- Validate cache control effectiveness
- Check memory usage patterns

## ⚠️ Risk Mitigation

### High Risk Areas
1. **WebSocket communication** - Could break client-server sync
2. **Message expiration** - Could cause memory leaks
3. **Cache control** - Could increase LLM costs
4. **Tool call handling** - Complex transformation logic

### Mitigation Strategies
1. **Feature flags** - Enable gradual rollout
2. **Backward compatibility** - Support both formats temporarily
3. **Comprehensive testing** - Cover all message types
4. **Monitoring** - Track performance and error rates

## 🎯 Success Metrics Checklist

Track your progress with these concrete metrics:

- [ ] **Zero `transformMessages()` calls in codebase** - Main goal achieved
- [ ] **All tests passing with CoreMessage format** - No regressions
- [ ] **WebSocket communication working end-to-end** - Frontend/backend sync
- [ ] **Message expiration system functional** - Memory management preserved
- [ ] **Cache control preserved and working** - Performance maintained
- [ ] **No performance regression** - System remains fast
- [ ] **Type safety maintained throughout** - TypeScript compilation clean

## 💡 Pro Tips for Success

### 1. **Start with Read-Only Operations**
Begin migration with functions that only read messages, not modify them.

### 2. **Use Type Guards**
Create utility functions to safely check message types during transition:
```typescript
function isCodebuffMessage(msg: any): msg is CodebuffMessage {
  return msg && typeof msg.role === 'string'
}
```

### 3. **Preserve Existing Behavior**
Focus on maintaining exact same functionality, just with different types.

### 4. **Test Incrementally**
After each file migration, run tests to catch issues early.

### 5. **Use Code Search Extensively**
Use `code_search` tool to find all references when renaming/removing functions.

## 🚀 Getting Started Commands

1. **Find all Message[] usage**:
   ```bash
   code_search "Message\[\]" --flags "-t ts"
   ```

2. **Find transformMessages calls**:
   ```bash
   code_search "transformMessages" --flags "-t ts"
   ```

3. **Check current tests**:
   ```bash
   bun run typecheck  # in backend/
   bun test           # in common/
   ```

## 📊 Estimated Effort

**High complexity migration requiring:**
- 2-3 weeks of focused development
- Coordination between frontend and backend teams  
- Extensive testing across all message flows
- Careful rollout strategy

## 🎉 Expected Benefits After Completion

- **Simplified LLM integration** - No more custom transformation logic
- **Better type safety** - Direct use of industry-standard CoreMessage
- **Reduced maintenance burden** - Less custom code to maintain
- **Improved performance** - Fewer transformations in hot paths

---

**Remember**: This is a foundational change that touches many parts of the system. Take your time, test thoroughly, and don't hesitate to ask for clarification on any part of the codebase you're unsure about.
