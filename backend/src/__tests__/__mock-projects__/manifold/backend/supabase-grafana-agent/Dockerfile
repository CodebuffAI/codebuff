FROM grafana/agent
COPY agent.yaml /etc/agent/
COPY run.sh /run.sh
RUN chmod +x /run.sh
USER root
ENTRYPOINT ["/run.sh"]
