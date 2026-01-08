import type { AgentDefinition } from '../../agents/types/agent-definition'

/**
 * Transform Agent
 *
 * Handles data transformation and normalization.
 * Second stage of ETL pipeline - converts raw data to canonical schemas.
 */

const agent: AgentDefinition = {
  id: 'transform-agent',
  displayName: 'Transform Agent',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'structured_output',
  includeMessageHistory: false,
  publisher: 'brandon',

  toolNames: [
    'read_files',
    'set_output',
    'write_file',
    'web_search',
    'end_turn',
  ],

  spawnableAgents: [],

  instructionsPrompt: `You are the Transform Agent - the data cleaning and normalization specialist.

Your role:
1. ACCEPT ANY DATA FORMAT like unstructured text, mixed formats, etc.
2. INTELLIGENTLY INFER structure and meaning from any input
3. Clean, normalize, and standardize data regardless of quality
4. Handle missing fields, inconsistent formats, and data quality issues gracefully
5. Output clean, structured data in requested format
6. Work with ANY domain - not limited to places/events/projects

Canonical Schemas:

Place Schema:
{
  "id": "place-sf-philz-24th",
  "name": "Philz Coffee",
  "address": "3101 24th St, San Francisco, CA",
  "coordinates": {"lat": 37.7749, "lng": -122.4194},
  "category": "coffee",
  "subcategory": "specialty-coffee",
  "hours": {
    "monday": "6:00-20:00",
    "timezone": "America/Los_Angeles"
  },
  "attributes": {
    "wifi": "excellent",
    "capacity": 45,
    "specialty": "custom blends",
    "priceRange": "$$",
    "amenities": ["wifi", "outdoor-seating", "parking"]
  },
  "ratings": {
    "overall": 4.2,
    "sources": {"yelp": 4.1, "google": 4.3}
  },
  "confidence": 0.92,
  "lastUpdated": "2024-01-15T08:30:00Z"
}

Event Schema:
{
  "id": "event-react-sf-jan-2024",
  "title": "React SF Monthly Meetup",
  "category": "tech",
  "subcategory": "frontend",
  "dateTime": {
    "start": "2024-01-18T18:30:00-08:00",
    "end": "2024-01-18T21:00:00-08:00",
    "timezone": "America/Los_Angeles"
  },
  "venue": {
    "placeId": "place-sf-galvanize-soma",
    "name": "Galvanize SF",
    "address": "44 Tehama St, San Francisco, CA"
  },
  "capacity": 120,
  "rsvpCount": 89,
  "cost": {
    "type": "free",
    "amount": 0,
    "currency": "USD"
  },
  "organizer": {
    "name": "React SF",
    "type": "community"
  },
  "tags": ["React", "JavaScript", "Frontend", "Networking"],
  "confidence": 0.95,
  "lastUpdated": "2024-01-15T08:30:00Z"
}

Project Schema:
{
  "id": "project-fintech-startup-soma",
  "name": "PayFlow",
  "category": "fintech",
  "stage": "seed",
  "description": "AI-powered expense management",
  "location": {
    "placeId": "place-sf-wework-soma",
    "venue": "WeWork SOMA",
    "neighborhood": "SOMA"
  },
  "team": {
    "size": 8,
    "founders": 2,
    "engineers": 4
  },
  "funding": {
    "stage": "seed",
    "amount": 2500000,
    "currency": "USD",
    "investors": ["Acme Ventures"]
  },
  "techStack": ["React", "Node.js", "PostgreSQL"],
  "competition": {
    "level": "medium",
    "competitors": ["Expensify", "Receipt Bank"]
  },
  "confidence": 0.78,
  "lastUpdated": "2024-01-15T08:30:00Z"
}

Flexible Transformation Process:
1. ACCEPT any input format - no validation requirements
2. INFER data structure and field meanings automatically
3. HANDLE missing, malformed, or inconsistent data gracefully
4. CLEAN using flexible rules:
   - Normalize dates in any format to consistent format
   - Standardize text fields (trim, case, encoding)
   - Handle null/empty values appropriately
   - Fix common data entry errors
5. DEDUPLICATE using intelligent fuzzy matching
6. ENRICH data when possible and requested
7. OUTPUT in any requested format (JSON, CSV, etc.)
8. PROVIDE confidence scores and data quality notes

Enrichment Services:
- Geocoding: Convert addresses to lat/lng
- Timezone: Normalize all times to location timezone
- Categories: Map to standardized taxonomy
- Quality scores: Aggregate ratings from multiple sources**OUTPUT FORMAT:**
You MUST return structured output following the defined JSON schema with:
- metadata: Processing statistics and transformation info
- schema: Field definitions and domain information
- data: Array of cleaned, normalized records
- errors: Processing errors and warnings encountered
- quality: Data quality metrics and scores

All records in the data array must have stable IDs, confidence scores, and timestamps.`,

  spawnerPrompt: `Use this agent to transform raw data into canonical schemas`,

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The user request for data transformation',
    },
    params: {
      type: 'object',
      properties: {
        extractArtifactPath: {
          type: 'string',
          description: 'Path to extraction artifact to transform (optional)',
        },
        domain: {
          type: 'string',
          description:
            'Data domain for schema selection (e.g., places, events, projects, or any custom domain)',
        },
        enrichmentConfig: {
          type: 'object',
          description: 'Which enrichment services to apply (all optional)',
          additionalProperties: true,
        },
        customSchema: {
          type: 'object',
          description:
            'Custom transformation schema if not using predefined domains',
          additionalProperties: true,
        },
        outputFormat: {
          type: 'string',
          description: 'Desired output format (json, csv, etc.)',
          default: 'json',
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Include transformation metadata and quality metrics',
          default: true,
        },
        validateOutput: {
          type: 'boolean',
          description: 'Validate output against schema before returning',
          default: true,
        },
        transformRules: {
          type: 'array',
          description: 'Custom transformation rules to apply',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      additionalProperties: true,
    },
  },

  outputSchema: {
    type: 'object',
    properties: {
      metadata: {
        type: 'object',
        properties: {
          transformationId: {
            type: 'string',
            description: 'Unique identifier for this transformation',
          },
          inputFormat: {
            type: 'string',
            enum: ['json', 'csv', 'xml', 'text', 'mixed'],
            description: 'Detected input format',
          },
          outputFormat: {
            type: 'string',
            default: 'json',
            description: 'Output format',
          },
          recordsProcessed: {
            type: 'integer',
            description: 'Number of input records processed',
          },
          recordsOutput: {
            type: 'integer',
            description: 'Number of output records generated',
          },
          duplicatesRemoved: {
            type: 'integer',
            description: 'Number of duplicate records removed',
          },
          errorCount: {
            type: 'integer',
            description: 'Number of processing errors',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Overall confidence in transformation quality',
          },
          processingTime: {
            type: 'string',
            description: "Processing time (e.g., '2.3s')",
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'ISO timestamp of transformation',
          },
        },
        required: ['transformationId'],
      },
      schema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            description: 'Data domain (places, events, projects, custom)',
          },
          version: { type: 'string', description: 'Schema version' },
          fields: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                required: { type: 'boolean' },
                description: { type: 'string' },
              },
              required: ['type', 'required'],
            },
          },
        },
        required: ['domain'],
      },
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique stable identifier' },
            name: { type: 'string', description: 'Primary name or title' },
            category: { type: 'string', description: 'Standardized category' },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Record confidence score',
            },
            sourceIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Source record identifiers',
            },
            lastUpdated: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
          required: ['id'],
          additionalProperties: true,
        },
      },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            recordIndex: {
              type: 'integer',
              description: 'Index of problematic record',
            },
            error: { type: 'string', description: 'Error description' },
            severity: {
              type: 'string',
              enum: ['warning', 'error'],
              description: 'Error severity',
            },
            action: {
              type: 'string',
              enum: ['skipped', 'defaulted', 'inferred'],
              description: 'Action taken',
            },
          },
          required: [],
        },
      },
      quality: {
        type: 'object',
        properties: {
          completeness: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Data completeness score',
          },
          consistency: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Data consistency score',
          },
          accuracy: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Data accuracy score',
          },
          duplicateRate: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Duplicate rate',
          },
          errorRate: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Error rate',
          },
        },
        required: [],
      },
    },
    required: ['data'],
  },

  systemPrompt: `You are the Transform Agent - the ultimate data cleaning specialist.

You excel at:
- Processing ANY data format (JSON, CSV, XML, text, mixed, malformed)
- Handling dirty, incomplete, or inconsistent data gracefully
- Inferring structure and meaning from messy inputs
- Cleaning and normalizing data without strict schema requirements
- Working with any domain or data type
- Being extremely flexible and accommodating

Your philosophy: "No data is too messy to clean, but output must be pristine"

Transform approach:
1. ACCEPT whatever data format is provided
2. INFER the intended structure and meaning
3. CLEAN inconsistencies, missing values, format issues
4. NORMALIZE to consistent, usable format
5. OUTPUT in MANDATORY STRUCTURED FORMAT with metadata, schema, data, errors, and quality metrics

Speak like a flexible data cleaning system:
"[TRANSFORM] Accepting mixed format data, inferring structure..."
"[CLEAN] Handling 23 inconsistent date formats, normalizing all"
"[NORMALIZE] Processing unstructured text into structured records"`,

  stepPrompt: `Transform raw extracted data into canonical structured format.`,
}

export default agent
