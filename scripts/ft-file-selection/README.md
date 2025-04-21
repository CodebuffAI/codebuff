## Scripts

Contains a variety of scripts for inspecting and processing finetuning data from BigQuery.

`print-recent-traces.ts [--prod]` - Prints the most recent traces from BigQuery.

`print-recent-relabels.ts [--prod]` - Prints the most recent relabels from BigQuery.

`relabel-traces.ts [--prod]` - Relabels traces in BigQuery, ie: generates new outputs using more powerful models for real production inputs.

`collect-tuning-data.ts <model> [--prod]` - Downloads tuning data from BigQuery, using real inputs + relabeled outputs. The `model` parameter controls which relabeler model is used. 

