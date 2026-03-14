"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_axios = __toESM(require("axios"));
var import_node_crypto = require("node:crypto");
const mqtt = require("mqtt");
const MAMMOTION_DOMAIN = "https://id.mammotion.com";
const MAMMOTION_API_DOMAIN = "https://domestic.mammotion.com";
const DEVICE_UUID_FALLBACK = "A9D0F177-F701-4212-8676-EDF9B354AE48";
const OAUTH_APP_KEY = "GxebgSt8si6pKqR";
const OAUTH_APP_SECRET = "JP0508SRJFa0A90ADpzLINDBxMa4Vj";
const TOKEN_ENDPOINT = "/oauth2/token";
const LEGACY_ALIYUN_DOMAIN = "api.link.aliyun.com";
const LEGACY_APP_KEY = "34231230";
const LEGACY_APP_SECRET = "1ba85698bb10e19c6437413b61ba3445";
const LEGACY_APP_VERSION = "1.11.130";
const LEGACY_MOVE_HEADERS = /* @__PURE__ */ new Set([
  "x-ca-signature",
  "x-ca-signature-headers",
  "accept",
  "content-md5",
  "content-type",
  "date",
  "host",
  "token",
  "user-agent"
]);
const DEVICE_TYPE_NAMES = {
  0: "RTK",
  1: "Luba 1",
  2: "Luba 2",
  3: "Yuka",
  4: "Yuka Mini",
  5: "Yuka Mini 2",
  6: "Luba VP",
  7: "Luba MN",
  8: "Yuka VP",
  9: "Spino",
  10: "RTK 3A1",
  11: "Luba LD",
  12: "RTK 3A0",
  13: "RTK 3A2",
  14: "Yuka MV",
  15: "Luba VA",
  16: "Yuka ML",
  17: "Luba MD",
  18: "Luba LA",
  19: "Spino S1",
  20: "Spino E1",
  21: "Yuka MN100",
  22: "RTK NB",
  23: "Luba MB",
  24: "CM900"
};
const WORK_MODE_NAMES = {
  0: "NOT_ACTIVE",
  1: "ONLINE",
  2: "OFFLINE",
  8: "DISABLE",
  10: "INITIALIZATION",
  11: "READY",
  12: "UNCONNECTED",
  13: "WORKING",
  14: "RETURNING",
  15: "CHARGING",
  16: "UPDATING",
  17: "LOCK",
  19: "PAUSE",
  20: "MANUAL_MOWING",
  22: "UPDATE_SUCCESS",
  23: "OTA_UPGRADE_FAIL",
  31: "JOB_DRAW",
  32: "OBSTACLE_DRAW",
  34: "CHANNEL_DRAW",
  35: "ERASER_DRAW",
  36: "EDIT_BOUNDARY",
  37: "LOCATION_ERROR",
  38: "BOUNDARY_JUMP",
  39: "CHARGING_PAUSE"
};
const ROUTE_JOB_MODE_NAMES = {
  0: "MODE_0",
  1: "MODE_1",
  2: "MODE_2",
  3: "MODE_3",
  4: "STANDARD"
};
const ROUTE_CHANNEL_MODE_NAMES = {
  0: "PARALLEL",
  1: "CROSSCHECK",
  2: "SEGMENT",
  3: "ADAPTIVE"
};
const ROUTE_ULTRAWAVE_MODE_NAMES = {
  0: "DIRECT_TOUCH",
  1: "SLOW_TOUCH",
  2: "LESS_TOUCH",
  10: "DIRECT_TOUCH_EDGE",
  11: "LESS_TOUCH_EDGE"
};
const ROUTE_TOWARD_MODE_NAMES = {
  0: "FIXED_ANGLE",
  1: "RELATIVE_ANGLE",
  2: "AUTO"
};
const ROUTE_BORDER_MODE_NAMES = {
  0: "NONE",
  1: "BORDER_FIRST"
};
const ACTIVE_DEVICE_STATES = /* @__PURE__ */ new Set([13, 14, 19, 20, 31, 32, 34, 35, 36, 37, 38]);
const IDLE_DEVICE_STATES = /* @__PURE__ */ new Set([0, 1, 2, 8, 10, 11, 12, 15, 16, 17, 22, 23, 39]);
const LEGACY_FAST_POLL_WINDOW_MS = 2 * 60 * 1e3;
class Mammotion extends utils.Adapter {
  mqttClient = null;
  session = null;
  legacySession = null;
  mqttTopicMap = /* @__PURE__ */ new Map();
  deviceContexts = /* @__PURE__ */ new Map();
  seq = 0;
  cloudConnected = false;
  authFailureSince = 0;
  reconnectTimer = null;
  legacyPollTimer = null;
  legacyLastPollAt = 0;
  taskSettingsAutoApplyTimers = /* @__PURE__ */ new Map();
  routeAutoApplyTimers = /* @__PURE__ */ new Map();
  nonWorkAutoApplyTimers = /* @__PURE__ */ new Map();
  legacyPollingEnabled = false;
  legacyPollInFlight = false;
  legacyHasActiveDevice = false;
  legacyFastPollUntil = 0;
  legacyUtdid = this.generateHardwareString(32);
  legacyMqttNotImplementedLogged = false;
  constructor(options = {}) {
    super({
      ...options,
      name: "mammotion"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    await this.ensureBaseStates();
    await this.setStateChangedAsync("info.connection", false, true);
    await this.setStateChangedAsync("info.mqttConnected", false, true);
    this.startReconnectTimer();
    if (!this.config.email || !this.config.password) {
      this.log.warn("Bitte Email und Passwort der Mammotion-App in den Adapter-Einstellungen eintragen.");
      return;
    }
    const deviceUuid = this.config.deviceUuid || DEVICE_UUID_FALLBACK;
    try {
      this.session = await this.createSession(deviceUuid);
      await this.refreshSessionAndDeviceCache();
      await this.subscribeStatesAsync("devices.*.commands.*");
      await this.requestIotSyncForAllDevices();
      this.log.info(
        `Initialisierung erfolgreich: ${this.deviceContexts.size} Ger\xE4t(e), Telemetrie \xFCber ${this.mqttClient ? "MQTT" : this.legacySession ? "Aliyun Polling" : "keinen aktiven Kanal"}.`
      );
    } catch (err) {
      const msg = this.extractAxiosError(err);
      this.markAuthFailure(msg);
      await this.setStateChangedAsync("info.lastError", msg, true);
      this.log.error(`Mammotion Initialisierung fehlgeschlagen: ${msg}`);
    }
  }
  onUnload(callback) {
    try {
      if (this.mqttClient) {
        this.mqttClient.removeAllListeners();
        this.mqttClient.end(true);
        this.mqttClient = null;
      }
      if (this.reconnectTimer) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.clearAutoApplyTimers(this.taskSettingsAutoApplyTimers);
      this.clearAutoApplyTimers(this.routeAutoApplyTimers);
      this.clearAutoApplyTimers(this.nonWorkAutoApplyTimers);
      this.stopLegacyPolling();
      callback();
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
      callback();
    }
  }
  onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    const localId = id.replace(`${this.namespace}.`, "");
    const routeCommandMatch = localId.match(/^devices\.([^.]+)\.commands\.(generateRoute|modifyRoute|queryRoute)$/);
    if (routeCommandMatch) {
      if (state.val !== true) {
        return;
      }
      const deviceKey2 = routeCommandMatch[1];
      const mode = routeCommandMatch[2];
      void this.handleRouteCommand(deviceKey2, mode, localId);
      return;
    }
    const nonWorkHoursMatch = localId.match(/^devices\.([^.]+)\.commands\.applyNonWorkHours$/);
    if (nonWorkHoursMatch) {
      if (state.val !== true) {
        return;
      }
      const deviceKey2 = nonWorkHoursMatch[1];
      void this.handleNonWorkHoursCommand(deviceKey2, localId);
      return;
    }
    const bladeControlMatch = localId.match(/^devices\.([^.]+)\.commands\.applyBladeControl$/);
    if (bladeControlMatch) {
      if (state.val !== true) {
        return;
      }
      const deviceKey2 = bladeControlMatch[1];
      void this.handleBladeControlCommand(deviceKey2, localId);
      return;
    }
    const commandMatch = localId.match(/^devices\.([^.]+)\.commands\.(start|pause|resume|stop|dock|cancelJob|cancelDock)$/);
    if (commandMatch) {
      if (state.val !== true) {
        return;
      }
      const deviceKey2 = commandMatch[1];
      const command = commandMatch[2];
      void this.handleDeviceCommand(deviceKey2, command, localId);
      return;
    }
    const applyTaskSettingsMatch = localId.match(/^devices\.([^.]+)\.commands\.applyTaskSettings$/);
    if (applyTaskSettingsMatch) {
      if (state.val !== true) {
        return;
      }
      const deviceKey2 = applyTaskSettingsMatch[1];
      void this.handleTaskSettingsCommand(deviceKey2, localId);
      return;
    }
    const taskSettingMatch = localId.match(
      /^devices\.([^.]+)\.commands\.(targetCutHeightMm|targetMowSpeedMs|routeJobMode|routeJobVersion|routeJobId|routeUltraWave|routeChannelMode|routeChannelWidthCm|routeTowardDeg|routeTowardIncludedAngleDeg|routeTowardIncludedAngelDeg|routeTowardIncludedAngle|routeTowardIncludedAngel|routeTowardMode|routeMowingLaps|routeBorderMode|routeObstacleLaps|routeCollectGrassFrequency|routeStartProgress|routeIsMow|routeIsDump|routeIsEdge|routeAreasCsv|nonWorkStart|nonWorkEnd|nonWorkSubCmd|bladePowerOn|bladeHeightMm|bladeMaxSpeedMs)$/
    );
    if (!taskSettingMatch) {
      return;
    }
    const deviceKey = taskSettingMatch[1];
    const settingName = taskSettingMatch[2];
    const rawValue = state.val;
    if (settingName === "routeAreasCsv" || settingName === "nonWorkStart" || settingName === "nonWorkEnd") {
      const value = `${rawValue != null ? rawValue : ""}`.trim();
      void this.setStateChangedAsync(localId, value, true);
      if (settingName === "routeAreasCsv") {
        this.scheduleAutoApplyRoute(deviceKey);
      } else {
        this.scheduleAutoApplyNonWork(deviceKey);
      }
      return;
    }
    if (settingName === "routeIsMow" || settingName === "routeIsDump" || settingName === "routeIsEdge" || settingName === "bladePowerOn") {
      const boolValue = rawValue === true || rawValue === 1 || rawValue === "1" || rawValue === "true";
      void this.setStateChangedAsync(localId, boolValue, true);
      if (settingName === "routeIsMow" || settingName === "routeIsDump" || settingName === "routeIsEdge") {
        this.scheduleAutoApplyRoute(deviceKey);
      }
      return;
    }
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      void this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, `Ung\xFCltiger Wert f\xFCr ${settingName}.`, true);
      return;
    }
    void this.setStateChangedAsync(localId, numericValue, true);
    if (settingName === "targetCutHeightMm" || settingName === "targetMowSpeedMs") {
      this.scheduleAutoApplyTaskSettings(deviceKey);
      return;
    }
    if (this.isRouteSettingName(settingName)) {
      this.scheduleAutoApplyRoute(deviceKey);
      return;
    }
    if (settingName === "nonWorkSubCmd") {
      this.scheduleAutoApplyNonWork(deviceKey);
    }
  }
  scheduleAutoApplyTaskSettings(deviceKey) {
    const existing = this.taskSettingsAutoApplyTimers.get(deviceKey);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.taskSettingsAutoApplyTimers.delete(deviceKey);
      void this.handleTaskSettingsCommand(deviceKey, `devices.${deviceKey}.commands.applyTaskSettings`);
    }, 1500);
    this.taskSettingsAutoApplyTimers.set(deviceKey, timer);
  }
  clearAutoApplyTimers(map) {
    for (const timer of map.values()) {
      clearTimeout(timer);
    }
    map.clear();
  }
  isRouteSettingName(settingName) {
    return settingName === "routeJobMode" || settingName === "routeJobVersion" || settingName === "routeJobId" || settingName === "routeUltraWave" || settingName === "routeChannelMode" || settingName === "routeChannelWidthCm" || settingName === "routeTowardDeg" || settingName === "routeTowardIncludedAngleDeg" || settingName === "routeTowardIncludedAngelDeg" || settingName === "routeTowardIncludedAngle" || settingName === "routeTowardIncludedAngel" || settingName === "routeTowardMode" || settingName === "routeMowingLaps" || settingName === "routeBorderMode" || settingName === "routeObstacleLaps" || settingName === "routeCollectGrassFrequency" || settingName === "routeStartProgress";
  }
  scheduleAutoApplyRoute(deviceKey) {
    const existing = this.routeAutoApplyTimers.get(deviceKey);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.routeAutoApplyTimers.delete(deviceKey);
      void this.handleRouteCommand(deviceKey, "modify", `devices.${deviceKey}.commands.modifyRoute`);
    }, 2500);
    this.routeAutoApplyTimers.set(deviceKey, timer);
  }
  scheduleAutoApplyNonWork(deviceKey) {
    const existing = this.nonWorkAutoApplyTimers.get(deviceKey);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.nonWorkAutoApplyTimers.delete(deviceKey);
      void this.handleNonWorkHoursCommand(deviceKey, `devices.${deviceKey}.commands.applyNonWorkHours`);
    }, 1500);
    this.nonWorkAutoApplyTimers.set(deviceKey, timer);
  }
  async handleDeviceCommand(deviceKey, command, localId) {
    const ctx = this.deviceContexts.get(deviceKey);
    if (!ctx) {
      const msg = `Unbekanntes Ger\xE4t f\xFCr Command ${command}: ${deviceKey}`;
      this.log.warn(msg);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      await this.setStateChangedAsync(localId, false, true);
      return;
    }
    try {
      const result = await this.executeTaskControlCommand(ctx, command);
      const now = Date.now();
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, "", true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
      this.log.info(`Command ${command} f\xFCr ${ctx.deviceName || ctx.iotId} erfolgreich.`);
      await this.requestIotSync(ctx);
      await this.refreshTelemetryAfterCommand();
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (this.isAuthError(err, msg)) {
        this.markAuthFailure(msg);
      }
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      this.log.error(`Command ${command} f\xFCr ${ctx.deviceName || ctx.iotId} fehlgeschlagen: ${msg}`);
    } finally {
      await this.setStateChangedAsync(localId, false, true);
    }
  }
  async handleTaskSettingsCommand(deviceKey, localId) {
    const scheduled = this.taskSettingsAutoApplyTimers.get(deviceKey);
    if (scheduled) {
      clearTimeout(scheduled);
      this.taskSettingsAutoApplyTimers.delete(deviceKey);
    }
    const ctx = this.deviceContexts.get(deviceKey);
    if (!ctx) {
      const msg = `Unbekanntes Ger\xE4t f\xFCr Task-Settings: ${deviceKey}`;
      this.log.warn(msg);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      await this.setStateChangedAsync(localId, false, true);
      return;
    }
    try {
      const { cutHeightMm, mowSpeedMs } = await this.readTaskSettings(deviceKey);
      const result = await this.executeTaskSettingsCommand(ctx, cutHeightMm, mowSpeedMs);
      const now = Date.now();
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, "", true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
      this.log.info(
        `Task-Settings f\xFCr ${ctx.deviceName || ctx.iotId} erfolgreich: Schnitth\xF6he ${cutHeightMm} mm, Geschwindigkeit ${mowSpeedMs} m/s.`
      );
      await this.requestIotSync(ctx);
      await this.refreshTelemetryAfterCommand();
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (this.isAuthError(err, msg)) {
        this.markAuthFailure(msg);
      }
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      this.log.error(`Task-Settings f\xFCr ${ctx.deviceName || ctx.iotId} fehlgeschlagen: ${msg}`);
    } finally {
      await this.setStateChangedAsync(localId, false, true);
    }
  }
  async handleRouteCommand(deviceKey, mode, localId) {
    const scheduled = this.routeAutoApplyTimers.get(deviceKey);
    if (scheduled) {
      clearTimeout(scheduled);
      this.routeAutoApplyTimers.delete(deviceKey);
    }
    const ctx = this.deviceContexts.get(deviceKey);
    if (!ctx) {
      const msg = `Unbekanntes Ger\xE4t f\xFCr Route-Command ${mode}: ${deviceKey}`;
      this.log.warn(msg);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      await this.setStateChangedAsync(localId, false, true);
      return;
    }
    try {
      const routeSettings = await this.readRouteSettings(deviceKey);
      const result = await this.executeEncodedContentCommand(
        ctx,
        `route-${mode}`,
        (session, context) => this.buildRoutePlanningContent(session, context, routeSettings, mode)
      );
      const now = Date.now();
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, "", true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
      this.log.info(`Route-Command ${mode} f\xFCr ${ctx.deviceName || ctx.iotId} erfolgreich.`);
      await this.requestIotSync(ctx);
      await this.refreshTelemetryAfterCommand();
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (this.isAuthError(err, msg)) {
        this.markAuthFailure(msg);
      }
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      this.log.error(`Route-Command ${mode} f\xFCr ${ctx.deviceName || ctx.iotId} fehlgeschlagen: ${msg}`);
    } finally {
      await this.setStateChangedAsync(localId, false, true);
    }
  }
  async handleNonWorkHoursCommand(deviceKey, localId) {
    const scheduled = this.nonWorkAutoApplyTimers.get(deviceKey);
    if (scheduled) {
      clearTimeout(scheduled);
      this.nonWorkAutoApplyTimers.delete(deviceKey);
    }
    const ctx = this.deviceContexts.get(deviceKey);
    if (!ctx) {
      const msg = `Unbekanntes Ger\xE4t f\xFCr Non-Work-Hours: ${deviceKey}`;
      this.log.warn(msg);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      await this.setStateChangedAsync(localId, false, true);
      return;
    }
    try {
      const nonWorkHours = await this.readNonWorkHoursSettings(deviceKey);
      const result = await this.executeEncodedContentCommand(
        ctx,
        "set-non-work-hours",
        (session, context) => this.buildNonWorkHoursContent(session, context, nonWorkHours)
      );
      const now = Date.now();
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, "", true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
      this.log.info(
        `Non-Work-Hours f\xFCr ${ctx.deviceName || ctx.iotId} gesetzt: ${nonWorkHours.startTime}-${nonWorkHours.endTime}.`
      );
      await this.requestIotSync(ctx);
      await this.refreshTelemetryAfterCommand();
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (this.isAuthError(err, msg)) {
        this.markAuthFailure(msg);
      }
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      this.log.error(`Non-Work-Hours f\xFCr ${ctx.deviceName || ctx.iotId} fehlgeschlagen: ${msg}`);
    } finally {
      await this.setStateChangedAsync(localId, false, true);
    }
  }
  async handleBladeControlCommand(deviceKey, localId) {
    const ctx = this.deviceContexts.get(deviceKey);
    if (!ctx) {
      const msg = `Unbekanntes Ger\xE4t f\xFCr Blade-Control: ${deviceKey}`;
      this.log.warn(msg);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      await this.setStateChangedAsync(localId, false, true);
      return;
    }
    try {
      const bladeControl = await this.readBladeControlSettings(deviceKey);
      const result = await this.executeEncodedContentCommand(
        ctx,
        "blade-control",
        (session, context) => this.buildBladeControlContent(session, context, bladeControl)
      );
      const now = Date.now();
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, "", true);
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
      this.log.info(
        `Blade-Control f\xFCr ${ctx.deviceName || ctx.iotId} erfolgreich: ${bladeControl.powerOn ? "EIN" : "AUS"}, H\xF6he ${bladeControl.heightMm} mm.`
      );
      await this.requestIotSync(ctx);
      await this.refreshTelemetryAfterCommand();
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (this.isAuthError(err, msg)) {
        this.markAuthFailure(msg);
      }
      await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
      this.log.error(`Blade-Control f\xFCr ${ctx.deviceName || ctx.iotId} fehlgeschlagen: ${msg}`);
    } finally {
      await this.setStateChangedAsync(localId, false, true);
    }
  }
  async readTaskSettings(deviceKey) {
    const cutHeightState = await this.getStateAsync(`devices.${deviceKey}.commands.targetCutHeightMm`);
    const mowSpeedState = await this.getStateAsync(`devices.${deviceKey}.commands.targetMowSpeedMs`);
    const cutHeightMm = Math.trunc(Number(cutHeightState == null ? void 0 : cutHeightState.val));
    const mowSpeedMsRaw = Number(mowSpeedState == null ? void 0 : mowSpeedState.val);
    if (!Number.isFinite(cutHeightMm)) {
      throw new Error("Schnitth\xF6he ist ung\xFCltig.");
    }
    if (!Number.isFinite(mowSpeedMsRaw)) {
      throw new Error("M\xE4hgeschwindigkeit ist ung\xFCltig.");
    }
    const clampedCutHeight = Math.min(100, Math.max(20, cutHeightMm));
    const clampedMowSpeed = Math.min(1, Math.max(0.1, mowSpeedMsRaw));
    return {
      cutHeightMm: clampedCutHeight,
      mowSpeedMs: Number(clampedMowSpeed.toFixed(2))
    };
  }
  async readRouteSettings(deviceKey) {
    const cutHeightMm = await this.readNumericCommandState(deviceKey, "targetCutHeightMm", 65);
    const mowSpeedMs = await this.readNumericCommandState(deviceKey, "targetMowSpeedMs", 0.3);
    const routeJobMode = await this.readNumericCommandState(deviceKey, "routeJobMode", 4);
    const routeJobVersion = await this.readNumericCommandState(deviceKey, "routeJobVersion", 0);
    const routeJobId = await this.readNumericCommandState(deviceKey, "routeJobId", 0);
    const routeUltraWave = await this.readNumericCommandState(deviceKey, "routeUltraWave", 2);
    const routeChannelMode = await this.readNumericCommandState(deviceKey, "routeChannelMode", 0);
    const routeChannelWidthCm = await this.readNumericCommandState(deviceKey, "routeChannelWidthCm", 25);
    const routeTowardDeg = await this.readNumericCommandState(deviceKey, "routeTowardDeg", 0);
    const routeTowardIncludedAngleDeg = await this.readNumericCommandStateWithFallback(
      deviceKey,
      ["routeTowardIncludedAngleDeg", "routeTowardIncludedAngelDeg", "routeTowardIncludedAngle", "routeTowardIncludedAngel"],
      0
    );
    const routeTowardMode = await this.readNumericCommandState(deviceKey, "routeTowardMode", 0);
    const routeMowingLaps = await this.readNumericCommandState(deviceKey, "routeMowingLaps", 1);
    const routeBorderMode = await this.readNumericCommandState(deviceKey, "routeBorderMode", 1);
    const routeObstacleLaps = await this.readNumericCommandState(deviceKey, "routeObstacleLaps", 1);
    const routeCollectGrassFrequency = await this.readNumericCommandState(deviceKey, "routeCollectGrassFrequency", 10);
    const routeStartProgress = await this.readNumericCommandState(deviceKey, "routeStartProgress", 0);
    const routeAreasCsv = await this.readStringCommandState(deviceKey, "routeAreasCsv", "");
    const routeIsMow = await this.readBooleanCommandState(deviceKey, "routeIsMow", true);
    const routeIsDump = await this.readBooleanCommandState(deviceKey, "routeIsDump", true);
    const routeIsEdge = await this.readBooleanCommandState(deviceKey, "routeIsEdge", false);
    const areaHashes = this.parseAreaHashes(routeAreasCsv);
    if (!areaHashes.length) {
      throw new Error("Bitte mindestens eine Area-Hash-ID in commands.routeAreasCsv eintragen.");
    }
    return {
      areaHashes,
      cutHeightMm: Math.min(100, Math.max(15, Math.trunc(cutHeightMm))),
      mowSpeedMs: Number(Math.min(1.2, Math.max(0.1, mowSpeedMs)).toFixed(2)),
      jobMode: Math.min(10, Math.max(0, Math.trunc(routeJobMode))),
      jobVersion: Math.max(0, Math.trunc(routeJobVersion)),
      jobId: Math.max(0, Math.trunc(routeJobId)),
      ultraWave: Math.min(20, Math.max(0, Math.trunc(routeUltraWave))),
      channelMode: Math.min(3, Math.max(0, Math.trunc(routeChannelMode))),
      channelWidthCm: Math.min(50, Math.max(5, Math.trunc(routeChannelWidthCm))),
      towardDeg: Math.min(180, Math.max(-180, Math.trunc(routeTowardDeg))),
      towardIncludedAngleDeg: Math.min(180, Math.max(-180, Math.trunc(routeTowardIncludedAngleDeg))),
      towardMode: Math.min(2, Math.max(0, Math.trunc(routeTowardMode))),
      mowingLaps: Math.min(8, Math.max(0, Math.trunc(routeMowingLaps))),
      borderMode: Math.min(1, Math.max(0, Math.trunc(routeBorderMode))),
      obstacleLaps: Math.min(8, Math.max(0, Math.trunc(routeObstacleLaps))),
      collectGrassFrequency: Math.min(100, Math.max(0, Math.trunc(routeCollectGrassFrequency))),
      startProgress: Math.min(100, Math.max(0, Math.trunc(routeStartProgress))),
      isMow: routeIsMow,
      isDump: routeIsDump,
      isEdge: routeIsEdge
    };
  }
  async readNonWorkHoursSettings(deviceKey) {
    const startTime = await this.readStringCommandState(deviceKey, "nonWorkStart", "22:00");
    const endTime = await this.readStringCommandState(deviceKey, "nonWorkEnd", "07:00");
    const subCmd = await this.readNumericCommandState(deviceKey, "nonWorkSubCmd", 0);
    if (!this.isValidHourMinute(startTime)) {
      throw new Error(`Ung\xFCltige Startzeit: ${startTime} (Format HH:MM).`);
    }
    if (!this.isValidHourMinute(endTime)) {
      throw new Error(`Ung\xFCltige Endzeit: ${endTime} (Format HH:MM).`);
    }
    return {
      startTime,
      endTime,
      subCmd: Math.min(10, Math.max(0, Math.trunc(subCmd)))
    };
  }
  async readBladeControlSettings(deviceKey) {
    const powerOn = await this.readBooleanCommandState(deviceKey, "bladePowerOn", true);
    const heightMm = await this.readNumericCommandState(deviceKey, "bladeHeightMm", 60);
    const maxSpeedMs = await this.readNumericCommandState(deviceKey, "bladeMaxSpeedMs", 1.2);
    return {
      powerOn,
      heightMm: Math.min(100, Math.max(0, Math.trunc(heightMm))),
      maxSpeedMs: Number(Math.min(1.5, Math.max(0.1, maxSpeedMs)).toFixed(2))
    };
  }
  async readNumericCommandState(deviceKey, id, fallback) {
    const state = await this.getStateAsync(`devices.${deviceKey}.commands.${id}`);
    const value = Number(state == null ? void 0 : state.val);
    return Number.isFinite(value) ? value : fallback;
  }
  async readNumericCommandStateWithFallback(deviceKey, ids, fallback) {
    for (const id of ids) {
      const value = await this.readNumericCommandState(deviceKey, id, Number.NaN);
      if (Number.isFinite(value)) {
        return value;
      }
    }
    return fallback;
  }
  async readStringCommandState(deviceKey, id, fallback) {
    const state = await this.getStateAsync(`devices.${deviceKey}.commands.${id}`);
    if ((state == null ? void 0 : state.val) === null || (state == null ? void 0 : state.val) === void 0) {
      return fallback;
    }
    return `${state.val}`.trim();
  }
  async readBooleanCommandState(deviceKey, id, fallback) {
    const state = await this.getStateAsync(`devices.${deviceKey}.commands.${id}`);
    if ((state == null ? void 0 : state.val) === null || (state == null ? void 0 : state.val) === void 0) {
      return fallback;
    }
    return state.val === true || state.val === 1 || state.val === "1" || state.val === "true";
  }
  parseAreaHashes(value) {
    return value.split(/[,\s;]+/).map((v) => v.trim()).filter(Boolean).map((v) => {
      const parsed = v.startsWith("0x") || v.startsWith("0X") ? BigInt(v) : BigInt(v.replace(/_/g, ""));
      if (parsed <= 0n) {
        throw new Error(`Ung\xFCltiger Area-Hash: ${v}`);
      }
      return parsed;
    });
  }
  isValidHourMinute(value) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
  }
  async refreshTelemetryAfterCommand() {
    if (!this.deviceContexts.size) {
      return;
    }
    this.enableFastLegacyPollingWindow();
    try {
      const hasActiveDevice = await this.pollLegacyTelemetry();
      this.legacyHasActiveDevice = hasActiveDevice;
    } catch (err) {
      this.log.debug(`Sofortige Telemetrie-Aktualisierung fehlgeschlagen: ${this.extractAxiosError(err)}`);
    } finally {
      if (this.legacyPollTimer) {
        this.scheduleLegacyPolling(this.getLegacyNextPollDelayMs());
      }
    }
  }
  async requestIotSync(context, stop = false) {
    try {
      await this.executeEncodedContentCommand(
        context,
        stop ? "request-iot-sync-stop" : "request-iot-sync",
        (session, _context) => this.buildRequestIotSyncContent(session, stop)
      );
    } catch (err) {
      this.log.debug(
        `IOT-Sync f\xFCr ${context.deviceName || context.iotId} fehlgeschlagen: ${this.extractAxiosError(err)}`
      );
    }
  }
  async requestIotSyncForAllDevices(stop = false) {
    for (const context of this.deviceContexts.values()) {
      await this.requestIotSync(context, stop);
    }
  }
  async ensureValidSession(force = false) {
    if (!force && this.session && this.session.expiresAt > Date.now() + 6e4 && this.cloudConnected) {
      return this.session;
    }
    const deviceUuid = this.config.deviceUuid || DEVICE_UUID_FALLBACK;
    this.session = await this.createSession(deviceUuid);
    this.cloudConnected = true;
    this.authFailureSince = 0;
    await this.setStateChangedAsync("info.connection", true, true);
    return this.session;
  }
  async createSession(deviceUuid) {
    var _a, _b, _c;
    const clientId = this.buildClientId(deviceUuid);
    const login = await this.login(clientId);
    const iotDomain = this.extractIotDomain(login.access_token);
    const expiresAt = Date.now() + login.expires_in * 1e3;
    const session = {
      accessToken: login.access_token,
      expiresAt,
      iotDomain,
      userId: ((_a = login.userInformation) == null ? void 0 : _a.userId) || "",
      userAccount: ((_b = login.userInformation) == null ? void 0 : _b.userAccount) || "0",
      authorizationCode: login.authorization_code || "",
      countryCode: ((_c = login.userInformation) == null ? void 0 : _c.domainAbbreviation) || "",
      clientId
    };
    this.legacySession = null;
    await this.setStateChangedAsync("account.expiresAt", expiresAt, true);
    await this.setStateChangedAsync("account.userId", session.userId, true);
    await this.setStateChangedAsync("account.userAccount", session.userAccount, true);
    await this.setStateChangedAsync("account.iotDomain", session.iotDomain, true);
    return session;
  }
  async login(clientId) {
    const payload = {
      username: this.config.email,
      password: this.config.password,
      client_id: OAUTH_APP_KEY,
      grant_type: "password",
      authType: "0"
    };
    const signature = this.createOauthSignature(payload);
    const response = await import_axios.default.post(`${MAMMOTION_DOMAIN}/oauth2/token`, void 0, {
      headers: {
        "User-Agent": "okhttp/4.9.3",
        "App-Version": "ioBroker,0.0.1",
        "Ma-App-Key": OAUTH_APP_KEY,
        "Ma-Signature": signature,
        "Ma-Timestamp": `${Math.floor(Date.now() / 1e3)}`,
        "Client-Id": clientId,
        "Client-Type": "1"
      },
      params: payload,
      timeout: 1e4
    });
    if (response.data.code !== 0 || !response.data.data) {
      throw new Error(response.data.msg || `HTTP ${response.status}`);
    }
    return response.data.data;
  }
  async fetchDeviceList(session) {
    const response = await import_axios.default.get(
      `${MAMMOTION_API_DOMAIN}/device-server/v1/device/list`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "okhttp/4.9.3",
          "Client-Id": session.clientId,
          "Client-Type": "1"
        },
        timeout: 1e4
      }
    );
    if (response.data.code !== 0 || !Array.isArray(response.data.data)) {
      throw new Error(response.data.msg || `HTTP ${response.status}`);
    }
    return response.data.data;
  }
  async fetchDeviceRecords(session) {
    const response = await import_axios.default.post(
      `${session.iotDomain}/v1/user/device/page`,
      {
        iotId: "",
        pageNumber: 1,
        pageSize: 100
      },
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "okhttp/4.9.3",
          "Client-Id": session.clientId,
          "Client-Type": "1"
        },
        timeout: 1e4
      }
    );
    if (response.data.code !== 0 || !response.data.data) {
      throw new Error(response.data.msg || `HTTP ${response.status}`);
    }
    if (Array.isArray(response.data.data)) {
      return response.data.data;
    }
    if (Array.isArray(response.data.data.records)) {
      return response.data.data.records;
    }
    return [];
  }
  async fetchMqttCredentials(session) {
    const response = await import_axios.default.post(
      `${session.iotDomain}/v1/mqtt/auth/jwt`,
      {},
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "okhttp/4.9.3"
        },
        timeout: 1e4
      }
    );
    if (response.data.code !== 0 || !response.data.data) {
      throw new Error(response.data.msg || `HTTP ${response.status}`);
    }
    return response.data.data;
  }
  async syncDevices(devices, records) {
    var _a, _b, _c;
    this.deviceContexts.clear();
    this.mqttTopicMap.clear();
    const devicesByIotId = /* @__PURE__ */ new Map();
    const recordsByIotId = /* @__PURE__ */ new Map();
    for (const device of devices) {
      if (device.iotId) {
        devicesByIotId.set(device.iotId, device);
      }
    }
    for (const record of records) {
      if (record.iotId) {
        recordsByIotId.set(record.iotId, record);
      }
    }
    const allIotIds = /* @__PURE__ */ new Set([...devicesByIotId.keys(), ...recordsByIotId.keys()]);
    let idx = 0;
    for (const iotId of allIotIds) {
      idx += 1;
      const device = devicesByIotId.get(iotId);
      const record = recordsByIotId.get(iotId);
      const rawKey = iotId || (device == null ? void 0 : device.deviceId) || `device_${idx}`;
      const key = this.sanitizeObjectId(rawKey);
      const channelId = `devices.${key}`;
      const deviceName = (device == null ? void 0 : device.deviceName) || (record == null ? void 0 : record.deviceName) || iotId;
      const context = {
        key,
        iotId,
        deviceId: (device == null ? void 0 : device.deviceId) || "",
        deviceName: deviceName || "",
        productKey: (record == null ? void 0 : record.productKey) || "",
        recordDeviceName: (record == null ? void 0 : record.deviceName) || "",
        status: device == null ? void 0 : device.status
      };
      this.deviceContexts.set(key, context);
      if (context.productKey && context.recordDeviceName) {
        this.mqttTopicMap.set(`${context.productKey}/${context.recordDeviceName}`, key);
      }
      await this.extendObjectAsync(channelId, {
        type: "channel",
        common: {
          name: deviceName || rawKey
        },
        native: {
          iotId: context.iotId,
          deviceId: context.deviceId,
          productKey: context.productKey,
          deviceName: context.recordDeviceName
        }
      });
      await this.ensureDeviceStateObjects(channelId);
      await this.setStateChangedAsync(`${channelId}.name`, context.deviceName, true);
      await this.setStateChangedAsync(`${channelId}.iotId`, context.iotId, true);
      await this.setStateChangedAsync(`${channelId}.deviceId`, context.deviceId, true);
      await this.setStateChangedAsync(`${channelId}.deviceType`, (device == null ? void 0 : device.deviceType) || "", true);
      await this.setStateChangedAsync(
        `${channelId}.deviceTypeText`,
        this.resolveDeviceTypeName(device == null ? void 0 : device.deviceType, context.deviceName, device == null ? void 0 : device.productSeries),
        true
      );
      await this.setStateChangedAsync(`${channelId}.series`, (device == null ? void 0 : device.series) || "", true);
      await this.setStateChangedAsync(`${channelId}.productSeries`, (device == null ? void 0 : device.productSeries) || "", true);
      await this.setStateChangedAsync(`${channelId}.status`, (_a = context.status) != null ? _a : -1, true);
      await this.setStateChangedAsync(`${channelId}.productKey`, context.productKey, true);
      await this.setStateChangedAsync(`${channelId}.recordDeviceName`, context.recordDeviceName, true);
      await this.setStateChangedAsync(`${channelId}.raw`, JSON.stringify({ device, record }), true);
      await this.setStateChangedAsync(`${channelId}.telemetry.connected`, ((_b = context.status) != null ? _b : 0) === 1, true);
      const location = (_c = device == null ? void 0 : device.locationVo) == null ? void 0 : _c.location;
      if (Array.isArray(location) && location.length >= 2) {
        await this.setStateChangedAsync(`${channelId}.telemetry.longitude`, Number(location[0]) || 0, true);
        await this.setStateChangedAsync(`${channelId}.telemetry.latitude`, Number(location[1]) || 0, true);
      }
    }
  }
  async connectMqtt(mqttAuth, records) {
    if (this.mqttClient) {
      this.mqttClient.removeAllListeners();
      this.mqttClient.end(true);
    }
    const brokerUrl = mqttAuth.host.includes("://") ? mqttAuth.host : `mqtts://${mqttAuth.host}`;
    const client = mqtt.connect(brokerUrl, {
      clientId: mqttAuth.clientId,
      username: mqttAuth.username,
      password: mqttAuth.jwt,
      reconnectPeriod: 5e3,
      connectTimeout: 15e3,
      protocolVersion: 4,
      clean: true
    });
    this.mqttClient = client;
    client.on("connect", () => {
      this.log.info("MQTT verbunden.");
      void this.setStateChangedAsync("info.mqttConnected", true, true);
      this.cloudConnected = true;
      this.authFailureSince = 0;
      void this.setStateChangedAsync("info.connection", true, true);
      const topics = /* @__PURE__ */ new Set();
      for (const record of records) {
        if (record.productKey && record.deviceName) {
          topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/status`);
          topics.add(`/sys/${record.productKey}/${record.deviceName}/thing/event/+/post`);
          topics.add(`/sys/proto/${record.productKey}/${record.deviceName}/thing/event/+/post`);
          topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/properties`);
          topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/events`);
          topics.add(`/sys/${record.productKey}/${record.deviceName}/thing/event/property/post`);
        }
      }
      for (const topic of topics) {
        client.subscribe(topic, (err) => {
          if (err) {
            this.log.warn(`MQTT subscribe fehlgeschlagen (${topic}): ${err.message}`);
          }
        });
      }
    });
    client.on("message", (topic, payload) => {
      void this.handleMqttMessage(topic, payload);
    });
    client.on("error", (err) => {
      this.log.warn(`MQTT Fehler: ${err.message}`);
      void this.setStateChangedAsync("info.lastError", `MQTT: ${err.message}`, true);
    });
    client.on("close", () => {
      void this.setStateChangedAsync("info.mqttConnected", false, true);
      this.markAuthFailure("MQTT connection closed");
    });
    client.on("offline", () => {
      void this.setStateChangedAsync("info.mqttConnected", false, true);
      this.markAuthFailure("MQTT offline");
    });
  }
  async handleMqttMessage(topic, payload) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C;
    const topicParts = topic.split("/");
    if (topicParts.length < 5) {
      return;
    }
    const productKey = topicParts[2];
    const recordDeviceName = topicParts[3];
    const payloadText = payload.toString("utf8");
    const payloadData = this.safeJsonParse(payloadText);
    const payloadIotId = typeof ((_a = payloadData == null ? void 0 : payloadData.params) == null ? void 0 : _a.iotId) === "string" && payloadData.params.iotId || typeof ((_b = payloadData == null ? void 0 : payloadData.params) == null ? void 0 : _b.iot_id) === "string" && payloadData.params.iot_id || typeof (payloadData == null ? void 0 : payloadData.iot_id) === "string" && payloadData.iot_id || "";
    const deviceKey = this.resolveDeviceKey(productKey, recordDeviceName, payloadIotId);
    if (!deviceKey) {
      return;
    }
    const ctx = this.deviceContexts.get(deviceKey);
    if (ctx && !ctx.productKey && productKey && recordDeviceName) {
      ctx.productKey = productKey;
      ctx.recordDeviceName = recordDeviceName;
      this.mqttTopicMap.set(`${productKey}/${recordDeviceName}`, deviceKey);
      await this.setStateChangedAsync(`devices.${deviceKey}.productKey`, productKey, true);
      await this.setStateChangedAsync(`devices.${deviceKey}.recordDeviceName`, recordDeviceName, true);
    }
    if (ctx && payloadIotId && payloadIotId !== ctx.iotId) {
      ctx.iotId = payloadIotId;
      await this.setStateChangedAsync(`devices.${deviceKey}.iotId`, payloadIotId, true);
    }
    const channelId = `devices.${deviceKey}`;
    const now = Date.now();
    await this.setStateChangedAsync("info.lastMessageTs", now, true);
    await this.setStateChangedAsync(`${channelId}.telemetry.lastTopic`, topic, true);
    await this.setStateChangedAsync(`${channelId}.telemetry.lastPayload`, payloadText, true);
    await this.setStateChangedAsync(`${channelId}.telemetry.lastUpdate`, now, true);
    if (!payloadData) {
      return;
    }
    const data = payloadData;
    const params = data.params;
    if (params == null ? void 0 : params.identifier) {
      await this.setStateChangedAsync(`${channelId}.telemetry.lastEventId`, `${params.identifier}`, true);
    }
    const statusValue = this.pickNumber(
      (_c = params == null ? void 0 : params.status) == null ? void 0 : _c.value,
      (_e = (_d = params == null ? void 0 : params.items) == null ? void 0 : _d.iotState) == null ? void 0 : _e.value,
      params == null ? void 0 : params.iotState,
      (_f = data.iotState) == null ? void 0 : _f.value,
      data.iotState
    );
    if (statusValue !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.connected`, statusValue === 1, true);
    }
    const batteryValue = this.pickNumber(
      (_h = (_g = params == null ? void 0 : params.items) == null ? void 0 : _g.batteryPercentage) == null ? void 0 : _h.value,
      (_i = params == null ? void 0 : params.batteryPercentage) == null ? void 0 : _i.value,
      params == null ? void 0 : params.batteryPercentage,
      (_j = data.batteryPercentage) == null ? void 0 : _j.value,
      data.batteryPercentage
    );
    if (batteryValue !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.batteryPercent`, batteryValue, true);
    }
    const knifeHeightValue = this.pickNumber(
      (_l = (_k = params == null ? void 0 : params.items) == null ? void 0 : _k.knifeHeight) == null ? void 0 : _l.value,
      (_m = params == null ? void 0 : params.knifeHeight) == null ? void 0 : _m.value,
      params == null ? void 0 : params.knifeHeight,
      (_n = data.knifeHeight) == null ? void 0 : _n.value,
      data.knifeHeight
    );
    if (knifeHeightValue !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.bladeHeightMm`, knifeHeightValue, true);
    }
    const deviceStateValue = this.pickNumber(
      (_p = (_o = params == null ? void 0 : params.items) == null ? void 0 : _o.deviceState) == null ? void 0 : _p.value,
      (_q = params == null ? void 0 : params.deviceState) == null ? void 0 : _q.value,
      params == null ? void 0 : params.deviceState,
      (_r = data.deviceState) == null ? void 0 : _r.value,
      data.deviceState
    );
    if (deviceStateValue !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.deviceState`, deviceStateValue, true);
    }
    const coordinateValue = (_z = (_y = (_w = (_v = (_t = (_s = params == null ? void 0 : params.items) == null ? void 0 : _s.coordinate) == null ? void 0 : _t.value) != null ? _v : (_u = params == null ? void 0 : params.coordinate) == null ? void 0 : _u.value) != null ? _w : params == null ? void 0 : params.coordinate) != null ? _y : (_x = data.coordinate) == null ? void 0 : _x.value) != null ? _z : data.coordinate;
    if (coordinateValue) {
      const coordinate = typeof coordinateValue === "string" ? this.safeJsonParse(coordinateValue) : coordinateValue;
      if (coordinate && typeof coordinate === "object") {
        const lat = this.pickNumber(coordinate.lat, coordinate.latitude);
        const lon = this.pickNumber(coordinate.lon, coordinate.lng);
        const normalized = this.normalizeCoordinate(lat, lon);
        if (normalized.lat !== null) {
          await this.setStateChangedAsync(`${channelId}.telemetry.latitude`, normalized.lat, true);
        }
        if (normalized.lon !== null) {
          await this.setStateChangedAsync(`${channelId}.telemetry.longitude`, normalized.lon, true);
        }
      }
    }
    const protoContent = (_C = (_A = params == null ? void 0 : params.value) == null ? void 0 : _A.content) != null ? _C : (_B = data == null ? void 0 : data.value) == null ? void 0 : _B.content;
    if (typeof protoContent === "string") {
      await this.setStateChangedAsync(`${channelId}.telemetry.lastProtoContent`, protoContent, true);
    }
  }
  async invokeTaskControlCommandModern(session, context, content) {
    var _a;
    const invoke = async (deviceName, productKey) => {
      const response2 = await import_axios.default.post(
        `${session.iotDomain}/v1/mqtt/rpc/thing/service/invoke`,
        {
          args: { content },
          deviceName,
          identifier: "device_protobuf_sync_service",
          iotId: context.iotId,
          productKey
        },
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
            "User-Agent": "okhttp/4.9.3",
            "Client-Id": session.clientId,
            "Client-Type": "1"
          },
          timeout: 1e4
        }
      );
      return response2.data;
    };
    let response = await invoke(context.recordDeviceName || context.deviceName || "", context.productKey || "");
    if (response.code === 50101) {
      response = await invoke("", "");
    }
    if (response.code !== 0) {
      throw new Error(response.msg || "Command invoke failed");
    }
    return ((_a = response.data) == null ? void 0 : _a.result) || "ok";
  }
  async invokeTaskControlCommandWithFallback(session, context, content) {
    try {
      return await this.invokeTaskControlCommandModern(session, context, content);
    } catch (err) {
      const msg = this.extractAxiosError(err).toLowerCase();
      if (!msg.includes("invalid device")) {
        throw err;
      }
    }
    this.log.warn(`Modern command path liefert Invalid device f\xFCr ${context.deviceName || context.iotId}, versuche Aliyun-Fallback.`);
    return this.invokeTaskControlCommandLegacy(session, context, content);
  }
  async executeTaskControlCommand(context, command) {
    const session = await this.ensureValidSession(!this.cloudConnected);
    const content = this.buildTaskControlContent(session, context, command);
    try {
      return await this.invokeTaskControlCommandWithFallback(session, context, content);
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (!this.isRetryableCommandError(msg, err)) {
        throw err;
      }
      this.log.warn(`Command ${command} erster Versuch fehlgeschlagen (${msg}), neuer Login + Retry.`);
      await this.hydrateContextFromTelemetry(context.key);
      await this.refreshSessionAndDeviceCache();
      const refreshedContext = this.deviceContexts.get(context.key) || context;
      const retrySession = await this.ensureValidSession(true);
      const retryContent = this.buildTaskControlContent(retrySession, refreshedContext, command);
      return this.invokeTaskControlCommandWithFallback(retrySession, refreshedContext, retryContent);
    }
  }
  async executeTaskSettingsCommand(context, cutHeightMm, mowSpeedMs) {
    const session = await this.ensureValidSession(!this.cloudConnected);
    try {
      const bladeContent = this.buildSetBladeHeightContent(session, cutHeightMm);
      const bladeResult = await this.invokeTaskControlCommandWithFallback(session, context, bladeContent);
      const speedContent = this.buildSetMowSpeedContent(session, mowSpeedMs);
      const speedResult = await this.invokeTaskControlCommandWithFallback(session, context, speedContent);
      return `blade:${bladeResult};speed:${speedResult}`;
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (!this.isRetryableCommandError(msg, err)) {
        throw err;
      }
      this.log.warn(`Task-Settings erster Versuch fehlgeschlagen (${msg}), neuer Login + Retry.`);
      await this.hydrateContextFromTelemetry(context.key);
      await this.refreshSessionAndDeviceCache();
      const refreshedContext = this.deviceContexts.get(context.key) || context;
      const retrySession = await this.ensureValidSession(true);
      try {
        const retryBladeContent = this.buildSetBladeHeightContent(retrySession, cutHeightMm);
        const retryBladeResult = await this.invokeTaskControlCommandWithFallback(
          retrySession,
          refreshedContext,
          retryBladeContent
        );
        const retrySpeedContent = this.buildSetMowSpeedContent(retrySession, mowSpeedMs);
        const retrySpeedResult = await this.invokeTaskControlCommandWithFallback(
          retrySession,
          refreshedContext,
          retrySpeedContent
        );
        return `blade:${retryBladeResult};speed:${retrySpeedResult}`;
      } catch (_retryErr) {
        const fallbackContent = this.buildTaskSettingsContent(retrySession, cutHeightMm, mowSpeedMs);
        return this.invokeTaskControlCommandWithFallback(retrySession, refreshedContext, fallbackContent);
      }
    }
  }
  async executeEncodedContentCommand(context, commandLabel, buildContent) {
    const session = await this.ensureValidSession(!this.cloudConnected);
    const content = buildContent(session, context);
    try {
      return await this.invokeTaskControlCommandWithFallback(session, context, content);
    } catch (err) {
      const msg = this.extractAxiosError(err);
      if (!this.isRetryableCommandError(msg, err)) {
        throw err;
      }
      this.log.warn(`Command ${commandLabel} erster Versuch fehlgeschlagen (${msg}), neuer Login + Retry.`);
      await this.hydrateContextFromTelemetry(context.key);
      await this.refreshSessionAndDeviceCache();
      const refreshedContext = this.deviceContexts.get(context.key) || context;
      const retrySession = await this.ensureValidSession(true);
      const retryContent = buildContent(retrySession, refreshedContext);
      return this.invokeTaskControlCommandWithFallback(retrySession, refreshedContext, retryContent);
    }
  }
  async refreshSessionAndDeviceCache() {
    const session = await this.ensureValidSession(true);
    let devices = [];
    try {
      devices = await this.fetchDeviceList(session);
    } catch (err) {
      this.log.debug(`Modern device list nicht verf\xFCgbar: ${this.extractAxiosError(err)}`);
    }
    let modernRecords = [];
    try {
      modernRecords = await this.fetchDeviceRecords(session);
    } catch (err) {
      this.log.debug(`Modern device records nicht verf\xFCgbar: ${this.extractAxiosError(err)}`);
    }
    const legacyRecords = await this.fetchLegacyDeviceRecords(session);
    const modernIotIds = new Set(modernRecords.map((r) => r.iotId).filter(Boolean));
    const records = [
      ...modernRecords,
      ...legacyRecords.filter((r) => r.iotId && !modernIotIds.has(r.iotId))
    ];
    if (!records.length) {
      this.log.warn("Keine Ger\xE4te gefunden (weder modern noch legacy). Shared-Ger\xE4t vorhanden?");
    }
    await this.syncDevices(devices, records);
    await this.setStateChangedAsync("info.deviceCount", this.deviceContexts.size, true);
    if (modernRecords.length && (!this.mqttClient || !this.mqttClient.connected)) {
      const mqttAuth = await this.fetchMqttCredentials(session);
      await this.connectMqtt(mqttAuth, modernRecords);
    }
    if (!modernRecords.length) {
      if (this.mqttClient) {
        this.mqttClient.removeAllListeners();
        this.mqttClient.end(true);
        this.mqttClient = null;
      }
      await this.setStateChangedAsync("info.mqttConnected", false, true);
    }
    if (this.deviceContexts.size) {
      this.startLegacyPolling();
    } else {
      this.stopLegacyPolling();
    }
  }
  isRetryableCommandError(msg, err) {
    return this.isAuthError(err, msg) || msg.toLowerCase().includes("invalid device");
  }
  isAuthError(err, msg) {
    var _a;
    if (import_axios.default.isAxiosError(err)) {
      const status = (_a = err.response) == null ? void 0 : _a.status;
      if (status === 401 || status === 403) {
        return true;
      }
    }
    const lower = msg.toLowerCase();
    return lower.includes("token") || lower.includes("unauthorized") || lower.includes("authentication") || lower.includes("not login") || lower.includes("access denied") || lower.includes("forbidden") || lower.includes("auth error") || lower.includes("request auth error") || lower.includes("invalid session") || lower.includes("identityid is blank") || lower.includes("identity id is blank");
  }
  isLegacySessionRetryError(messageLower) {
    return messageLower.includes("token") || messageLower.includes("session") || messageLower.includes("460") || messageLower.includes("identityid is blank") || messageLower.includes("identity id is blank") || messageLower.includes("auth error") || messageLower.includes("request auth error") || messageLower.includes("unauthorized");
  }
  markAuthFailure(msg) {
    this.cloudConnected = false;
    if (!this.authFailureSince) {
      this.authFailureSince = Date.now();
    }
    void this.setStateChangedAsync("info.connection", false, true);
    void this.setStateChangedAsync("info.lastError", msg, true);
  }
  startReconnectTimer() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }
    this.reconnectTimer = setInterval(() => {
      void this.reconnectIfAllowed();
    }, 6e4);
  }
  async reconnectIfAllowed() {
    const pollWatchdogMs = 10 * 60 * 1e3;
    if (this.legacyPollingEnabled && this.cloudConnected && this.legacyLastPollAt > 0 && !this.legacyPollInFlight && !this.legacyPollTimer && Date.now() - this.legacyLastPollAt > pollWatchdogMs) {
      this.log.warn("Polling-Watchdog: Kein Poll seit >10min \u2013 starte Polling neu.");
      this.scheduleLegacyPolling(0);
      return;
    }
    if (this.cloudConnected || !this.authFailureSince) {
      return;
    }
    const cooldownMs = 15 * 60 * 1e3;
    if (Date.now() - this.authFailureSince < cooldownMs) {
      return;
    }
    try {
      this.log.info("Auth-Cooldown vorbei, versuche Reconnect.");
      await this.refreshSessionAndDeviceCache();
      await this.requestIotSyncForAllDevices();
      this.cloudConnected = true;
      this.authFailureSince = 0;
      await this.setStateChangedAsync("info.connection", true, true);
    } catch (err) {
      const msg = this.extractAxiosError(err);
      this.log.warn(`Automatischer Reconnect fehlgeschlagen: ${msg}`);
      this.markAuthFailure(msg);
    }
  }
  async fetchLegacyDeviceRecords(session) {
    try {
      const legacy = await this.ensureLegacySession(session);
      const bindings = await this.fetchLegacyBindings(legacy);
      return bindings.filter((binding) => typeof binding.iotId === "string" && typeof binding.deviceName === "string").map((binding) => {
        var _a, _b;
        return {
          iotId: binding.iotId || "",
          productKey: binding.productKey || "",
          deviceName: binding.deviceName || "",
          identityId: binding.identityId || "",
          status: (_a = this.pickNumber(binding.status)) != null ? _a : void 0,
          owned: (_b = this.pickNumber(binding.owned)) != null ? _b : void 0
        };
      });
    } catch (err) {
      this.log.warn(`Legacy-Bindings konnten nicht geladen werden: ${this.extractAxiosError(err)}`);
      return [];
    }
  }
  async invokeTaskControlCommandLegacy(session, context, content) {
    const invoke = async (forceSessionRefresh) => {
      const legacy = await this.ensureLegacySession(session, forceSessionRefresh);
      const response = await this.callLegacyApi(
        legacy.apiGatewayEndpoint,
        "/thing/service/invoke",
        "1.0.5",
        {
          args: { content },
          identifier: "device_protobuf_sync_service",
          iotId: context.iotId
        },
        legacy.iotToken
      );
      if (response.code !== 200) {
        throw new Error(this.extractLegacyApiMessage(response, "Legacy invoke failed"));
      }
      return response.data || null;
    };
    try {
      const result = await invoke(false);
      this.cloudConnected = true;
      this.authFailureSince = 0;
      await this.setStateChangedAsync("info.connection", true, true);
      return (result == null ? void 0 : result.messageId) || (result == null ? void 0 : result.data) || "ok";
    } catch (err) {
      const msg = this.extractAxiosError(err).toLowerCase();
      if (!msg.includes("token") && !msg.includes("session") && !msg.includes("460") && !msg.includes("identityid is blank") && !msg.includes("identity id is blank")) {
        throw err;
      }
    }
    const retry = await invoke(true);
    this.cloudConnected = true;
    this.authFailureSince = 0;
    await this.setStateChangedAsync("info.connection", true, true);
    return (retry == null ? void 0 : retry.messageId) || (retry == null ? void 0 : retry.data) || "ok";
  }
  async ensureLegacySession(session, force = false) {
    const validUntil = this.legacySession && this.legacySession.issuedAt + this.legacySession.iotTokenExpire * 1e3 - 3e5;
    if (!force && this.legacySession && validUntil && validUntil > Date.now()) {
      return this.legacySession;
    }
    this.legacySession = await this.createLegacySession(session);
    return this.legacySession;
  }
  async createLegacySession(session) {
    var _a, _b, _c, _d, _e, _f;
    if (!session.authorizationCode) {
      throw new Error("Legacy-Login nicht m\xF6glich: authorization_code fehlt");
    }
    const countryCode = session.countryCode || this.extractAreaCodeFromToken(session.accessToken) || "DE";
    const regionResponse = await this.callLegacyApi(
      LEGACY_ALIYUN_DOMAIN,
      "/living/account/region/get",
      "1.0.2",
      {
        authCode: session.authorizationCode,
        type: "THIRD_AUTHCODE",
        countryCode
      }
    );
    if (regionResponse.code !== 200 || !((_a = regionResponse.data) == null ? void 0 : _a.apiGatewayEndpoint) || !((_b = regionResponse.data) == null ? void 0 : _b.oaApiGatewayEndpoint)) {
      throw new Error(this.extractLegacyApiMessage(regionResponse, "Legacy region lookup fehlgeschlagen"));
    }
    const connect = await this.callLegacyOpenAccountConnect();
    const loginByOauth = await this.callLegacyLoginByOauth(
      regionResponse.data.oaApiGatewayEndpoint,
      session.authorizationCode,
      countryCode,
      connect.vid,
      connect.deviceId,
      connect.utdid
    );
    const sid = (_e = (_d = (_c = loginByOauth == null ? void 0 : loginByOauth.data) == null ? void 0 : _c.data) == null ? void 0 : _d.loginSuccessResult) == null ? void 0 : _e.sid;
    if (!sid) {
      throw new Error("Legacy-Login fehlgeschlagen: sid fehlt");
    }
    const sessionResponse = await this.callLegacyApi(
      regionResponse.data.apiGatewayEndpoint,
      "/account/createSessionByAuthCode",
      "1.0.4",
      {
        request: {
          authCode: sid,
          accountType: "OA_SESSION",
          appKey: LEGACY_APP_KEY
        }
      }
    );
    if (sessionResponse.code !== 200 || !((_f = sessionResponse.data) == null ? void 0 : _f.iotToken)) {
      throw new Error(this.extractLegacyApiMessage(sessionResponse, "Legacy Session konnte nicht erstellt werden"));
    }
    return {
      apiGatewayEndpoint: regionResponse.data.apiGatewayEndpoint,
      oaApiGatewayEndpoint: regionResponse.data.oaApiGatewayEndpoint,
      iotToken: sessionResponse.data.iotToken,
      iotTokenExpire: Number(sessionResponse.data.iotTokenExpire) || 3600,
      refreshToken: sessionResponse.data.refreshToken || "",
      refreshTokenExpire: Number(sessionResponse.data.refreshTokenExpire) || 0,
      identityId: sessionResponse.data.identityId || "",
      issuedAt: Date.now()
    };
  }
  async fetchLegacyBindings(session) {
    var _a;
    const response = await this.callLegacyApi(
      session.apiGatewayEndpoint,
      "/uc/listBindingByAccount",
      "1.0.8",
      {
        pageSize: 100,
        pageNo: 1
      },
      session.iotToken
    );
    if (response.code !== 200) {
      throw new Error(this.extractLegacyApiMessage(response, "Legacy device list fehlgeschlagen"));
    }
    return Array.isArray((_a = response.data) == null ? void 0 : _a.data) ? response.data.data : [];
  }
  stopLegacyPolling() {
    this.legacyPollingEnabled = false;
    if (this.legacyPollTimer) {
      clearTimeout(this.legacyPollTimer);
      this.legacyPollTimer = null;
    }
    this.legacyPollInFlight = false;
    this.legacyHasActiveDevice = false;
    this.legacyFastPollUntil = 0;
  }
  startLegacyPolling() {
    this.legacyPollingEnabled = true;
    if (this.config.legacyTelemetryTransport === "mqtt" && !this.legacyMqttNotImplementedLogged) {
      this.legacyMqttNotImplementedLogged = true;
      this.log.warn("Legacy MQTT Push ist noch nicht implementiert, nutze vorerst Polling.");
    }
    this.scheduleLegacyPolling(0);
  }
  scheduleLegacyPolling(delayMs) {
    if (!this.legacyPollingEnabled) {
      return;
    }
    if (this.legacyPollTimer) {
      clearTimeout(this.legacyPollTimer);
    }
    this.legacyPollTimer = setTimeout(() => {
      this.legacyPollTimer = null;
      void this.runLegacyPollingCycle();
    }, Math.max(0, Math.trunc(delayMs)));
  }
  async runLegacyPollingCycle() {
    if (this.legacyPollInFlight) {
      return;
    }
    this.legacyPollInFlight = true;
    this.legacyLastPollAt = Date.now();
    try {
      this.legacyHasActiveDevice = await this.pollLegacyTelemetry();
    } catch (err) {
      this.log.warn(`Legacy-Polling-Zyklus fehlgeschlagen: ${this.extractAxiosError(err)}`);
    } finally {
      this.legacyPollInFlight = false;
      if (this.legacyPollingEnabled) {
        if (this.deviceContexts.size) {
          this.scheduleLegacyPolling(this.getLegacyNextPollDelayMs());
        } else {
          this.log.warn("Legacy-Polling: Keine Ger\xE4te im Cache \u2013 erzwinge Neuverbindung.");
          this.cloudConnected = false;
          if (!this.authFailureSince) {
            this.authFailureSince = Date.now() - 15 * 60 * 1e3 - 1;
          }
        }
      }
    }
  }
  getLegacyNextPollDelayMs() {
    const configuredInterval = Number(this.config.legacyPollIntervalSec);
    const baseSec = Number.isFinite(configuredInterval) ? Math.min(300, Math.max(10, Math.trunc(configuredInterval))) : 30;
    const activeSec = Math.min(60, Math.max(10, Math.trunc(baseSec / 2)));
    const idleSec = Math.min(300, Math.max(90, baseSec * 4));
    const boostSec = Math.max(10, Math.min(15, activeSec));
    if (Date.now() < this.legacyFastPollUntil) {
      return boostSec * 1e3;
    }
    return (this.legacyHasActiveDevice ? activeSec : idleSec) * 1e3;
  }
  enableFastLegacyPollingWindow() {
    this.legacyFastPollUntil = Math.max(this.legacyFastPollUntil, Date.now() + LEGACY_FAST_POLL_WINDOW_MS);
  }
  shouldUseActiveLegacyPolling(deviceState, connected) {
    if (deviceState !== null) {
      if (ACTIVE_DEVICE_STATES.has(deviceState)) {
        return true;
      }
      if (IDLE_DEVICE_STATES.has(deviceState)) {
        return false;
      }
    }
    return connected === true;
  }
  asNumericStateValue(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  asBooleanStateValue(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "1" || normalized === "true" || normalized === "on") {
        return true;
      }
      if (normalized === "0" || normalized === "false" || normalized === "off") {
        return false;
      }
    }
    return null;
  }
  async pollLegacyTelemetry() {
    if (!this.deviceContexts.size) {
      return false;
    }
    let session;
    try {
      session = await this.ensureValidSession(!this.cloudConnected);
    } catch (err) {
      this.markAuthFailure(this.extractAxiosError(err));
      return this.legacyHasActiveDevice;
    }
    let hasActiveDevice = false;
    for (const ctx of this.deviceContexts.values()) {
      if (!ctx.iotId) {
        continue;
      }
      try {
        const properties = await this.fetchLegacyProperties(session, ctx.iotId);
        if (properties) {
          await this.applyLegacyTelemetry(`devices.${ctx.key}`, properties);
        }
      } catch (err) {
        const msg = this.extractAxiosError(err);
        if (this.isAuthError(err, msg)) {
          this.markAuthFailure(msg);
        }
        this.log.debug(`Legacy-Telemetrie (properties) f\xFCr ${ctx.deviceName || ctx.iotId} fehlgeschlagen: ${msg}`);
      }
      try {
        const status = await this.fetchLegacyStatus(session, ctx.iotId);
        if (status) {
          await this.applyLegacyStatusTelemetry(`devices.${ctx.key}`, status);
        }
      } catch (err) {
        const msg = this.extractAxiosError(err);
        if (this.isAuthError(err, msg)) {
          this.markAuthFailure(msg);
        }
        this.log.debug(`Legacy-Telemetrie (status) f\xFCr ${ctx.deviceName || ctx.iotId} fehlgeschlagen: ${msg}`);
      }
      const [deviceState, connected] = await Promise.all([
        this.getStateAsync(`devices.${ctx.key}.telemetry.deviceState`),
        this.getStateAsync(`devices.${ctx.key}.telemetry.connected`)
      ]);
      if (this.shouldUseActiveLegacyPolling(this.asNumericStateValue(deviceState == null ? void 0 : deviceState.val), this.asBooleanStateValue(connected == null ? void 0 : connected.val))) {
        hasActiveDevice = true;
      }
    }
    return hasActiveDevice;
  }
  async fetchLegacyProperties(session, iotId) {
    const load = async (activeSession, forceSessionRefresh) => {
      const legacy = await this.ensureLegacySession(activeSession, forceSessionRefresh);
      const response = await this.callLegacyApi(
        legacy.apiGatewayEndpoint,
        "/thing/properties/get",
        "1.0.0",
        { iotId },
        legacy.iotToken
      );
      if (response.code !== 200) {
        throw new Error(this.extractLegacyApiMessage(response, `Legacy properties Fehler f\xFCr ${iotId}`));
      }
      return response.data || null;
    };
    try {
      return await load(session, false);
    } catch (err) {
      const msg = this.extractAxiosError(err).toLowerCase();
      if (!this.isLegacySessionRetryError(msg)) {
        throw err;
      }
    }
    try {
      return await load(session, true);
    } catch (err) {
      const msg = this.extractAxiosError(err).toLowerCase();
      if (!this.isLegacySessionRetryError(msg)) {
        throw err;
      }
    }
    const refreshedSession = await this.ensureValidSession(true);
    return load(refreshedSession, true);
  }
  async fetchLegacyStatus(session, iotId) {
    const load = async (activeSession, forceSessionRefresh) => {
      const legacy = await this.ensureLegacySession(activeSession, forceSessionRefresh);
      const response = await this.callLegacyApi(
        legacy.apiGatewayEndpoint,
        "/thing/status/get",
        "1.0.0",
        { iotId },
        legacy.iotToken
      );
      if (response.code !== 200) {
        throw new Error(this.extractLegacyApiMessage(response, `Legacy status Fehler f\xFCr ${iotId}`));
      }
      if (!response.data) {
        return null;
      }
      if (typeof response.data === "string") {
        return this.safeJsonParse(response.data);
      }
      return response.data;
    };
    try {
      return await load(session, false);
    } catch (err) {
      const msg = this.extractAxiosError(err).toLowerCase();
      if (!this.isLegacySessionRetryError(msg)) {
        throw err;
      }
    }
    try {
      return await load(session, true);
    } catch (err) {
      const msg = this.extractAxiosError(err).toLowerCase();
      if (!this.isLegacySessionRetryError(msg)) {
        throw err;
      }
    }
    const refreshedSession = await this.ensureValidSession(true);
    return load(refreshedSession, true);
  }
  async applyLegacyTelemetry(channelId, properties) {
    await this.applyLegacySnapshot(channelId, properties, "legacy-http/thing/properties/get");
  }
  async applyLegacyStatusTelemetry(channelId, status) {
    await this.applyLegacySnapshot(channelId, status, "legacy-http/thing/status/get");
  }
  async applyLegacySnapshot(channelId, snapshot, sourceTopic) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    const now = Date.now();
    this.cloudConnected = true;
    this.authFailureSince = 0;
    await this.setStateChangedAsync("info.connection", true, true);
    await this.setStateChangedAsync("info.lastMessageTs", now, true);
    await this.setStateChangedAsync(`${channelId}.telemetry.lastTopic`, sourceTopic, true);
    await this.setStateChangedAsync(`${channelId}.telemetry.lastPayload`, JSON.stringify(snapshot), true);
    await this.setStateChangedAsync(`${channelId}.telemetry.lastUpdate`, now, true);
    const data = snapshot.data && typeof snapshot.data === "object" ? snapshot.data : snapshot;
    const items = data.items && typeof data.items === "object" ? data.items : void 0;
    const battery = this.pickNumber(
      (_a = items == null ? void 0 : items.batteryPercentage) == null ? void 0 : _a.value,
      items == null ? void 0 : items.batteryPercentage,
      (_b = data.batteryPercentage) == null ? void 0 : _b.value,
      data.batteryPercentage
    );
    if (battery !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.batteryPercent`, battery, true);
    }
    const knifeHeight = this.pickNumber((_c = items == null ? void 0 : items.knifeHeight) == null ? void 0 : _c.value, items == null ? void 0 : items.knifeHeight, (_d = data.knifeHeight) == null ? void 0 : _d.value, data.knifeHeight);
    if (knifeHeight !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.bladeHeightMm`, knifeHeight, true);
    }
    const deviceState = this.pickNumber((_e = items == null ? void 0 : items.deviceState) == null ? void 0 : _e.value, items == null ? void 0 : items.deviceState, (_f = data.deviceState) == null ? void 0 : _f.value, data.deviceState);
    if (deviceState !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.deviceState`, deviceState, true);
    }
    const online = this.pickNumber((_g = items == null ? void 0 : items.iotState) == null ? void 0 : _g.value, items == null ? void 0 : items.iotState, (_h = data.iotState) == null ? void 0 : _h.value, data.iotState, data.status);
    if (online !== null) {
      await this.setStateChangedAsync(`${channelId}.telemetry.connected`, online === 1, true);
    }
    const coordinateValue = (_p = (_o = (_m = (_l = (_j = (_i = items == null ? void 0 : items.coordinate) == null ? void 0 : _i.value) != null ? _j : items == null ? void 0 : items.coordinate) != null ? _l : (_k = data.coordinate) == null ? void 0 : _k.value) != null ? _m : data.coordinate) != null ? _o : (_n = data.location) == null ? void 0 : _n.value) != null ? _p : data.location;
    if (coordinateValue !== void 0 && coordinateValue !== null) {
      const coordinate = typeof coordinateValue === "string" ? this.safeJsonParse(coordinateValue) : coordinateValue;
      if (coordinate && typeof coordinate === "object") {
        const lat = this.pickNumber(coordinate.lat, coordinate.latitude, coordinate.y);
        const lon = this.pickNumber(coordinate.lon, coordinate.lng, coordinate.longitude, coordinate.x);
        const normalized = this.normalizeCoordinate(lat, lon);
        if (normalized.lat !== null) {
          await this.setStateChangedAsync(`${channelId}.telemetry.latitude`, normalized.lat, true);
        }
        if (normalized.lon !== null) {
          await this.setStateChangedAsync(`${channelId}.telemetry.longitude`, normalized.lon, true);
        }
      }
    }
  }
  normalizeCoordinate(lat, lon) {
    if (lat === null || lon === null) {
      return { lat, lon };
    }
    if (Math.abs(lat) <= Math.PI / 2 && Math.abs(lon) <= Math.PI) {
      return {
        lat: lat * 180 / Math.PI,
        lon: lon * 180 / Math.PI
      };
    }
    return { lat, lon };
  }
  async callLegacyApi(domain, path, apiVer, params, iotToken) {
    const body = {
      id: this.randomUuid(),
      params,
      request: {
        apiVer,
        language: "en-US",
        ...iotToken ? { iotToken } : {}
      },
      version: "1.0"
    };
    const bodyText = JSON.stringify(body);
    const headers = this.buildLegacyGatewayHeaders(domain, bodyText);
    this.signLegacyGatewayRequest("POST", path, headers, {});
    const response = await import_axios.default.post(`https://${domain}${path}`, bodyText, {
      headers,
      timeout: 15e3
    });
    return response.data;
  }
  async callLegacyOpenAccountConnect() {
    var _a, _b, _c, _d, _e;
    const domain = "sdk.openaccount.aliyun.com";
    const body = {
      context: {
        sdkVersion: "3.4.2",
        platformName: "android",
        netType: "wifi",
        appKey: LEGACY_APP_KEY,
        yunOSId: "",
        appVersion: LEGACY_APP_VERSION,
        utDid: this.legacyUtdid,
        appAuthToken: this.legacyUtdid,
        securityToken: this.legacyUtdid
      },
      config: {
        version: 0,
        lastModify: 0
      },
      device: {
        model: "sdk_gphone_x86_arm",
        brand: "goldfish_x86",
        platformVersion: "30"
      }
    };
    const bodyJson = JSON.stringify(body);
    const headers = {
      host: domain,
      date: this.legacyUtcDate(),
      "x-ca-nonce": this.randomUuid(),
      "x-ca-key": LEGACY_APP_KEY,
      "x-ca-signaturemethod": "HmacSHA256",
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "okhttp/4.9.3"
    };
    const { signatureHeaders, headerBlock } = this.buildLegacySignatureHeaders(headers);
    headers["x-ca-signature-headers"] = signatureHeaders;
    const toSign = `POST
${headers.accept}

${headers["content-type"]}
${headers.date}
${headerBlock}
/api/prd/connect.json?request=${bodyJson}`;
    headers["x-ca-signature"] = this.hmacSha256Base64(LEGACY_APP_SECRET, toSign);
    const response = await import_axios.default.post(`https://${domain}/api/prd/connect.json`, null, {
      headers,
      params: { request: bodyJson },
      timeout: 15e3
    });
    const data = response.data;
    const vid = ((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.vid) || (data == null ? void 0 : data.vid) || "";
    const deviceId = ((_e = (_d = (_c = (_b = data == null ? void 0 : data.data) == null ? void 0 : _b.data) == null ? void 0 : _c.device) == null ? void 0 : _d.data) == null ? void 0 : _e.deviceId) || "";
    if (!vid || !deviceId) {
      throw new Error("Legacy connect fehlgeschlagen: vid/deviceId fehlen");
    }
    return {
      vid,
      deviceId,
      utdid: this.legacyUtdid
    };
  }
  async callLegacyLoginByOauth(oaApiGatewayEndpoint, authorizationCode, countryCode, vid, deviceId, utdid) {
    const body = {
      country: countryCode,
      authCode: authorizationCode,
      oauthPlateform: 23,
      oauthAppKey: LEGACY_APP_KEY,
      riskControlInfo: {
        appID: "com.agilexrobotics",
        appAuthToken: "",
        signType: "RSA",
        sdkVersion: "3.4.2",
        utdid,
        umidToken: utdid,
        deviceId,
        USE_OA_PWD_ENCRYPT: "true",
        USE_H5_NC: "true"
      }
    };
    const bodyJson = JSON.stringify(body);
    const headers = {
      host: oaApiGatewayEndpoint,
      date: this.legacyUtcDate(),
      "x-ca-nonce": this.randomUuid(),
      "x-ca-key": LEGACY_APP_KEY,
      "x-ca-signaturemethod": "HmacSHA256",
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      "user-agent": "okhttp/4.9.3",
      vid
    };
    const { signatureHeaders, headerBlock } = this.buildLegacySignatureHeaders(headers);
    headers["x-ca-signature-headers"] = signatureHeaders;
    const toSign = `POST
${headers.accept}

${headers["content-type"]}
${headers.date}
${headerBlock}
/api/prd/loginbyoauth.json?loginByOauthRequest=${bodyJson}`;
    headers["x-ca-signature"] = this.hmacSha256Base64(LEGACY_APP_SECRET, toSign);
    const form = new URLSearchParams();
    form.set("loginByOauthRequest", bodyJson);
    const response = await import_axios.default.post(
      `https://${oaApiGatewayEndpoint}/api/prd/loginbyoauth.json`,
      form.toString(),
      { headers, timeout: 15e3 }
    );
    return response.data;
  }
  buildLegacyGatewayHeaders(domain, bodyText) {
    return {
      host: domain,
      date: this.legacyUtcDate(),
      "x-ca-nonce": this.randomUuid(),
      "x-ca-key": LEGACY_APP_KEY,
      "x-ca-signaturemethod": "HmacSHA256",
      accept: "application/json",
      "user-agent": "okhttp/4.9.3",
      "content-type": "application/octet-stream",
      "content-md5": (0, import_node_crypto.createHash)("md5").update(bodyText, "utf8").digest("base64")
    };
  }
  signLegacyGatewayRequest(method, path, headers, query) {
    const { signatureHeaders, headerBlock } = this.buildLegacySignatureHeaders(headers);
    headers["x-ca-signature-headers"] = signatureHeaders;
    const queryString = this.legacyBuildQueryString(query);
    const url = queryString ? `${path}?${queryString}` : path;
    const toSign = `${method}
${headers.accept || ""}
${headers["content-md5"] || ""}
${headers["content-type"] || ""}
${headers.date || ""}
${headerBlock}
${url}`;
    headers["x-ca-signature"] = this.hmacSha256Base64(LEGACY_APP_SECRET, toSign);
  }
  buildLegacySignatureHeaders(headers) {
    const copy = { ...headers };
    for (const key of Object.keys(copy)) {
      if (LEGACY_MOVE_HEADERS.has(key.toLowerCase())) {
        delete copy[key];
      }
    }
    const keys = Object.keys(copy).sort();
    return {
      signatureHeaders: keys.join(","),
      headerBlock: keys.map((key) => {
        var _a;
        return `${key}:${(_a = copy[key]) != null ? _a : ""}`;
      }).join("\n")
    };
  }
  legacyBuildQueryString(query) {
    return Object.entries(query).filter(([, value]) => value !== void 0 && value !== null).map(([key, value]) => `${key}=${value}`).join("&");
  }
  legacyUtcDate() {
    return (/* @__PURE__ */ new Date()).toUTCString();
  }
  randomUuid() {
    const nativeCrypto = globalThis.crypto;
    if (nativeCrypto == null ? void 0 : nativeCrypto.randomUUID) {
      return nativeCrypto.randomUUID();
    }
    return `${Date.now()}-${Math.trunc(Math.random() * 1e9)}`;
  }
  hmacSha256Base64(secret, value) {
    return (0, import_node_crypto.createHmac)("sha256", secret).update(value, "utf8").digest("base64");
  }
  extractLegacyApiMessage(response, fallback) {
    return response.message || response.msg || fallback;
  }
  buildTaskControlContent(session, context, command) {
    const action = this.commandToAction(command);
    const subtype = Number.parseInt(session.userAccount, 10);
    const commandBytes = this.buildNavTaskControlCommand(
      action,
      Number.isNaN(subtype) ? 0 : subtype,
      this.getReceiverDevice(context)
    );
    return commandBytes.toString("base64");
  }
  buildTaskSettingsContent(session, cutHeightMm, mowSpeedMs) {
    const subtype = Number.parseInt(session.userAccount, 10);
    const requestPayload = this.encodeMessage([
      this.encodeFieldVarint(3, Math.trunc(cutHeightMm)),
      this.encodeFieldFloat32(4, mowSpeedMs)
    ]);
    const wrapperPayload = this.encodeMessage([this.encodeFieldBytes(6, requestPayload)]);
    const now = Date.now();
    return this.encodeMessage([
      this.encodeFieldVarint(1, 243),
      this.encodeFieldVarint(2, 7),
      this.encodeFieldVarint(3, 1),
      this.encodeFieldVarint(5, 80),
      this.encodeFieldVarint(7, Number.isNaN(subtype) ? 0 : subtype),
      this.encodeFieldBytes(12, wrapperPayload),
      this.encodeFieldVarint(15, now)
    ]).toString("base64");
  }
  buildSetBladeHeightContent(session, cutHeightMm) {
    const subtype = Number.parseInt(session.userAccount, 10);
    const bladeHeightPayload = this.encodeMessage([this.encodeFieldVarint(1, Math.trunc(cutHeightMm))]);
    const driverPayload = this.encodeMessage([this.encodeFieldBytes(2, bladeHeightPayload)]);
    const now = Date.now();
    return this.encodeMessage([
      this.encodeFieldVarint(1, 243),
      this.encodeFieldVarint(2, 7),
      this.encodeFieldVarint(3, 1),
      this.encodeFieldVarint(4, 1),
      this.encodeFieldVarint(5, this.seq = this.seq + 1 & 255),
      this.encodeFieldVarint(6, 1),
      this.encodeFieldVarint(7, Number.isNaN(subtype) ? 0 : subtype),
      this.encodeFieldBytes(12, driverPayload),
      this.encodeFieldVarint(15, now)
    ]).toString("base64");
  }
  buildSetMowSpeedContent(session, mowSpeedMs) {
    const subtype = Number.parseInt(session.userAccount, 10);
    const speedPayload = this.encodeMessage([this.encodeFieldVarint(1, 1), this.encodeFieldFloat32(2, mowSpeedMs)]);
    const driverPayload = this.encodeMessage([this.encodeFieldBytes(3, speedPayload)]);
    const now = Date.now();
    return this.encodeMessage([
      this.encodeFieldVarint(1, 243),
      this.encodeFieldVarint(2, 7),
      this.encodeFieldVarint(3, 1),
      this.encodeFieldVarint(4, 1),
      this.encodeFieldVarint(5, this.seq = this.seq + 1 & 255),
      this.encodeFieldVarint(6, 1),
      this.encodeFieldVarint(7, Number.isNaN(subtype) ? 0 : subtype),
      this.encodeFieldBytes(12, driverPayload),
      this.encodeFieldVarint(15, now)
    ]).toString("base64");
  }
  buildRequestIotSyncContent(session, stop = false) {
    const subtype = Number.parseInt(session.userAccount, 10);
    const reportTypes = [1, 3, 4, 6, 10, 8];
    const reportCfgFields = [
      this.encodeFieldVarint(1, stop ? 1 : 0),
      this.encodeFieldVarint(2, 1e4),
      this.encodeFieldVarint(3, 3e3),
      this.encodeFieldVarint(4, 4e3),
      this.encodeFieldVarint(5, 0)
    ];
    for (const type of reportTypes) {
      reportCfgFields.push(this.encodeFieldVarint(6, type));
    }
    const sysPayload = this.encodeMessage([this.encodeFieldBytes(38, this.encodeMessage(reportCfgFields))]);
    const now = Date.now();
    return this.encodeMessage([
      this.encodeFieldVarint(1, 244),
      this.encodeFieldVarint(2, 7),
      this.encodeFieldVarint(3, 1),
      this.encodeFieldVarint(4, 1),
      this.encodeFieldVarint(5, this.seq = this.seq + 1 & 255),
      this.encodeFieldVarint(6, 1),
      this.encodeFieldVarint(7, Number.isNaN(subtype) ? 0 : subtype),
      this.encodeFieldBytes(10, sysPayload),
      this.encodeFieldVarint(15, now)
    ]).toString("base64");
  }
  buildRoutePlanningContent(session, context, settings, mode) {
    const routePayload = [
      this.encodeFieldVarint(1, 1),
      this.encodeFieldVarint(5, this.routeCommandToSubCmd(mode))
    ];
    if (mode !== "query") {
      routePayload.push(
        this.encodeFieldFixed64(2, BigInt(settings.jobId)),
        this.encodeFieldVarint(3, settings.jobVersion),
        this.encodeFieldVarint(4, settings.jobMode),
        this.encodeFieldVarint(6, settings.mowingLaps),
        this.encodeFieldVarint(7, settings.cutHeightMm),
        this.encodeFieldVarint(8, settings.channelWidthCm),
        this.encodeFieldVarint(9, settings.ultraWave),
        this.encodeFieldVarint(10, settings.channelMode),
        this.encodeFieldInt32(11, settings.towardDeg),
        this.encodeFieldFloat32(12, settings.mowSpeedMs),
        this.encodeFieldFixed64(14, 0n),
        this.encodeFieldRawBytes(15, this.buildRoutePathOrderBytes(settings)),
        this.encodeFieldVarint(17, settings.towardMode),
        this.encodeFieldInt32(18, settings.towardIncludedAngleDeg)
      );
      for (const areaHash of settings.areaHashes) {
        routePayload.push(this.encodeFieldFixed64(13, areaHash));
      }
    }
    const navPayload = this.encodeMessage([this.encodeFieldBytes(34, this.encodeMessage(routePayload))]);
    const subtype = Number.parseInt(session.userAccount, 10);
    const lubaMessage = this.buildLubaMessage({
      msgType: 240,
      receiverDevice: this.getReceiverDevice(context),
      subtype: Number.isNaN(subtype) ? 0 : subtype,
      subMessageField: 11,
      subMessagePayload: navPayload
    });
    return lubaMessage.toString("base64");
  }
  buildNonWorkHoursContent(session, context, settings) {
    const unableTimePayload = this.encodeMessage([
      this.encodeFieldVarint(1, settings.subCmd),
      this.encodeFieldString(2, context.iotId),
      this.encodeFieldString(3, settings.startTime),
      this.encodeFieldString(4, settings.endTime),
      this.encodeFieldVarint(5, 0),
      this.encodeFieldString(6, "0"),
      this.encodeFieldVarint(7, 0)
    ]);
    const navPayload = this.encodeMessage([this.encodeFieldBytes(41, unableTimePayload)]);
    const subtype = Number.parseInt(session.userAccount, 10);
    const lubaMessage = this.buildLubaMessage({
      msgType: 240,
      receiverDevice: this.getReceiverDevice(context),
      subtype: Number.isNaN(subtype) ? 0 : subtype,
      subMessageField: 11,
      subMessagePayload: navPayload
    });
    return lubaMessage.toString("base64");
  }
  buildBladeControlContent(session, _context, settings) {
    const mowCtrlByHand = this.encodeMessage([
      this.encodeFieldVarint(1, settings.powerOn ? 1 : 0),
      this.encodeFieldVarint(2, settings.powerOn ? 1 : 0),
      this.encodeFieldVarint(3, settings.heightMm),
      this.encodeFieldFloat32(4, settings.maxSpeedMs)
    ]);
    const driverPayload = this.encodeMessage([this.encodeFieldBytes(6, mowCtrlByHand)]);
    const subtype = Number.parseInt(session.userAccount, 10);
    const lubaMessage = this.buildLubaMessage({
      msgType: 243,
      receiverDevice: 1,
      subtype: Number.isNaN(subtype) ? 0 : subtype,
      subMessageField: 12,
      subMessagePayload: driverPayload
    });
    return lubaMessage.toString("base64");
  }
  buildRoutePathOrderBytes(settings) {
    const bytes = Buffer.alloc(8);
    bytes[0] = this.clampByte(settings.borderMode);
    bytes[1] = this.clampByte(settings.obstacleLaps);
    bytes[3] = this.clampByte(settings.startProgress);
    bytes[6] = this.clampByte(settings.isDump ? settings.collectGrassFrequency : 10);
    return bytes;
  }
  clampByte(value) {
    return Math.max(0, Math.min(255, Math.trunc(value)));
  }
  routeCommandToSubCmd(mode) {
    switch (mode) {
      case "generate":
        return 0;
      case "modify":
        return 3;
      case "query":
        return 2;
    }
  }
  buildLubaMessage(args) {
    const now = BigInt(Date.now());
    this.seq = this.seq + 1 & 255;
    return this.encodeMessage([
      this.encodeFieldVarint(1, args.msgType),
      this.encodeFieldVarint(2, 7),
      this.encodeFieldVarint(3, args.receiverDevice),
      this.encodeFieldVarint(4, 1),
      this.encodeFieldVarint(5, this.seq),
      this.encodeFieldVarint(6, 1),
      this.encodeFieldVarint(7, args.subtype),
      this.encodeFieldBytes(args.subMessageField, args.subMessagePayload),
      this.encodeFieldVarint(15, now)
    ]);
  }
  commandToAction(command) {
    switch (command) {
      case "start":
        return 1;
      case "pause":
        return 2;
      case "resume":
        return 3;
      case "stop":
      case "cancelJob":
        return 4;
      case "dock":
        return 5;
      case "cancelDock":
        return 12;
    }
  }
  getReceiverDevice(context) {
    const lowerType = `${context.deviceName} ${context.productKey}`.toLowerCase();
    if (lowerType.includes("luba 2") || lowerType.includes("yuka") || lowerType.includes("x3")) {
      return 17;
    }
    return 1;
  }
  buildNavTaskControlCommand(action, subtype, receiverDevice) {
    const taskCtrl = this.encodeMessage([
      this.encodeFieldVarint(1, 1),
      // type
      this.encodeFieldVarint(2, action),
      // action
      this.encodeFieldVarint(3, 0)
      // result
    ]);
    const nav = this.encodeMessage([this.encodeFieldBytes(37, taskCtrl)]);
    const now = Date.now();
    this.seq = this.seq + 1 & 255;
    return this.encodeMessage([
      this.encodeFieldVarint(1, 240),
      // MSG_CMD_TYPE_NAV
      this.encodeFieldVarint(2, 7),
      // DEV_MOBILEAPP
      this.encodeFieldVarint(3, receiverDevice),
      // DEV_MAINCTL / DEV_NAVIGATION
      this.encodeFieldVarint(4, 1),
      // MSG_ATTR_REQ
      this.encodeFieldVarint(5, this.seq),
      this.encodeFieldVarint(6, 1),
      // version
      this.encodeFieldVarint(7, subtype),
      // user account id
      this.encodeFieldBytes(11, nav),
      // nav payload
      this.encodeFieldVarint(15, now)
      // timestamp
    ]);
  }
  encodeMessage(fields) {
    return Buffer.concat(fields);
  }
  encodeFieldVarint(fieldNumber, value) {
    const tag = fieldNumber << 3 | 0;
    return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(value)]);
  }
  encodeFieldInt32(fieldNumber, value) {
    const tag = fieldNumber << 3 | 0;
    let v = BigInt(Math.trunc(value));
    if (v < 0n) {
      v = (1n << 64n) + v;
    }
    return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(v)]);
  }
  encodeFieldBytes(fieldNumber, value) {
    const tag = fieldNumber << 3 | 2;
    return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(value.length), value]);
  }
  encodeFieldRawBytes(fieldNumber, value) {
    const tag = fieldNumber << 3 | 2;
    return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(value.length), value]);
  }
  encodeFieldString(fieldNumber, value) {
    return this.encodeFieldRawBytes(fieldNumber, Buffer.from(value, "utf8"));
  }
  encodeFieldFixed64(fieldNumber, value) {
    const tag = fieldNumber << 3 | 1;
    const payload = Buffer.allocUnsafe(8);
    const normalized = BigInt.asUintN(64, value);
    payload.writeBigUInt64LE(normalized, 0);
    return Buffer.concat([this.encodeVarint(tag), payload]);
  }
  encodeFieldFloat32(fieldNumber, value) {
    const tag = fieldNumber << 3 | 5;
    const payload = Buffer.allocUnsafe(4);
    payload.writeFloatLE(value, 0);
    return Buffer.concat([this.encodeVarint(tag), payload]);
  }
  encodeVarint(value) {
    let v = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
    if (v < 0n) {
      v = 0n;
    }
    const bytes = [];
    while (v > 127n) {
      bytes.push(Number(v & 0x7fn) | 128);
      v >>= 7n;
    }
    bytes.push(Number(v));
    return Buffer.from(bytes);
  }
  async ensureBaseStates() {
    await this.setObjectNotExistsAsync("info.connection", this.createReadonlyState("If connected to service", "boolean", "indicator.connected"));
    await this.setObjectNotExistsAsync("info.mqttConnected", this.createReadonlyState("If MQTT is connected", "boolean", "indicator.connected"));
    await this.setObjectNotExistsAsync("info.deviceCount", this.createReadonlyState("Number of discovered devices", "number", "value"));
    await this.setObjectNotExistsAsync("info.lastMessageTs", this.createReadonlyState("Last MQTT message timestamp", "number", "value.time"));
    await this.setObjectNotExistsAsync("info.lastError", this.createReadonlyState("Last error", "string", "text"));
    await this.setObjectNotExistsAsync("account.expiresAt", this.createReadonlyState("Access token expiry", "number", "value.time"));
    await this.setObjectNotExistsAsync("account.userId", this.createReadonlyState("Account user id", "string", "text"));
    await this.setObjectNotExistsAsync("account.userAccount", this.createReadonlyState("Account user account", "string", "text"));
    await this.setObjectNotExistsAsync("account.iotDomain", this.createReadonlyState("IoT API domain", "string", "text"));
  }
  createReadonlyState(name, type, role, states) {
    return {
      type: "state",
      common: {
        name,
        type,
        role,
        read: true,
        write: false,
        states: states ? this.normalizeStatesMap(states) : void 0
      },
      native: {}
    };
  }
  async ensureDeviceStateObjects(channelId) {
    await this.setObjectNotExistsAsync(`${channelId}.name`, this.createReadonlyState("Name", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.iotId`, this.createReadonlyState("IoT ID", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.deviceId`, this.createReadonlyState("Device ID", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.deviceType`, this.createReadonlyState("Device type", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.deviceTypeText`, this.createReadonlyState("Device type text", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.series`, this.createReadonlyState("Series", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.productSeries`, this.createReadonlyState("Product series", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.productKey`, this.createReadonlyState("Product key", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.recordDeviceName`, this.createReadonlyState("Record device name", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.status`, this.createReadonlyState("Status", "number", "value"));
    await this.setObjectNotExistsAsync(`${channelId}.raw`, this.createReadonlyState("Raw device payload", "string", "json"));
    await this.extendObjectAsync(`${channelId}.telemetry`, { type: "channel", common: { name: "Telemetry" }, native: {} });
    await this.setObjectNotExistsAsync(
      `${channelId}.telemetry.connected`,
      this.createReadonlyState("Device online", "boolean", "indicator.reachable")
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.telemetry.batteryPercent`,
      this.createReadonlyState("Battery percent", "number", "value.battery")
    );
    await this.removeLegacyState(`${channelId}.telemetry.knifeHeightMm`);
    await this.setObjectNotExistsAsync(
      `${channelId}.telemetry.bladeHeightMm`,
      this.createReadonlyState("Blade height", "number", "value.distance")
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.telemetry.deviceState`,
      this.createReadonlyState("Device state", "number", "value", WORK_MODE_NAMES)
    );
    await this.removeLegacyState(`${channelId}.telemetry.deviceStateText`);
    await this.setObjectNotExistsAsync(`${channelId}.telemetry.latitude`, this.createReadonlyState("Latitude", "number", "value.gps.latitude"));
    await this.setObjectNotExistsAsync(
      `${channelId}.telemetry.longitude`,
      this.createReadonlyState("Longitude", "number", "value.gps.longitude")
    );
    await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastTopic`, this.createReadonlyState("Last MQTT topic", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastPayload`, this.createReadonlyState("Last MQTT payload", "string", "json"));
    await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastEventId`, this.createReadonlyState("Last event identifier", "string", "text"));
    await this.setObjectNotExistsAsync(
      `${channelId}.telemetry.lastProtoContent`,
      this.createReadonlyState("Last protobuf content (base64)", "string", "text")
    );
    await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastUpdate`, this.createReadonlyState("Last telemetry timestamp", "number", "value.time"));
    await this.extendObjectAsync(`${channelId}.commands`, { type: "channel", common: { name: "Commands" }, native: {} });
    await this.setObjectNotExistsAsync(`${channelId}.commands.start`, this.createCommandState("Start mowing"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.pause`, this.createCommandState("Pause mowing"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.resume`, this.createCommandState("Resume mowing"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.stop`, this.createCommandState("Stop mowing"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.dock`, this.createCommandState("Return to dock"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.cancelJob`, this.createCommandState("Cancel current job"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.cancelDock`, this.createCommandState("Cancel return to dock"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.generateRoute`, this.createCommandState("Generate route"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.modifyRoute`, this.createCommandState("Modify route"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.queryRoute`, this.createCommandState("Query route"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.applyNonWorkHours`, this.createCommandState("Set non-work hours"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.applyBladeControl`, this.createCommandState("Start/stop blades"));
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.targetCutHeightMm`,
      this.createWritableNumberState("Target cut height", "level", 65, { unit: "mm", min: 20, max: 100, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.targetMowSpeedMs`,
      this.createWritableNumberState("Target mowing speed", "value.speed", 0.3, { unit: "m/s", min: 0.1, max: 1, step: 0.01 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeAreasCsv`,
      this.createWritableStringState("Area hashes CSV", "text", "")
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeJobMode`,
      this.createWritableNumberState("Route job mode", "level", 4, { min: 0, max: 10, step: 1 }, ROUTE_JOB_MODE_NAMES)
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeJobVersion`,
      this.createWritableNumberState("Route job version", "level", 0, { min: 0, max: 1e6, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeJobId`,
      this.createWritableNumberState("Route job id", "level", 0, { min: 0, max: 9e15, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeUltraWave`,
      this.createWritableNumberState("Obstacle mode", "level", 2, { min: 0, max: 20, step: 1 }, ROUTE_ULTRAWAVE_MODE_NAMES)
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeChannelMode`,
      this.createWritableNumberState("Route pattern mode", "level", 0, { min: 0, max: 3, step: 1 }, ROUTE_CHANNEL_MODE_NAMES)
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeChannelWidthCm`,
      this.createWritableNumberState("Route spacing", "value.distance", 25, { unit: "cm", min: 5, max: 50, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeTowardDeg`,
      this.createWritableNumberState("Route angle", "value", 0, { unit: "deg", min: -180, max: 180, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeTowardIncludedAngleDeg`,
      this.createWritableNumberState("Cross angle", "value", 0, { unit: "deg", min: -180, max: 180, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeTowardMode`,
      this.createWritableNumberState("Route angle mode", "level", 0, { min: 0, max: 2, step: 1 }, ROUTE_TOWARD_MODE_NAMES)
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeMowingLaps`,
      this.createWritableNumberState("Mowing laps", "level", 1, { min: 0, max: 8, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeBorderMode`,
      this.createWritableNumberState("Border mode", "level", 1, { min: 0, max: 1, step: 1 }, ROUTE_BORDER_MODE_NAMES)
    );
    await this.removeLegacyState(`${channelId}.commands.routeJobModeText`);
    await this.removeLegacyState(`${channelId}.commands.routeUltraWaveText`);
    await this.removeLegacyState(`${channelId}.commands.routeChannelModeText`);
    await this.removeLegacyState(`${channelId}.commands.routeTowardModeText`);
    await this.removeLegacyState(`${channelId}.commands.routeBorderModeText`);
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeObstacleLaps`,
      this.createWritableNumberState("Obstacle laps", "level", 1, { min: 0, max: 8, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeCollectGrassFrequency`,
      this.createWritableNumberState("Collect frequency", "level", 10, { min: 0, max: 100, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.routeStartProgress`,
      this.createWritableNumberState("Start progress", "value", 0, { unit: "%", min: 0, max: 100, step: 1 })
    );
    await this.setObjectNotExistsAsync(`${channelId}.commands.routeIsMow`, this.createWritableBooleanState("Route mowing enabled", true));
    await this.setObjectNotExistsAsync(`${channelId}.commands.routeIsDump`, this.createWritableBooleanState("Route dumping enabled", true));
    await this.setObjectNotExistsAsync(`${channelId}.commands.routeIsEdge`, this.createWritableBooleanState("Route edge enabled", false));
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.nonWorkStart`,
      this.createWritableStringState("Non-work start", "text", "22:00")
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.nonWorkEnd`,
      this.createWritableStringState("Non-work end", "text", "07:00")
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.nonWorkSubCmd`,
      this.createWritableNumberState("Non-work sub command", "level", 0, { min: 0, max: 10, step: 1 })
    );
    await this.setObjectNotExistsAsync(`${channelId}.commands.bladePowerOn`, this.createWritableBooleanState("Blade power", true));
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.bladeHeightMm`,
      this.createWritableNumberState("Blade height command", "value.distance", 60, { unit: "mm", min: 0, max: 100, step: 1 })
    );
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.bladeMaxSpeedMs`,
      this.createWritableNumberState("Blade max speed", "value.speed", 1.2, { unit: "m/s", min: 0.1, max: 1.5, step: 0.01 })
    );
    await this.setObjectNotExistsAsync(`${channelId}.commands.applyTaskSettings`, this.createCommandState("Apply task settings"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.lastResult`, this.createReadonlyState("Last command result", "string", "text"));
    await this.setObjectNotExistsAsync(`${channelId}.commands.lastError`, this.createReadonlyState("Last command error", "string", "text"));
    await this.setObjectNotExistsAsync(
      `${channelId}.commands.lastTimestamp`,
      this.createReadonlyState("Last command timestamp", "number", "value.time")
    );
    if (!await this.getStateAsync(`${channelId}.commands.targetCutHeightMm`)) {
      await this.setStateAsync(`${channelId}.commands.targetCutHeightMm`, 65, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.targetMowSpeedMs`)) {
      await this.setStateAsync(`${channelId}.commands.targetMowSpeedMs`, 0.3, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeAreasCsv`)) {
      await this.setStateAsync(`${channelId}.commands.routeAreasCsv`, "", true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeJobMode`)) {
      await this.setStateAsync(`${channelId}.commands.routeJobMode`, 4, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeJobVersion`)) {
      await this.setStateAsync(`${channelId}.commands.routeJobVersion`, 0, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeJobId`)) {
      await this.setStateAsync(`${channelId}.commands.routeJobId`, 0, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeUltraWave`)) {
      await this.setStateAsync(`${channelId}.commands.routeUltraWave`, 2, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeChannelMode`)) {
      await this.setStateAsync(`${channelId}.commands.routeChannelMode`, 0, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeChannelWidthCm`)) {
      await this.setStateAsync(`${channelId}.commands.routeChannelWidthCm`, 25, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeTowardDeg`)) {
      await this.setStateAsync(`${channelId}.commands.routeTowardDeg`, 0, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngleDeg`)) {
      await this.setStateAsync(`${channelId}.commands.routeTowardIncludedAngleDeg`, 0, true);
    }
    const legacyTowardIncludedAngleState = await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngelDeg`) || await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngle`) || await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngel`);
    if ((legacyTowardIncludedAngleState == null ? void 0 : legacyTowardIncludedAngleState.val) !== void 0 && (legacyTowardIncludedAngleState == null ? void 0 : legacyTowardIncludedAngleState.val) !== null) {
      const migratedToward = Number(legacyTowardIncludedAngleState.val);
      if (Number.isFinite(migratedToward)) {
        await this.setStateChangedAsync(`${channelId}.commands.routeTowardIncludedAngleDeg`, migratedToward, true);
      }
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeTowardMode`)) {
      await this.setStateAsync(`${channelId}.commands.routeTowardMode`, 0, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeMowingLaps`)) {
      await this.setStateAsync(`${channelId}.commands.routeMowingLaps`, 1, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeBorderMode`)) {
      await this.setStateAsync(`${channelId}.commands.routeBorderMode`, 1, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeObstacleLaps`)) {
      await this.setStateAsync(`${channelId}.commands.routeObstacleLaps`, 1, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeCollectGrassFrequency`)) {
      await this.setStateAsync(`${channelId}.commands.routeCollectGrassFrequency`, 10, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeStartProgress`)) {
      await this.setStateAsync(`${channelId}.commands.routeStartProgress`, 0, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeIsMow`)) {
      await this.setStateAsync(`${channelId}.commands.routeIsMow`, true, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeIsDump`)) {
      await this.setStateAsync(`${channelId}.commands.routeIsDump`, true, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.routeIsEdge`)) {
      await this.setStateAsync(`${channelId}.commands.routeIsEdge`, false, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.nonWorkStart`)) {
      await this.setStateAsync(`${channelId}.commands.nonWorkStart`, "22:00", true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.nonWorkEnd`)) {
      await this.setStateAsync(`${channelId}.commands.nonWorkEnd`, "07:00", true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.nonWorkSubCmd`)) {
      await this.setStateAsync(`${channelId}.commands.nonWorkSubCmd`, 0, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.bladePowerOn`)) {
      await this.setStateAsync(`${channelId}.commands.bladePowerOn`, true, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.bladeHeightMm`)) {
      await this.setStateAsync(`${channelId}.commands.bladeHeightMm`, 60, true);
    }
    if (!await this.getStateAsync(`${channelId}.commands.bladeMaxSpeedMs`)) {
      await this.setStateAsync(`${channelId}.commands.bladeMaxSpeedMs`, 1.2, true);
    }
  }
  createCommandState(name) {
    return {
      type: "state",
      common: {
        name,
        type: "boolean",
        role: "button",
        read: false,
        write: true,
        def: false
      },
      native: {}
    };
  }
  createWritableNumberState(name, role, def, limits = {}, states) {
    return {
      type: "state",
      common: {
        name,
        type: "number",
        role,
        read: true,
        write: true,
        def,
        unit: limits.unit,
        min: limits.min,
        max: limits.max,
        step: limits.step,
        states: states ? this.normalizeStatesMap(states) : void 0
      },
      native: {}
    };
  }
  normalizeStatesMap(states) {
    const normalized = {};
    for (const [key, value] of Object.entries(states)) {
      normalized[`${key}`] = value;
    }
    return normalized;
  }
  createWritableBooleanState(name, def) {
    return {
      type: "state",
      common: {
        name,
        type: "boolean",
        role: "switch",
        read: true,
        write: true,
        def
      },
      native: {}
    };
  }
  createWritableStringState(name, role, def) {
    return {
      type: "state",
      common: {
        name,
        type: "string",
        role,
        read: true,
        write: true,
        def
      },
      native: {}
    };
  }
  async removeLegacyState(id) {
    const obj = await this.getObjectAsync(id);
    if (!obj) {
      return;
    }
    try {
      await this.delObjectAsync(id);
    } catch (err) {
      this.log.debug(`Konnte Legacy-State ${id} nicht l\xF6schen: ${this.extractAxiosError(err)}`);
    }
  }
  extractIotDomain(accessToken) {
    const parts = accessToken.split(".");
    if (parts.length < 2) {
      throw new Error("Access token ung\xFCltig: JWT Payload fehlt");
    }
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const claims = JSON.parse(decoded);
    if (!claims.iot) {
      throw new Error("Access token enth\xE4lt kein iot-Domain-Claim");
    }
    const domain = claims.iot.startsWith("http") ? claims.iot : `https://${claims.iot}`;
    return domain.replace(/\/$/, "");
  }
  createOauthSignature(payload) {
    const payloadJson = JSON.stringify(payload);
    const timestampMs = `${Date.now()}`;
    const stringToSign = `${OAUTH_APP_KEY}${timestampMs}${TOKEN_ENDPOINT}${payloadJson}`;
    const md5Secret = (0, import_node_crypto.createHash)("md5").update(OAUTH_APP_SECRET, "utf8").digest("hex");
    return (0, import_node_crypto.createHmac)("sha256", md5Secret).update(stringToSign, "utf8").digest("hex");
  }
  extractAxiosError(err) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (import_axios.default.isAxiosError(err)) {
      const axiosErr = err;
      const bodyMsg = ((_b = (_a = axiosErr.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error_description) || ((_d = (_c = axiosErr.response) == null ? void 0 : _c.data) == null ? void 0 : _d.error) || ((_f = (_e = axiosErr.response) == null ? void 0 : _e.data) == null ? void 0 : _f.message) || ((_h = (_g = axiosErr.response) == null ? void 0 : _g.data) == null ? void 0 : _h.msg);
      return bodyMsg || axiosErr.message;
    }
    return (err == null ? void 0 : err.message) || `${err}`;
  }
  buildClientId(deviceUuid) {
    const suffixFromUuid = deviceUuid.replace(/[^0-9]/g, "").slice(0, 7);
    const randomSuffix = Array.from({ length: 7 }, () => (0, import_node_crypto.randomInt)(0, 10).toString()).join("");
    return `${Date.now()}_${suffixFromUuid || randomSuffix}_1`;
  }
  sanitizeObjectId(id) {
    return id.replace(/[^A-Za-z0-9_-]/g, "_");
  }
  safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  pickNumber(...values) {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }
  resolveDeviceTypeName(deviceType, deviceName, series) {
    const code = this.pickNumber(deviceType);
    if (code !== null && DEVICE_TYPE_NAMES[code]) {
      return DEVICE_TYPE_NAMES[code];
    }
    const lower = `${deviceName} ${series || ""}`.toLowerCase();
    if (lower.includes("luba")) {
      return "Luba";
    }
    if (lower.includes("yuka")) {
      return "Yuka";
    }
    if (lower.includes("rtk")) {
      return "RTK";
    }
    return code !== null ? `UNKNOWN_${code}` : "";
  }
  generateHardwareString(length) {
    const seed = (0, import_node_crypto.createHash)("sha1").update(`${this.namespace}-${process.pid}`, "utf8").digest("hex");
    return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
  }
  extractAreaCodeFromToken(accessToken) {
    const parts = accessToken.split(".");
    if (parts.length < 2) {
      return "";
    }
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const claims = this.safeJsonParse(decoded);
    return (claims == null ? void 0 : claims.areaCode) || "";
  }
  async hydrateContextFromTelemetry(deviceKey) {
    var _a, _b;
    const ctx = this.deviceContexts.get(deviceKey);
    if (!ctx) {
      return;
    }
    const payloadState = await this.getStateAsync(`devices.${deviceKey}.telemetry.lastPayload`);
    const payload = typeof (payloadState == null ? void 0 : payloadState.val) === "string" ? this.safeJsonParse(payloadState.val) : null;
    const payloadIotId = typeof ((_a = payload == null ? void 0 : payload.params) == null ? void 0 : _a.iotId) === "string" && payload.params.iotId || typeof ((_b = payload == null ? void 0 : payload.params) == null ? void 0 : _b.iot_id) === "string" && payload.params.iot_id || typeof (payload == null ? void 0 : payload.iot_id) === "string" && payload.iot_id || "";
    if (payloadIotId && payloadIotId !== ctx.iotId) {
      ctx.iotId = payloadIotId;
      await this.setStateChangedAsync(`devices.${deviceKey}.iotId`, payloadIotId, true);
    }
    const topicState = await this.getStateAsync(`devices.${deviceKey}.telemetry.lastTopic`);
    if (typeof (topicState == null ? void 0 : topicState.val) === "string") {
      const parts = topicState.val.split("/");
      if (parts.length >= 4) {
        const productKey = parts[2] || "";
        const recordDeviceName = parts[3] || "";
        if (productKey && !ctx.productKey) {
          ctx.productKey = productKey;
          await this.setStateChangedAsync(`devices.${deviceKey}.productKey`, productKey, true);
        }
        if (recordDeviceName && !ctx.recordDeviceName) {
          ctx.recordDeviceName = recordDeviceName;
          await this.setStateChangedAsync(`devices.${deviceKey}.recordDeviceName`, recordDeviceName, true);
        }
        if (productKey && recordDeviceName) {
          this.mqttTopicMap.set(`${productKey}/${recordDeviceName}`, deviceKey);
        }
      }
    }
  }
  resolveDeviceKey(productKey, recordDeviceName, iotId) {
    var _a;
    const topicKey = `${productKey}/${recordDeviceName}`;
    const fromTopicMap = this.mqttTopicMap.get(topicKey);
    if (fromTopicMap) {
      return fromTopicMap;
    }
    if (iotId) {
      for (const ctx of this.deviceContexts.values()) {
        if (ctx.iotId === iotId) {
          return ctx.key;
        }
      }
    }
    if (recordDeviceName) {
      for (const ctx of this.deviceContexts.values()) {
        if (ctx.deviceName === recordDeviceName || ctx.recordDeviceName === recordDeviceName) {
          return ctx.key;
        }
      }
    }
    if (this.deviceContexts.size === 1) {
      return ((_a = this.deviceContexts.values().next().value) == null ? void 0 : _a.key) || null;
    }
    return null;
  }
}
if (require.main !== module) {
  module.exports = (options) => new Mammotion(options);
} else {
  (() => new Mammotion())();
}
//# sourceMappingURL=main.js.map
