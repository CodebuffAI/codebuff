# BigQuery Integration

This package provides integration with Google BigQuery for storing and analyzing Codebuff usage data.

## Key Components

- `client.ts`: BigQuery client initialization and operations
- `schema.ts`: Table schemas and types for traces and relabels

## Environment Configuration

Dataset name determined by `NEXT_PUBLIC_CB_ENVIRONMENT`:
- Production: `codebuff_data`
- Development: `codebuff_data_dev`

## Tables

### Traces Table
Stores agent interaction traces:
- `id`, `agent_step_id`, `user_id`, `created_at`, `type`, `payload`
- Time partitioned by month on `created_at`
- Clustered by `user_id`, `agent_step_id`

### Relabels Table
Stores relabeling data:
- `id`, `agent_step_id`, `user_id`, `created_at`, `model`, `payload`
- Time partitioned by month on `created_at`
- Clustered by `user_id`, `agent_step_id`

## Trace Types

- `get-relevant-files`: File selection calls
- `file-trees`: File tree uploads
- `agent-response`: Agent responses
- `get-expanded-file-context-for-training`: Training data capture
- `get-expanded-file-context-for-training-blobs`: Full file context capture
- `grade-run`: Model grading results

## Usage

```typescript
import { setupBigQuery, insertTrace } from '@codebuff/bigquery'

// Initialize (creates dataset/tables if needed)
await setupBigQuery()

// Insert trace
await insertTrace({
  id: 'trace-id',
  agent_step_id: 'step-id', 
  user_id: 'user-id',
  created_at: new Date(),
  type: 'get-relevant-files',
  payload: { /* ... */ }
})
```

## Best Practices

- Always call `setupBigQuery()` before operations
- Handle insertion failures gracefully (functions return boolean)
- JSON payloads are automatically stringified for storage