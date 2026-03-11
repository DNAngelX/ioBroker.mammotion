![Logo](admin/mammotion.png)
# ioBroker.mammotion

[![NPM version](https://img.shields.io/npm/v/iobroker.mammotion.svg)](https://www.npmjs.com/package/iobroker.mammotion)
[![Downloads](https://img.shields.io/npm/dm/iobroker.mammotion.svg)](https://www.npmjs.com/package/iobroker.mammotion)
![Number of Installations](https://iobroker.live/badges/mammotion-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/mammotion-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.mammotion.png?downloads=true)](https://nodei.co/npm/iobroker.mammotion/)

## Mammotion adapter for ioBroker

Cloud adapter for Mammotion Luba/Yuka devices.

## Features

- Login via Mammotion cloud (`id.mammotion.com`)
- Device discovery and automatic object creation under `mammotion.0.devices.*`
- Command support (start, pause, resume, stop, dock, cancel, route, non-work-hours, blade control)
- Telemetry via MQTT where available
- Telemetry fallback via Aliyun API polling (`thing/properties/get`, `thing/status/get`)
- Session retry/reconnect handling when app and adapter logins conflict
- Automatic faster polling after commands and while device is active

## Installation

1. Install adapter (local/dev or later via npm/repository).
2. Open adapter instance settings.
3. Enter Mammotion app credentials.
4. Save and start/restart the instance.

## Configuration

- `email`: Mammotion account email
- `password`: Mammotion account password
- `deviceUuid`: optional app device UUID (default is prefilled)
- `legacyPollIntervalSec`: base polling interval for legacy telemetry (10-300 sec)
- `legacyTelemetryTransport`: currently `poll` is used (`mqtt` option is reserved)

## Objects

### Info

- `info.connection`
- `info.mqttConnected`
- `info.deviceCount`
- `info.lastMessageTs`
- `info.lastError`

### Account

- `account.expiresAt`
- `account.userId`
- `account.userAccount`
- `account.iotDomain`

### Per device

- `devices.<id>.name`, `iotId`, `deviceId`, `deviceType`, `deviceTypeText`, ...
- `devices.<id>.telemetry.*` (battery, state, gps, last payload/topic/update, ...)
- `devices.<id>.commands.*` (actions + writable parameters)

## Command behavior

- Action states (`start`, `pause`, `dock`, `applyTaskSettings`, ...) are trigger states (`true` -> execute -> auto reset to `false`).
- `targetCutHeightMm` + `targetMowSpeedMs` are auto-applied after value changes (debounced).
- Route settings are auto-applied via `modifyRoute` after value changes (debounced).
- Non-work settings are auto-applied via `applyNonWorkHours` after value changes (debounced).
- Additional immediate IoT sync is requested after commands to refresh telemetry faster.

## Notes

- `telemetry.lastUpdate` only means a telemetry packet was processed. If values do not change, the cloud may be returning unchanged data.
- Mammotion cloud sessions can invalidate each other (mobile app vs adapter). Adapter includes retry and reconnect logic.
- Device quantization may differ from input resolution. Example: API accepts integer mm, but app UI can still show only 5 mm steps depending on model/firmware.

## Development

```bash
npm install
npm run check
npm run build
npm run dev-server
```

## Changelog

### 0.0.2
- Improved telemetry refresh strategy (adaptive polling + post-command sync)
- Automatic apply for task, route and non-work settings
- Extended command handling and retry flow

## License

MIT License

Copyright (c) 2026 DNAngel
