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
- Finetune samples: 1934 messages
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
- Finetune samples: 1077 messages
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
  - over $660 for generating relabel inputs (at $15.00/1M input Claude tokens + some additional file context tokens)

`ft_filepicker_topk_001`
- Gemini Endpoint ID: 3676445825887633408
- Finetune date: May 30, 2025
- Finetune file: gemini-tune-data-039-top2.jsonl, available in the GCS bucket
- Validation file: gemini-tune-data-039-top2-validation.jsonl, available in the GCS bucket
- Finetune samples: 1432 messages
- Validation samples: 119 messages
- Tokens: 60.5M
- Epochs: 2
- Base model: gemini-2.0-flash-001
- Distilled model: claude-opus-4-20250514 
- Notes: 
  - Trained only on the top-2 file predictions from claude-opus-4
    - Otherwise, identical to the `ft_filepicker_007` finetune
  - Forced maximum adapter size, and 2 epochs
- Est costs:
  - ~$300 for finetuning ($3.00/1M tokens * 1 epoch * 44.7M tokens)
  - Mostly reuses relabel inputs from other Claude runs - no additional cost anticipated.

`ft_filepicker_008`
- Gemini Endpoint ID: 2672143108984012800
- Finetune date: May 31, 2025
- Finetune file: gemini-tune-data-043.jsonl, available in the GCS bucket
- Validation file: gemini-tune-data-043.jsonl, available in the GCS bucket
- Finetune samples: 2648 messages
- Validation samples: 253 messages
- Tokens: 108M
- Epochs: 2
- Base model: gemini-2.0-flash-001
- Distilled model: claude-opus-4-20250514 
- Notes: 
  - Identical to `ft_filepicker_007` - except more data and epochs
- Est costs:
  - $648 for finetuning ($3.00/1M tokens * 2 epoch * 108M tokens)
  - about $3K for generating relabel inputs (at $15.00/1M input Claude tokens + some additional file context tokens) (about lot of this reused from ft_filepicker_007 though)

`ft_filepicker_topk_002`
- Gemini Endpoint ID: 1694861989844615168
- Finetune date: May 31, 2025
- Finetune file: gemini-tune-data-045-top2.jsonl, available in the GCS bucket
- Validation file: gemini-tune-data-045-top2-validation.jsonl, available in the GCS bucket
- Finetune samples: 909 messages
- Validation samples: 71 messages
- Tokens: TBD
- Epochs: 2
- Base model: gemini-2.0-flash-001
- Distilled model: claude-opus-4-20250514 
- Notes: 
  - Similar to `ft_filepicker_topk_001` but each input has three lines of dashes appended to the end - to encourage it to "stop" early
  - Super small training run to test: "does this work at all?" - thus fewer epochs and less data.
- Est costs:
  - TBD for finetuning ($3.00/1M tokens * 1 epoch * 44.7M tokens)
  - Mostly reuses relabel inputs from other Claude runs - no additional cost anticipated.

`ft_filepicker_010`
- Gemini Endpoint ID: 3808739064941641728
- Finetune date: June 2, 2025
- Finetune file: gemini-tune-data-048.jsonl
- Finetune samples: 2648 messages
- Tokens: 109M
- Epochs: 3
- Base model: gemini-2.0-flash-001
- Distilled model: claude-opus-4-20250514 
- Notes: 
  - Same training data as `ft_filepicker_008` but with assistant messages converted to user messages
  - This preprocessing change aims to improve the model's ability to handle conversation context
  - Uses the BLOBBIFY_MESSAGE_HISTORY approach where assistant messages are wrapped in `<previous_assistant_message>` tags and converted to user messages
  - 3 epochs instead of 2 to improve results
  - Also try `ft_filepicker_010_epoch_2` if you wanna compare what one less epoch does.
- Est costs:
  - ~$980 for finetuning ($3.00/1M tokens * 3 epochs * 109M tokens)
  - Reuses relabel inputs from ft_filepicker_008 - no additional labeling cost

`ft_filepicker_topk_003`
- Gemini Endpoint ID: 1502192368286171136
- Finetune date: Jun 5, 2025
- Finetune file: gemini-tune-data-048-top2.jsonl, available in the GCS bucket
- Finetune samples: 2648 messages
- Tokens: 109M
- Epochs: 2
- Base model: gemini-2.0-flash-001
- Distilled model: claude-opus-4-20250514 
- Notes: 
  - Combines characteristics of `ft_filepicker_topk_002` and `ft_filepicker_010`, ie: uses top-2, with 3 lines of dashes at the end, but also blobbifies message history.
- Est costs:
  - ~$660 for finetuning ($3.00/1M tokens * 2 epochs * 109M tokens)
  - Mostly reuses relabel inputs from other Claude runs - no additional cost anticipated.

## Scripts

Contains a variety of scripts for inspecting and processing finetuning data from BigQuery.

`print-recent-traces.ts [--prod]` - Prints the most recent traces from BigQuery.

`print-recent-relabels.ts [--prod]` - Prints the most recent relabels from BigQuery.

`relabel-traces.ts [--prod]` - Relabels traces in BigQuery, ie: generates new outputs using more powerful models for real production inputs.

`relabel-traces-with-context.ts [--prod]` - Relabels traces using the uploaded "full file context"

`collect-tuning-data.ts <model> [--prod]` - Downloads tuning data from BigQuery, using real inputs + relabeled outputs. The `model` parameter controls which relabeler model is used. 

`relabel-for-offline-scoring.ts [--relabel|--score] [--prod]` - Relabels validation traces for offline evaluation or scores existing relabels using metrics like Jaccard similarity and MRR.
