# MQTT broker

| File | Use |
|---|---|
| `config/mosquitto.conf` | Development only. Anonymous, published on 127.0.0.1 by docker-compose. |
| `config/mosquitto.prod.conf` | Production. TLS on 8883, password file, ACL file, no anonymous access. |
| `config/acl.example` | ACL template. Copy to `config/acl`. |

## Topic tree

```
tenant/{organisationId}/site/{siteId}/edge/heartbeat
tenant/{organisationId}/site/{siteId}/hardware/status
tenant/{organisationId}/site/{siteId}/sync/status
tenant/{organisationId}/site/{siteId}/alerts
tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/scale/weight
tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/gate/status
tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/gate/command   (edge subscribes)
tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/rfid/event
tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/sensors/state
tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/state
tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/transaction
```

The edge controller receives its exact prefix from `GET /api/edge/config` (`mqtt.topicPrefix`). Every payload carries an ISO `ts` and a per-topic increasing `seq`. The edge rejects gate commands older than 30 s or with a reused `seq` (replay protection).

## Adding an edge controller

```bash
# username = the site's id (UUID), so the ACL pattern confines it to its own site
docker compose exec mosquitto mosquitto_passwd -b /mosquitto/config/passwd <siteId> '<strong password>'
docker compose exec mosquitto kill -HUP 1      # reload
```

Give the edge `WB_MQTT_URL=mqtts://broker.example.com:8883`, `WB_MQTT_USERNAME=<siteId>`, `WB_MQTT_PASSWORD=...`, and `WB_MQTT_TLS_CA=/path/ca.crt`.

## Not yet implemented

The web platform publishes through `lib/mqtt.ts` but has no subscriber. Dashboards use edge heartbeats over HTTPS (`POST /api/edge/heartbeat`) and polling. A cloud-side MQTT subscriber that pushes to browsers is on the roadmap.
