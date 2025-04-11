here's deets:
a) "ft_filepicker_capture"
contains actual captured data
fields: 
* id (uuid primarykey)
* timestamp
* messages (stringified json)
* system (stringified json)
* other (arbitrary jsonb record of string to string)
b) "ft_filepicker_traces"
* id (uuid pkey)
* timestamp
* captureId (points to a ft_filepicker_capture's uuid)
* model (string)
* output (string)
c) "ft_filepicker_evals"
* id (uuid pkey) 
* captureId (points to a ft_filepicker_capture's uuid)
* traceIds (JSONB array pointing to an array of traces)
* result (stringified json)
* output (string0

then, the vibe is something like:
* captures are real user data we capture
* we run a script to ingest them and output traces
* we run another script to ingest them and outputs evals - comparing various trace options
* finally, we finetune on the traces, then re-run evals etc

how does that sound