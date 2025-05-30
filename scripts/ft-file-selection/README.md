## Finetune versions

`ft_filepicker_003`
- Gemini Endpoint ID: 196166068534771712
- Finetune file: gemini-tune-data-002.jsonl, available in the GCS bucket
- Finetune samples: 2 (just Venki's data)
- Finetune date: Apr 14, 2025
- Base model: gemini-2.0-flash-001
- Distilled model: claude-3-5-sonnet-20241022
- Notes: 
  - Test model, uses only 2 samples from Venki's local database 
  - Method: blind distillation from Claude's results 
- Est costs:
  - ~$0.1 each on finetuning & relabeling

`ft_filepicker_005`
- Gemini Endpoint ID: 8493203957034778624
- Finetune date: Apr 23, 2025
- Finetune file: gemini-tune-data-007.jsonl, available in the GCS bucket
- Finetune samples: 1934 model messages
- Tokens: 74.6M
- Epochs: 2
- Base model: gemini-2.0-flash-001
- Distilled model: claude-3-5-sonnet-20241022 
- Notes: 
  - Forced maximum adapter size, but kept all the other Gemini "advanced" finetuning parameters at default values. 
  - Has a minor data issue: `Non-Obvious` vs `Key` requests were not disambiguated, and thus requests were joined with relabels in an odd manner.
  - Seems okay for a test, but we might be encouraging the model to pick worse files etc. 
  - Might also be worth trying out other models to teach (eg: 3.7-reasoning? o3?)
- Est costs:
  - ~$400 for finetuning ($3.00/1M tokens * 2 epochs * 74.6M tokens)
  - ~$200 for generating relabel inputs (at $3.00/1M input Claude tokens)

`ft_filepicker_007`
- Gemini Endpoint ID: 2589952415784501248
- Finetune date: May 29, 2025
- Finetune file: gemini-tune-data-027.jsonl, available in the GCS bucket
- Finetune samples: 1077 model messages
- Tokens: 44.7M
- Epochs: 1
- Base model: gemini-2.0-flash-001
- Distilled model: claude-opus-4-20250514 
- Notes: 
  - Unlike previous finetunes, this also provided "additional file context" to the teacher model, so it not only used a stronger model, but also more informative context. 
  - Forced maximum adapter size, and 1 epoch
  - Only used 'Key' traces AFAIK - TODO: Will this worsen non-obvious, or encourage 'Key' to pick too many?
- Est costs:
  - ~$150 for finetuning ($3.00/1M tokens * 1 epoch * 44.7M tokens)
  - >$660 for generating relabel inputs (at $15.00/1M input Claude tokens + some additional file context tokens)


## Scripts

Contains a variety of scripts for inspecting and processing finetuning data from BigQuery.

`print-recent-traces.ts [--prod]` - Prints the most recent traces from BigQuery.

`print-recent-relabels.ts [--prod]` - Prints the most recent relabels from BigQuery.

`relabel-traces.ts [--prod]` - Relabels traces in BigQuery, ie: generates new outputs using more powerful models for real production inputs.

`collect-tuning-data.ts <model> [--prod]` - Downloads tuning data from BigQuery, using real inputs + relabeled outputs. The `model` parameter controls which relabeler model is used. 

