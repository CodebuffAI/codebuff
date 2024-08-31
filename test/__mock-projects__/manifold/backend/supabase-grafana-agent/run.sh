#!/bin/bash -e

exec /bin/grafana-agent                                     \
  --config.file=/etc/agent/agent.yaml                       \
  --metrics.wal-directory=/etc/agent/data                   \
  --config.expand-env
