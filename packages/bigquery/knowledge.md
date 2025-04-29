# BigQuery Integration

This package provides integration with Google BigQuery for storing and analyzing Codebuff usage data.

## Key Components

- `client.ts`: Manages BigQuery client initialization and operations
- `schema.ts`: Defines table schemas and types for traces and relabels

## Environment Configuration

The BigQuery dataset name is determined by the environment:
- Production: `codebuff_data`
- Development: `codebuff_data_dev`

## Tables

### Traces Table
Stores agent interaction traces with fields:
- id (UUID)
- agent_step_id (links traces within a single agent step)
- user_id
- created_at
- type
- payload (JSON)

### Relabels Table
Stores relabeling data with fields:
- id (UUID)
- agent_step_id
- user_id
- created_at
- model
- payload (JSON)

## Usage

```typescript
import { setupBigQuery, insertTrace } from '@codebuff/bigquery';

// Initialize BigQuery client
await setupBigQuery();

// Insert a trace
await insertTrace({
  id: 'trace-id',
  agent_step_id: 'step-id',
  user_id: 'user-id',
  created_at: new Date(),
  type: 'get-relevant-files',
  payload: { /* ... */ }
});
```

## Best Practices

1. Always initialize BigQuery client before operations:
   ```typescript
   await setupBigQuery();
   ```

2. Handle insertion failures gracefully:
   ```typescript
   const success = await insertTrace(trace);
   if (!success) {
     logger.error('Failed to insert trace');
   }
   ```

3. Use appropriate trace types:
   - 'get-relevant-files'
   - 'file-trees'
   - 'agent-response'