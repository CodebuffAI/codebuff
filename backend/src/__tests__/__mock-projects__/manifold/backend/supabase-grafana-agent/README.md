# supabase-grafana-agent

Configuration for our fly.io Grafana agent host that is responsible for scraping
the Supabase Prometheus endpoint and sending metrics to Grafana Cloud so we can
look at them on https://manifoldmarkets.grafana.net/.

To deploy the agent, use `flyctl deploy`.

Mostly thanks to https://github.com/supabase/grafana-agent-fly-example.
