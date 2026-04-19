/*
 * Created with @iobroker/create-adapter v3.1.2
 */

import * as utils from '@iobroker/adapter-core';
import axios, { AxiosError } from 'axios';
import { createHash, createHmac, randomInt } from 'node:crypto';
import {
    LUBA_PRO_PRODUCT_KEYS,
    YUKA_MINI_PRODUCT_KEYS,
    YUKA_ML_PRODUCT_KEYS,
    YUKA_PRODUCT_KEYS,
    resolveProductKeyGroup,
} from './lib/product-keys';
const mqtt = require('mqtt') as { connect: (url: string, options: Record<string, any>) => any };

const MAMMOTION_DOMAIN = 'https://id.mammotion.com';
const MAMMOTION_API_DOMAIN = 'https://domestic.mammotion.com';
const DEVICE_UUID_FALLBACK = 'A9D0F177-F701-4212-8676-EDF9B354AE48';
const OAUTH_APP_KEY = 'GxebgSt8si6pKqR';
const OAUTH_APP_SECRET = 'JP0508SRJFa0A90ADpzLINDBxMa4Vj';
const TOKEN_ENDPOINT = '/oauth2/token';
const LEGACY_ALIYUN_DOMAIN = 'api.link.aliyun.com';
const LEGACY_APP_KEY = '34231230';
const LEGACY_APP_SECRET = '1ba85698bb10e19c6437413b61ba3445';
const LEGACY_APP_VERSION = '1.11.130';
const LEGACY_MOVE_HEADERS = new Set<string>([
    'x-ca-signature',
    'x-ca-signature-headers',
    'accept',
    'content-md5',
    'content-type',
    'date',
    'host',
    'token',
    'user-agent',
]);
const DEVICE_TYPE_NAMES: Record<number, string> = {
    0: 'RTK',
    1: 'Luba 1',
    2: 'Luba 2',
    3: 'Yuka',
    4: 'Yuka Mini',
    5: 'Yuka Mini 2',
    6: 'Luba VP',
    7: 'Luba MN',
    8: 'Yuka VP',
    9: 'Spino',
    10: 'RTK 3A1',
    11: 'Luba LD',
    12: 'RTK 3A0',
    13: 'RTK 3A2',
    14: 'Yuka MV',
    15: 'Luba VA',
    16: 'Yuka ML',
    17: 'Luba MD',
    18: 'Luba LA',
    19: 'Spino S1',
    20: 'Spino E1',
    21: 'Yuka MN100',
    22: 'RTK NB',
    23: 'Luba MB',
    24: 'CM900',
};
const WORK_MODE_NAMES: Record<number, string> = {
    0: 'NOT_ACTIVE',
    1: 'ONLINE',
    2: 'OFFLINE',
    8: 'DISABLE',
    10: 'INITIALIZATION',
    11: 'READY',
    12: 'UNCONNECTED',
    13: 'WORKING',
    14: 'RETURNING',
    15: 'CHARGING',
    16: 'UPDATING',
    17: 'LOCK',
    19: 'PAUSE',
    20: 'MANUAL_MOWING',
    22: 'UPDATE_SUCCESS',
    23: 'OTA_UPGRADE_FAIL',
    31: 'JOB_DRAW',
    32: 'OBSTACLE_DRAW',
    34: 'CHANNEL_DRAW',
    35: 'ERASER_DRAW',
    36: 'EDIT_BOUNDARY',
    37: 'LOCATION_ERROR',
    38: 'BOUNDARY_JUMP',
    39: 'CHARGING_PAUSE',
};
const ROUTE_JOB_MODE_NAMES: Record<number, string> = {
    0: 'MODE_0',
    1: 'MODE_1',
    2: 'MODE_2',
    3: 'MODE_3',
    4: 'STANDARD',
};
const ROUTE_CHANNEL_MODE_NAMES: Record<number, string> = {
    0: 'PARALLEL',
    1: 'CROSSCHECK',
    2: 'SEGMENT',
    3: 'ADAPTIVE',
};
const ROUTE_ULTRAWAVE_MODE_NAMES: Record<number, string> = {
    0: 'DIRECT_TOUCH',
    1: 'SLOW_TOUCH',
    2: 'LESS_TOUCH',
    10: 'DIRECT_TOUCH_EDGE',
    11: 'LESS_TOUCH_EDGE',
};
const ROUTE_TOWARD_MODE_NAMES: Record<number, string> = {
    0: 'FIXED_ANGLE',
    1: 'RELATIVE_ANGLE',
    2: 'AUTO',
};
const ROUTE_BORDER_MODE_NAMES: Record<number, string> = {
    0: 'NONE',
    1: 'BORDER_FIRST',
};
const CUT_HEIGHT_MIN_MM = 30;
const CUT_HEIGHT_MAX_MM = 70;
const CUT_HEIGHT_STEP_MM = 5;
const ROUTE_CHANNEL_WIDTH_MIN_CM = 20;
const ROUTE_CHANNEL_WIDTH_MAX_CM = 35;
const ROUTE_MOWING_LAPS_MAX = 4;
const ROUTE_OBSTACLE_LAPS_MAX = 3;
const YUKA_ROUTE_CHANNEL_WIDTH_MIN_CM = 15;
const YUKA_ROUTE_CHANNEL_WIDTH_MAX_CM = 30;
const YUKA_MINI_ROUTE_CHANNEL_WIDTH_MIN_CM = 8;
const YUKA_MINI_ROUTE_CHANNEL_WIDTH_MAX_CM = 12;
const ACTIVE_DEVICE_STATES = new Set<number>([13, 14, 19, 20, 31, 32, 34, 35, 36, 37, 38]);
const IDLE_DEVICE_STATES = new Set<number>([0, 1, 2, 8, 10, 11, 12, 15, 16, 17, 22, 23, 39]);
const LEGACY_FAST_POLL_WINDOW_MS = 2 * 60 * 1000;
const AREA_NAME_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 60_000];

class Mammotion extends utils.Adapter {
    private mqttClient: any = null;
    private session: AuthSession | null = null;
    private legacySession: LegacySession | null = null;
    private mqttTopicMap = new Map<string, string>();
    private deviceContexts = new Map<string, DeviceContext>();
    private seq = 0;
    private cloudConnected = false;
    private jwtMqttConnected = false;
    private aliyunMqttConnected = false;
    private authFailureSince = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private legacyPollTimer: NodeJS.Timeout | null = null;
    private legacyLastPollAt = 0;
    private taskSettingsAutoApplyTimers = new Map<string, NodeJS.Timeout>();
    private routeAutoApplyTimers = new Map<string, NodeJS.Timeout>();
    private nonWorkAutoApplyTimers = new Map<string, NodeJS.Timeout>();
    private startSettingsEnforceTimers = new Map<string, NodeJS.Timeout>();
    private legacyPollingEnabled = false;
    private legacyPollInFlight = false;
    private legacyHasActiveDevice = false;
    private legacyFastPollUntil = 0;
    private lastRealtimeMqttMessageAt = 0;
    private aliyunEnsureInFlight = false;
    private lastAliyunEnsureAt = 0;
    private legacyUtdid = this.generateHardwareString(32);
    private legacyMqttNotImplementedLogged = false;
    private aliyunMqttClient: any = null;
    private aliyunMqttCreds: AliyunMqttCreds | null = null;
    private subscribedDeviceTopics = new Set<string>();
    private lastRequestedHashSetByDevice = new Map<string, string>();
    private pendingAreaNamesByDevice = new Map<string, Map<string, string>>();
    private classifiedAreaHashesByDevice = new Map<string, Set<string>>();
    private zoneDiscoveryInFlight = new Set<string>();
    private areaNameRetryTimers = new Map<string, NodeJS.Timeout>();
    private areaNameRetryAttempts = new Map<string, number>();
    /** Accumulator for multi-frame NavGetHashListAck messages, keyed by deviceKey. */
    private hashFrameAccumulator = new Map<string, { totalFrame: number; frames: Map<number, bigint[]> }>();
    /** Promise resolvers waiting for a specific field-33 response, keyed by "deviceKey:hash". */
    private classifyWaiters = new Map<string, (type: number) => void>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'mammotion',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        await this.ensureBaseStates();
        await this.updateConnectionStates();
        this.startReconnectTimer();

        if (!this.config.email || !this.config.password) {
            this.log.warn('Please enter the Mammotion app email and password in the adapter settings.');
            return;
        }

        const deviceUuid = this.config.deviceUuid || DEVICE_UUID_FALLBACK;

        try {
            this.session = await this.createSession(deviceUuid);
            await this.refreshSessionAndDeviceCache();
            await this.subscribeStatesAsync('devices.*.commands.*');
            await this.subscribeStatesAsync('devices.*.zones.*.start');
            await this.requestIotSyncForAllDevices();
            await this.requestAreaNamesForAllDevices();

            this.log.info(
                `Initialization successful: ${this.deviceContexts.size} device(s), telemetry via ${
                    this.mqttClient ? 'MQTT' : this.legacySession ? 'Aliyun Polling' : 'no active channel'
                }.`,
            );
        } catch (err) {
            const msg = this.extractAxiosError(err);
            this.markAuthFailure(msg);
            await this.setStateChangedAsync('info.lastError', msg, true);
            this.log.error(`Mammotion initialization failed: ${msg}`);
        }
    }

    private onUnload(callback: () => void): void {
        try {
            if (this.mqttClient) {
                this.mqttClient.removeAllListeners();
                this.mqttClient.on('error', () => {});
                this.mqttClient.end(true);
                this.mqttClient = null;
            }
            this.jwtMqttConnected = false;
            if (this.aliyunMqttClient) {
                this.aliyunMqttClient.removeAllListeners();
                this.aliyunMqttClient.on('error', () => {});
                this.aliyunMqttClient.end(true);
                this.aliyunMqttClient = null;
            }
            this.aliyunMqttConnected = false;
            if (this.reconnectTimer) {
                clearInterval(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            this.clearAutoApplyTimers(this.taskSettingsAutoApplyTimers);
            this.clearAutoApplyTimers(this.routeAutoApplyTimers);
            this.clearAutoApplyTimers(this.nonWorkAutoApplyTimers);
            this.clearAutoApplyTimers(this.startSettingsEnforceTimers);
            this.clearAutoApplyTimers(this.areaNameRetryTimers);
            this.areaNameRetryAttempts.clear();
            this.lastRequestedHashSetByDevice.clear();
            this.pendingAreaNamesByDevice.clear();
            this.classifiedAreaHashesByDevice.clear();
            this.zoneDiscoveryInFlight.clear();
            this.stopLegacyPolling();
            this.syncConnectionStates();
            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }

    private shouldStoreDebugPayloads(): boolean {
        return this.config.storeDebugPayloads === true;
    }

    private syncConnectionStates(): void {
        void this.updateConnectionStates();
    }

    private async updateConnectionStates(): Promise<void> {
        const mqttConnected = this.jwtMqttConnected || this.aliyunMqttConnected;
        const connection = this.cloudConnected || mqttConnected;
        await this.setStateChangedAsync('info.mqttConnected', mqttConnected, true);
        await this.setStateChangedAsync('info.connection', connection, true);
    }

    private setCloudConnected(connected: boolean): void {
        this.cloudConnected = connected;
        this.syncConnectionStates();
    }

    private setJwtMqttConnected(connected: boolean): void {
        this.jwtMqttConnected = connected;
        this.syncConnectionStates();
    }

    private setAliyunMqttConnected(connected: boolean): void {
        this.aliyunMqttConnected = connected;
        this.syncConnectionStates();
    }

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state || state.ack) {
            return;
        }

        const localId = id.replace(`${this.namespace}.`, '');
        const routeCommandMatch = localId.match(/^devices\.([^.]+)\.commands\.(generateRoute|modifyRoute|queryRoute)$/);
        if (routeCommandMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = routeCommandMatch[1];
            const mode = routeCommandMatch[2] as RouteCommandMode;
            void this.handleRouteCommand(deviceKey, mode, localId);
            return;
        }

        const nonWorkHoursMatch = localId.match(/^devices\.([^.]+)\.commands\.applyNonWorkHours$/);
        if (nonWorkHoursMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = nonWorkHoursMatch[1];
            void this.handleNonWorkHoursCommand(deviceKey, localId);
            return;
        }

        const bladeControlMatch = localId.match(/^devices\.([^.]+)\.commands\.applyBladeControl$/);
        if (bladeControlMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = bladeControlMatch[1];
            void this.handleBladeControlCommand(deviceKey, localId);
            return;
        }

        const commandMatch = localId.match(/^devices\.([^.]+)\.commands\.(start|pause|resume|stop|dock|cancelJob|cancelDock)$/);
        if (commandMatch) {
            if (state.val !== true) {
                return;
            }

            const deviceKey = commandMatch[1];
            const command = commandMatch[2] as DeviceCommand;
            void this.handleDeviceCommand(deviceKey, command, localId);
            return;
        }

        const applyTaskSettingsMatch = localId.match(/^devices\.([^.]+)\.commands\.applyTaskSettings$/);
        if (applyTaskSettingsMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = applyTaskSettingsMatch[1];
            void this.handleTaskSettingsCommand(deviceKey, localId);
            return;
        }

        const startZonesMatch = localId.match(/^devices\.([^.]+)\.commands\.startZones$/);
        if (startZonesMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = startZonesMatch[1];
            void this.handleStartZones(deviceKey, localId);
            return;
        }

        const startAllZonesMatch = localId.match(/^devices\.([^.]+)\.commands\.startAllZones$/);
        if (startAllZonesMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = startAllZonesMatch[1];
            void this.handleStartAllZones(deviceKey, localId);
            return;
        }

        const startSingleZoneMatch = localId.match(/^devices\.([^.]+)\.zones\.([^.]+)\.start$/);
        if (startSingleZoneMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = startSingleZoneMatch[1];
            const zoneName = startSingleZoneMatch[2];
            void this.handleStartSingleZone(deviceKey, zoneName, localId);
            return;
        }

        const requestAreaNamesMatch = localId.match(/^devices\.([^.]+)\.commands\.requestAreaNames$/);
        if (requestAreaNamesMatch) {
            if (state.val !== true) {
                return;
            }
            const deviceKey = requestAreaNamesMatch[1];
            void this.handleRequestAreaNames(deviceKey, localId);
            return;
        }

        const payloadMatch = localId.match(/^devices\.([^.]+)\.commands\.(payload|routePayloadJson)$/);
        if (payloadMatch) {
            const deviceKey = payloadMatch[1];
            const jsonStr = `${state.val ?? ''}`.trim();
            if (jsonStr) {
                void this.handlePayloadCommand(deviceKey, localId, jsonStr);
            }
            return;
        }

        const taskSettingMatch = localId.match(
            /^devices\.([^.]+)\.commands\.(targetMowSpeedMs|routeJobMode|routeJobVersion|routeJobId|routeUltraWave|routeChannelMode|routeChannelWidthCm|routeTowardDeg|routeTowardIncludedAngleDeg|routeTowardIncludedAngelDeg|routeTowardIncludedAngle|routeTowardIncludedAngel|routeTowardMode|routeMowingLaps|routeBorderMode|routeObstacleLaps|routeCollectGrassFrequency|routeStartProgress|routeIsMow|routeIsDump|routeIsEdge|routeAreaIds|routeAreasCsv|nonWorkStart|nonWorkEnd|nonWorkSubCmd|bladePowerOn|bladeHeightMm|bladeMaxSpeedMs)$/,
        );
        if (!taskSettingMatch) {
            return;
        }

        const deviceKey = taskSettingMatch[1];
        const settingName = taskSettingMatch[2];
        const rawValue = state.val;

        if (settingName === 'routeAreaIds' || settingName === 'routeAreasCsv' || settingName === 'nonWorkStart' || settingName === 'nonWorkEnd') {
            const value = `${rawValue ?? ''}`.trim();
            void this.setStateChangedAsync(localId, value, true);
            if (settingName === 'routeAreaIds' || settingName === 'routeAreasCsv') {
                this.scheduleAutoApplyRoute(deviceKey);
            } else {
                this.scheduleAutoApplyNonWork(deviceKey);
            }
            return;
        }

        if (settingName === 'routeIsMow' || settingName === 'routeIsDump' || settingName === 'routeIsEdge' || settingName === 'bladePowerOn') {
            const boolValue = rawValue === true || rawValue === 1 || rawValue === '1' || rawValue === 'true';
            void this.setStateChangedAsync(localId, boolValue, true);
            if (settingName === 'routeIsMow' || settingName === 'routeIsDump' || settingName === 'routeIsEdge') {
                this.scheduleAutoApplyRoute(deviceKey);
            }
            return;
        }

        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
            void this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, `Invalid value for ${settingName}.`, true);
            return;
        }

        if (settingName === 'bladeHeightMm') {
            const normalizedCutHeightMm = this.normalizeCutHeightMm(numericValue, this.deviceContexts.get(deviceKey));
            void this.setStateChangedAsync(localId, normalizedCutHeightMm, true);
            this.scheduleAutoApplyTaskSettings(deviceKey);
            return;
        }

        if (settingName === 'routeChannelWidthCm') {
            const normalizedRouteWidth = this.normalizeRouteChannelWidthCm(numericValue, this.deviceContexts.get(deviceKey));
            void this.setStateChangedAsync(localId, normalizedRouteWidth, true);
            this.scheduleAutoApplyRoute(deviceKey);
            return;
        }

        if (settingName === 'routeMowingLaps') {
            const normalizedMowingLaps = Math.min(ROUTE_MOWING_LAPS_MAX, Math.max(0, Math.trunc(numericValue)));
            void this.setStateChangedAsync(localId, normalizedMowingLaps, true);
            this.scheduleAutoApplyRoute(deviceKey);
            return;
        }

        if (settingName === 'routeObstacleLaps') {
            const normalizedObstacleLaps = Math.min(ROUTE_OBSTACLE_LAPS_MAX, Math.max(0, Math.trunc(numericValue)));
            void this.setStateChangedAsync(localId, normalizedObstacleLaps, true);
            this.scheduleAutoApplyRoute(deviceKey);
            return;
        }

        void this.setStateChangedAsync(localId, numericValue, true);
        if (settingName === 'targetMowSpeedMs') {
            this.scheduleAutoApplyTaskSettings(deviceKey);
            return;
        }
        if (this.isRouteSettingName(settingName)) {
            this.scheduleAutoApplyRoute(deviceKey);
            return;
        }
        if (settingName === 'nonWorkSubCmd') {
            this.scheduleAutoApplyNonWork(deviceKey);
        }
    }

    private scheduleAutoApplyTaskSettings(deviceKey: string): void {
        const existing = this.taskSettingsAutoApplyTimers.get(deviceKey);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.taskSettingsAutoApplyTimers.delete(deviceKey);
            void this.handleTaskSettingsCommand(deviceKey, `devices.${deviceKey}.commands.applyTaskSettings`);
        }, 1_500);

        this.taskSettingsAutoApplyTimers.set(deviceKey, timer);
    }

    private clearAutoApplyTimers(map: Map<string, NodeJS.Timeout>): void {
        for (const timer of map.values()) {
            clearTimeout(timer);
        }
        map.clear();
    }

    private isRouteSettingName(settingName: string): boolean {
        return (
            settingName === 'routeJobMode' ||
            settingName === 'routeJobVersion' ||
            settingName === 'routeJobId' ||
            settingName === 'routeUltraWave' ||
            settingName === 'routeChannelMode' ||
            settingName === 'routeChannelWidthCm' ||
            settingName === 'routeTowardDeg' ||
            settingName === 'routeTowardIncludedAngleDeg' ||
            settingName === 'routeTowardIncludedAngelDeg' ||
            settingName === 'routeTowardIncludedAngle' ||
            settingName === 'routeTowardIncludedAngel' ||
            settingName === 'routeTowardMode' ||
            settingName === 'routeMowingLaps' ||
            settingName === 'routeBorderMode' ||
            settingName === 'routeObstacleLaps' ||
            settingName === 'routeCollectGrassFrequency' ||
            settingName === 'routeStartProgress'
        );
    }

    private scheduleAutoApplyRoute(deviceKey: string): void {
        const existing = this.routeAutoApplyTimers.get(deviceKey);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.routeAutoApplyTimers.delete(deviceKey);
            void this.handleRouteCommand(deviceKey, 'modify', `devices.${deviceKey}.commands.modifyRoute`);
        }, 2_500);

        this.routeAutoApplyTimers.set(deviceKey, timer);
    }

    private scheduleAutoApplyNonWork(deviceKey: string): void {
        const existing = this.nonWorkAutoApplyTimers.get(deviceKey);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.nonWorkAutoApplyTimers.delete(deviceKey);
            void this.handleNonWorkHoursCommand(deviceKey, `devices.${deviceKey}.commands.applyNonWorkHours`);
        }, 1_500);

        this.nonWorkAutoApplyTimers.set(deviceKey, timer);
    }

    private scheduleStartSettingsEnforce(deviceKey: string): void {
        const existing = this.startSettingsEnforceTimers.get(deviceKey);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.startSettingsEnforceTimers.delete(deviceKey);
            void this.reapplyTaskSettingsAfterStart(deviceKey, 'timer');
        }, 25_000);
        this.startSettingsEnforceTimers.set(deviceKey, timer);
    }

    private triggerStartSettingsEnforceIfDeviceActive(deviceKey: string, deviceStateValue: number): void {
        if (!ACTIVE_DEVICE_STATES.has(deviceStateValue)) {
            return;
        }
        if (!this.startSettingsEnforceTimers.has(deviceKey)) {
            return;
        }

        const existing = this.startSettingsEnforceTimers.get(deviceKey);
        if (existing) {
            clearTimeout(existing);
        }
        this.startSettingsEnforceTimers.delete(deviceKey);
        void this.reapplyTaskSettingsAfterStart(deviceKey, 'state');
    }

    private async reapplyTaskSettingsAfterStart(deviceKey: string, trigger: 'timer' | 'state'): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            return;
        }

        try {
            const { cutHeightMm, mowSpeedMs } = await this.readTaskSettings(deviceKey);
            const result = await this.executeTaskSettingsCommand(ctx, cutHeightMm, mowSpeedMs);
            await this.setStateChangedAsync(
                `devices.${deviceKey}.commands.lastResult`,
                `start-${trigger}-reapply:${result}`,
                true,
            );
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, Date.now(), true);
            this.log.info(
                `Start-Reapply (${trigger}) for ${ctx.deviceName || ctx.iotId}: height ${cutHeightMm} mm, Speed ${mowSpeedMs} m/s.`,
            );
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            this.log.warn(`Start-Reapply (${trigger}) failed for ${ctx.deviceName || ctx.iotId}: ${msg}`);
        }
    }

    private async handleDeviceCommand(deviceKey: string, command: DeviceCommand, localId: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            const msg = `Unknown device for Command ${command}: ${deviceKey}`;
            this.log.warn(msg);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }

        try {
            await this.storeCommandPayload(deviceKey, {
                action: command,
                step: 'task-control',
                label: command,
            });

            let result = '';
            if (command === 'start') {
                const { cutHeightMm, mowSpeedMs } = await this.readTaskSettings(deviceKey);
                const settingsResult = await this.executeTaskSettingsCommand(ctx, cutHeightMm, mowSpeedMs);
                const startResult = await this.executeTaskControlCommand(ctx, command);
                result = `settings:${settingsResult};start:${startResult}`;
            } else {
                result = await this.executeTaskControlCommand(ctx, command);
            }
            const now = Date.now();

            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            if (command === 'start') {
                this.scheduleStartSettingsEnforce(deviceKey);
            }
            this.log.info(`Command ${command} for ${ctx.deviceName || ctx.iotId} succeeded.`);
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            if (this.isAuthError(err, msg)) {
                this.markAuthFailure(msg);
            }
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            this.log.error(`Command ${command} for ${ctx.deviceName || ctx.iotId} failed: ${msg}`);
        } finally {
            await this.setStateChangedAsync(localId, false, true);
        }
    }

    private async handleTaskSettingsCommand(deviceKey: string, localId: string): Promise<void> {
        const scheduled = this.taskSettingsAutoApplyTimers.get(deviceKey);
        if (scheduled) {
            clearTimeout(scheduled);
            this.taskSettingsAutoApplyTimers.delete(deviceKey);
        }

        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            const msg = `Unknown device for Task settings: ${deviceKey}`;
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
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            this.log.info(
                `Task settings for ${ctx.deviceName || ctx.iotId} succeeded: cut height ${cutHeightMm} mm, speed ${mowSpeedMs} m/s.`,
            );
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            if (this.isAuthError(err, msg)) {
                this.markAuthFailure(msg);
            }
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            this.log.error(`Task settings for ${ctx.deviceName || ctx.iotId} failed: ${msg}`);
        } finally {
            await this.setStateChangedAsync(localId, false, true);
        }
    }

    private async handleRouteCommand(deviceKey: string, mode: RouteCommandMode, localId: string): Promise<void> {
        const scheduled = this.routeAutoApplyTimers.get(deviceKey);
        if (scheduled) {
            clearTimeout(scheduled);
            this.routeAutoApplyTimers.delete(deviceKey);
        }

        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            const msg = `Unknown device for Route-Command ${mode}: ${deviceKey}`;
            this.log.warn(msg);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }

        try {
            const routeSettings = await this.readRouteSettings(deviceKey);
            await this.storeCommandPayload(
                deviceKey,
                this.createRoutePayloadObject(routeSettings, {
                    action: `${mode}Route`,
                    mode,
                    label: `route-${mode}`,
                    step: 'route-command',
                    routeReceiver: this.getReceiverDevice(ctx),
                    startReceiver: this.getReceiverDevice(ctx),
                }),
            );
            const result = await this.executeEncodedContentCommand(ctx, `route-${mode}`, (session, context) =>
                this.buildRoutePlanningContent(session, context, routeSettings, mode),
            );
            const now = Date.now();

            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            this.log.info(`Route-Command ${mode} for ${ctx.deviceName || ctx.iotId} succeeded.`);
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            if (this.isAuthError(err, msg)) {
                this.markAuthFailure(msg);
            }
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            this.log.error(`Route-Command ${mode} for ${ctx.deviceName || ctx.iotId} failed: ${msg}`);
        } finally {
            await this.setStateChangedAsync(localId, false, true);
        }
    }

    private async handleNonWorkHoursCommand(deviceKey: string, localId: string): Promise<void> {
        const scheduled = this.nonWorkAutoApplyTimers.get(deviceKey);
        if (scheduled) {
            clearTimeout(scheduled);
            this.nonWorkAutoApplyTimers.delete(deviceKey);
        }

        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            const msg = `Unknown device for Non-Work-Hours: ${deviceKey}`;
            this.log.warn(msg);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }

        try {
            const nonWorkHours = await this.readNonWorkHoursSettings(deviceKey);
            const result = await this.executeEncodedContentCommand(ctx, 'set-non-work-hours', (session, context) =>
                this.buildNonWorkHoursContent(session, context, nonWorkHours),
            );
            const now = Date.now();

            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            this.log.info(
                `Non-Work-Hours for ${ctx.deviceName || ctx.iotId} set: ${nonWorkHours.startTime}-${nonWorkHours.endTime}.`,
            );
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            if (this.isAuthError(err, msg)) {
                this.markAuthFailure(msg);
            }
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            this.log.error(`Non-Work-Hours for ${ctx.deviceName || ctx.iotId} failed: ${msg}`);
        } finally {
            await this.setStateChangedAsync(localId, false, true);
        }
    }

    private async handleBladeControlCommand(deviceKey: string, localId: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            const msg = `Unknown device for Blade control: ${deviceKey}`;
            this.log.warn(msg);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }

        try {
            const bladeControl = await this.readBladeControlSettings(deviceKey);
            const result = await this.executeEncodedContentCommand(ctx, 'blade-control', (session, context) =>
                this.buildBladeControlContent(session, context, bladeControl),
            );
            const now = Date.now();

            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            this.log.info(
                `Blade control for ${ctx.deviceName || ctx.iotId} succeeded: ${
                    bladeControl.powerOn ? 'ON' : 'OFF'
                }, height ${bladeControl.heightMm} mm.`,
            );
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            if (this.isAuthError(err, msg)) {
                this.markAuthFailure(msg);
            }
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            this.log.error(`Blade control for ${ctx.deviceName || ctx.iotId} failed: ${msg}`);
        } finally {
            await this.setStateChangedAsync(localId, false, true);
        }
    }

    private async readTaskSettings(deviceKey: string): Promise<{ cutHeightMm: number; mowSpeedMs: number }> {
        const cutHeightState = await this.getStateAsync(`devices.${deviceKey}.commands.bladeHeightMm`);
        const mowSpeedState = await this.getStateAsync(`devices.${deviceKey}.commands.targetMowSpeedMs`);

        const cutHeightMm = Math.trunc(Number(cutHeightState?.val));
        const mowSpeedMsRaw = Number(mowSpeedState?.val);

        if (!Number.isFinite(cutHeightMm)) {
            throw new Error('Cut height is invalid.');
        }
        if (!Number.isFinite(mowSpeedMsRaw)) {
            throw new Error('Mowing speed is invalid.');
        }

        const context = this.deviceContexts.get(deviceKey);
        const limits = this.getDeviceCommandLimits(context);
        const clampedCutHeight = this.normalizeCutHeightMm(cutHeightMm, context);
        const clampedMowSpeed = Math.min(limits.mowSpeed.max, Math.max(limits.mowSpeed.min, mowSpeedMsRaw));
        return {
            cutHeightMm: clampedCutHeight,
            mowSpeedMs: Number(clampedMowSpeed.toFixed(2)),
        };
    }

    private async readRouteSettings(deviceKey: string): Promise<RouteSettings> {
        const cutHeightMm = await this.readNumericCommandState(deviceKey, 'bladeHeightMm', 65);
        const mowSpeedMs = await this.readNumericCommandState(deviceKey, 'targetMowSpeedMs', 0.3);
        const routeJobMode = await this.readNumericCommandState(deviceKey, 'routeJobMode', 4);
        const routeJobVersion = await this.readNumericCommandState(deviceKey, 'routeJobVersion', 1);
        const routeJobId = await this.readNumericCommandState(deviceKey, 'routeJobId', 0);
        const routeUltraWave = await this.readNumericCommandState(deviceKey, 'routeUltraWave', 2);
        const routeChannelMode = await this.readNumericCommandState(deviceKey, 'routeChannelMode', 0);
        const routeChannelWidthCm = await this.readNumericCommandState(deviceKey, 'routeChannelWidthCm', 25);
        const routeTowardDeg = await this.readNumericCommandState(deviceKey, 'routeTowardDeg', 0);
        const routeTowardIncludedAngleDeg = await this.readNumericCommandStateWithFallback(
            deviceKey,
            ['routeTowardIncludedAngleDeg', 'routeTowardIncludedAngelDeg', 'routeTowardIncludedAngle', 'routeTowardIncludedAngel'],
            0,
        );
        const routeTowardMode = await this.readNumericCommandState(deviceKey, 'routeTowardMode', 0);
        const routeMowingLaps = await this.readNumericCommandState(deviceKey, 'routeMowingLaps', 1);
        const routeBorderMode = await this.readNumericCommandState(deviceKey, 'routeBorderMode', 1);
        const routeObstacleLaps = await this.readNumericCommandState(deviceKey, 'routeObstacleLaps', 1);
        const routeCollectGrassFrequency = await this.readNumericCommandState(deviceKey, 'routeCollectGrassFrequency', 10);
        const routeStartProgress = await this.readNumericCommandState(deviceKey, 'routeStartProgress', 0);
        const routeRideBoundaryDistance = await this.readNumericCommandState(deviceKey, 'routeRideBoundaryDistance', 0);

        // routeAreaIds is the canonical name; routeAreasCsv is the legacy fallback
        const routeAreaIds =
            (await this.readStringCommandState(deviceKey, 'routeAreaIds', '')) ||
            (await this.readStringCommandState(deviceKey, 'routeAreasCsv', ''));
        const routeIsMow = await this.readBooleanCommandState(deviceKey, 'routeIsMow', true);
        const routeIsDump = await this.readBooleanCommandState(deviceKey, 'routeIsDump', true);
        const routeIsEdge = await this.readBooleanCommandState(deviceKey, 'routeIsEdge', false);
        const areaHashes = this.parseAreaHashes(routeAreaIds);
        const context = this.deviceContexts.get(deviceKey);
        const limits = this.getDeviceCommandLimits(context);

        if (!areaHashes.length) {
            throw new Error('Please set at least one area hash ID in commands.routeAreaIds.');
        }

        return {
            areaHashes,
            cutHeightMm: this.normalizeCutHeightMm(cutHeightMm, context),
            mowSpeedMs: Number(Math.min(limits.mowSpeed.max, Math.max(limits.mowSpeed.min, mowSpeedMs)).toFixed(2)),
            jobMode: Math.min(10, Math.max(0, Math.trunc(routeJobMode))),
            jobVersion: Math.max(1, Math.trunc(routeJobVersion)),
            jobId: Math.max(1, Math.trunc(routeJobId) || Date.now()),
            ultraWave: Math.min(20, Math.max(0, Math.trunc(routeUltraWave))),
            channelMode: Math.min(3, Math.max(0, Math.trunc(routeChannelMode))),
            channelWidthCm: this.normalizeRouteChannelWidthCm(routeChannelWidthCm, context),
            towardDeg: Math.min(180, Math.max(-180, Math.trunc(routeTowardDeg))),
            towardIncludedAngleDeg: Math.min(180, Math.max(-180, Math.trunc(routeTowardIncludedAngleDeg))),
            towardMode: Math.min(2, Math.max(0, Math.trunc(routeTowardMode))),
            mowingLaps: Math.min(ROUTE_MOWING_LAPS_MAX, Math.max(0, Math.trunc(routeMowingLaps))),
            borderMode: Math.min(1, Math.max(0, Math.trunc(routeBorderMode))),
            obstacleLaps: Math.min(ROUTE_OBSTACLE_LAPS_MAX, Math.max(0, Math.trunc(routeObstacleLaps))),
            collectGrassFrequency: Math.min(100, Math.max(0, Math.trunc(routeCollectGrassFrequency))),
            startProgress: Math.min(100, Math.max(0, Math.trunc(routeStartProgress))),
            rideBoundaryDistance: Number(Math.min(1000, Math.max(0, routeRideBoundaryDistance)).toFixed(2)),
            isMow: routeIsMow,
            isDump: routeIsDump,
            isEdge: routeIsEdge,
        };
    }

    private async readNonWorkHoursSettings(deviceKey: string): Promise<NonWorkHoursSettings> {
        const startTime = await this.readStringCommandState(deviceKey, 'nonWorkStart', '22:00');
        const endTime = await this.readStringCommandState(deviceKey, 'nonWorkEnd', '07:00');
        const subCmd = await this.readNumericCommandState(deviceKey, 'nonWorkSubCmd', 0);

        if (!this.isValidHourMinute(startTime)) {
            throw new Error(`Invalid start time: ${startTime} (Format HH:MM).`);
        }
        if (!this.isValidHourMinute(endTime)) {
            throw new Error(`Invalid end time: ${endTime} (Format HH:MM).`);
        }

        return {
            startTime,
            endTime,
            subCmd: Math.min(10, Math.max(0, Math.trunc(subCmd))),
        };
    }

    private async readBladeControlSettings(deviceKey: string): Promise<BladeControlSettings> {
        const powerOn = await this.readBooleanCommandState(deviceKey, 'bladePowerOn', true);
        const heightMm = await this.readNumericCommandState(deviceKey, 'bladeHeightMm', 60);
        const maxSpeedMs = await this.readNumericCommandState(deviceKey, 'bladeMaxSpeedMs', 1.2);
        const context = this.deviceContexts.get(deviceKey);

        return {
            powerOn,
            heightMm: this.normalizeCutHeightMm(heightMm, context),
            maxSpeedMs: Number(Math.min(1.5, Math.max(0.1, maxSpeedMs)).toFixed(2)),
        };
    }

    private async readNumericCommandState(deviceKey: string, id: string, fallback: number): Promise<number> {
        const state = await this.getStateAsync(`devices.${deviceKey}.commands.${id}`);
        const value = Number(state?.val);
        return Number.isFinite(value) ? value : fallback;
    }

    private async readNumericCommandStateWithFallback(deviceKey: string, ids: string[], fallback: number): Promise<number> {
        for (const id of ids) {
            const value = await this.readNumericCommandState(deviceKey, id, Number.NaN);
            if (Number.isFinite(value)) {
                return value;
            }
        }
        return fallback;
    }

    private async readStringCommandState(deviceKey: string, id: string, fallback: string): Promise<string> {
        const state = await this.getStateAsync(`devices.${deviceKey}.commands.${id}`);
        if (state?.val === null || state?.val === undefined) {
            return fallback;
        }
        return `${state.val}`.trim();
    }

    private async readBooleanCommandState(deviceKey: string, id: string, fallback: boolean): Promise<boolean> {
        const state = await this.getStateAsync(`devices.${deviceKey}.commands.${id}`);
        if (state?.val === null || state?.val === undefined) {
            return fallback;
        }
        return state.val === true || state.val === 1 || state.val === '1' || state.val === 'true';
    }

    private parseAreaHashes(value: string): bigint[] {
        return value
            .split(/[,\s;]+/)
            .map(v => v.trim())
            .filter(Boolean)
            .map(v => {
                const parsed = v.startsWith('0x') || v.startsWith('0X') ? BigInt(v) : BigInt(v.replace(/_/g, ''));
                if (parsed <= 0n) {
                    throw new Error(`Invalid area hash: ${v}`);
                }
                return parsed;
            });
    }

    private isValidHourMinute(value: string): boolean {
        return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
    }

    private async refreshTelemetryAfterCommand(): Promise<void> {
        if (!this.deviceContexts.size) {
            return;
        }
        this.enableFastLegacyPollingWindow();
        try {
            const hasActiveDevice = await this.pollLegacyTelemetry();
            this.legacyHasActiveDevice = hasActiveDevice;
        } catch (err) {
            this.log.debug(`Immediate telemetry refresh failed: ${this.extractAxiosError(err)}`);
        } finally {
            if (this.legacyPollTimer) {
                this.scheduleLegacyPolling(this.getLegacyNextPollDelayMs());
            }
        }
    }

    private async requestIotSync(context: DeviceContext, stop = false): Promise<void> {
        try {
            await this.executeEncodedContentCommand(
                context,
                stop ? 'request-iot-sync-stop' : 'request-iot-sync',
                (session, _context) => this.buildRequestIotSyncContent(session, stop),
            );
        } catch (err) {
            this.log.debug(
                `IoT sync for ${context.deviceName || context.iotId} failed: ${this.extractAxiosError(err)}`,
            );
        }
    }

    private async requestIotSyncForAllDevices(stop = false): Promise<void> {
        for (const context of this.deviceContexts.values()) {
            await this.requestIotSync(context, stop);
        }
    }

    private async ensureValidSession(force = false): Promise<AuthSession> {
        if (!force && this.session && this.session.expiresAt > Date.now() + 60_000 && this.cloudConnected) {
            return this.session;
        }

        const deviceUuid = this.config.deviceUuid || DEVICE_UUID_FALLBACK;
        this.session = await this.createSession(deviceUuid);
        this.setCloudConnected(true);
        this.authFailureSince = 0;
        return this.session;
    }

    private async createSession(deviceUuid: string): Promise<AuthSession> {
        const clientId = this.buildClientId(deviceUuid);
        const login = await this.login(clientId);
        const iotDomain = this.extractIotDomain(login.access_token);
        const expiresAt = Date.now() + login.expires_in * 1000;

        const session: AuthSession = {
            accessToken: login.access_token,
            expiresAt,
            iotDomain,
            userId: login.userInformation?.userId || '',
            userAccount: login.userInformation?.userAccount || '0',
            authorizationCode: login.authorization_code || '',
            countryCode: login.userInformation?.domainAbbreviation || '',
            clientId,
        };

        // A fresh app login can invalidate the old Aliyun IoT session.
        this.legacySession = null;

        await this.setStateChangedAsync('account.expiresAt', expiresAt, true);
        await this.setStateChangedAsync('account.userId', session.userId, true);
        await this.setStateChangedAsync('account.userAccount', session.userAccount, true);
        await this.setStateChangedAsync('account.iotDomain', session.iotDomain, true);
        return session;
    }

    private async login(clientId: string): Promise<LoginResponse> {
        const payload = {
            username: this.config.email,
            password: this.config.password,
            client_id: OAUTH_APP_KEY,
            grant_type: 'password',
            authType: '0',
        };
        const signature = this.createOauthSignature(payload);

        const response = await axios.post<MammotionApiResponse<LoginResponse>>(`${MAMMOTION_DOMAIN}/oauth2/token`, undefined, {
            headers: {
                'User-Agent': 'okhttp/4.9.3',
                'App-Version': 'ioBroker,0.0.1',
                'Ma-App-Key': OAUTH_APP_KEY,
                'Ma-Signature': signature,
                'Ma-Timestamp': `${Math.floor(Date.now() / 1000)}`,
                'Client-Id': clientId,
                'Client-Type': '1',
            },
            params: payload,
            timeout: 10000,
        });

        if (response.data.code !== 0 || !response.data.data) {
            throw new Error(response.data.msg || `HTTP ${response.status}`);
        }
        return response.data.data;
    }

    private async fetchDeviceList(session: AuthSession): Promise<MammotionDevice[]> {
        const response = await axios.get<MammotionApiResponse<MammotionDevice[]>>(
            `${MAMMOTION_API_DOMAIN}/device-server/v1/device/list`,
            {
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'okhttp/4.9.3',
                    'Client-Id': session.clientId,
                    'Client-Type': '1',
                },
                timeout: 10000,
            },
        );

        if (response.data.code !== 0 || !Array.isArray(response.data.data)) {
            throw new Error(response.data.msg || `HTTP ${response.status}`);
        }
        return response.data.data;
    }

    private async fetchDeviceRecords(session: AuthSession): Promise<DeviceRecord[]> {
        const response = await axios.post<MammotionApiResponse<DevicePageData | DeviceRecord[]>>(
            `${session.iotDomain}/v1/user/device/page`,
            {
                iotId: '',
                pageNumber: 1,
                pageSize: 100,
            },
            {
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'okhttp/4.9.3',
                    'Client-Id': session.clientId,
                    'Client-Type': '1',
                },
                timeout: 10000,
            },
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

    private async fetchMqttCredentias(session: AuthSession): Promise<MqttConnection> {
        const response = await axios.post<MammotionApiResponse<MqttConnection>>(
            `${session.iotDomain}/v1/mqtt/auth/jwt`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'okhttp/4.9.3',
                },
                timeout: 10000,
            },
        );

        if (response.data.code !== 0 || !response.data.data) {
            throw new Error(response.data.msg || `HTTP ${response.status}`);
        }
        return response.data.data;
    }

    private async syncDevices(devices: MammotionDevice[], records: DeviceRecord[]): Promise<void> {
        this.deviceContexts.clear();
        this.mqttTopicMap.clear();
        this.subscribedDeviceTopics.clear();
        this.lastRequestedHashSetByDevice.clear();
        this.pendingAreaNamesByDevice.clear();
        this.classifiedAreaHashesByDevice.clear();

        const devicesByIotId = new Map<string, MammotionDevice>();
        const recordsByIotId = new Map<string, DeviceRecord>();

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

        const allIotIds = new Set<string>([...devicesByIotId.keys(), ...recordsByIotId.keys()]);
        let idx = 0;
        for (const iotId of allIotIds) {
            idx += 1;
            const device = devicesByIotId.get(iotId);
            const record = recordsByIotId.get(iotId);
            const rawKey = iotId || device?.deviceId || `device_${idx}`;
            const key = this.sanitizeObjectId(rawKey);
            const channelId = `devices.${key}`;
            const deviceName = device?.deviceName || record?.deviceName || iotId;

            const context: DeviceContext = {
                key,
                iotId,
                deviceId: device?.deviceId || '',
                deviceName: deviceName || '',
                productKey: record?.productKey || '',
                recordDeviceName: record?.deviceName || '',
                status: device?.status,
                deviceType: this.pickNumber(device?.deviceType),
                series: device?.series || '',
                productSeries: device?.productSeries || '',
            };
            this.deviceContexts.set(key, context);

            if (context.productKey && context.recordDeviceName) {
                this.mqttTopicMap.set(`${context.productKey}/${context.recordDeviceName}`, key);
            }

            await this.extendObjectAsync(channelId, {
                type: 'channel',
                common: {
                    name: deviceName || rawKey,
                },
                native: {
                    iotId: context.iotId,
                    deviceId: context.deviceId,
                    productKey: context.productKey,
                    deviceName: context.recordDeviceName,
                },
            });

            await this.ensureDeviceStateObjects(channelId);
            await this.setStateChangedAsync(`${channelId}.name`, context.deviceName, true);
            await this.setStateChangedAsync(`${channelId}.iotId`, context.iotId, true);
            await this.setStateChangedAsync(`${channelId}.deviceId`, context.deviceId, true);
            await this.setStateChangedAsync(`${channelId}.deviceType`, device?.deviceType || '', true);
            await this.setStateChangedAsync(
                `${channelId}.deviceTypeText`,
                this.resolveDeviceTypeName(device?.deviceType, context.deviceName, device?.productSeries),
                true,
            );
            await this.setStateChangedAsync(`${channelId}.series`, device?.series || '', true);
            await this.setStateChangedAsync(`${channelId}.productSeries`, device?.productSeries || '', true);
            await this.setStateChangedAsync(`${channelId}.status`, context.status ?? -1, true);
            await this.setStateChangedAsync(`${channelId}.productKey`, context.productKey, true);
            await this.setStateChangedAsync(
                `${channelId}.productKeyGroup`,
                resolveProductKeyGroup(context.productKey) || 'UNKNOWN',
                true,
            );
            await this.setStateChangedAsync(`${channelId}.recordDeviceName`, context.recordDeviceName, true);
            await this.setStateChangedAsync(`${channelId}.raw`, JSON.stringify({ device, record }), true);
            await this.setStateChangedAsync(`${channelId}.telemetry.connected`, (context.status ?? 0) === 1, true);
            await this.applyDeviceCommandLimits(channelId, context);
            const location = device?.locationVo?.location;
            if (Array.isArray(location) && location.length >= 2) {
                await this.setStateChangedAsync(`${channelId}.telemetry.longitude`, Number(location[0]) || 0, true);
                await this.setStateChangedAsync(`${channelId}.telemetry.latitude`, Number(location[1]) || 0, true);
            }
        }
    }

    private async connectMqtt(mqttAuth: MqttConnection, records: DeviceRecord[]): Promise<void> {
        if (this.mqttClient) {
            this.mqttClient.removeAllListeners();
            this.mqttClient.on('error', () => {}); // prevent uncaught connack timeout after teardown
            this.mqttClient.end(true);
            this.setJwtMqttConnected(false);
        }

        const brokerUrl = mqttAuth.host.includes('://') ? mqttAuth.host : `mqtts://${mqttAuth.host}`;
        const client = mqtt.connect(brokerUrl, {
            clientId: mqttAuth.clientId,
            username: mqttAuth.username,
            password: mqttAuth.jwt,
            reconnectPeriod: 5000,
            connectTimeout: 15000,
            protocolVersion: 4,
            clean: true,
        });
        this.mqttClient = client;

        client.on('connect', () => {
            this.log.info('MQTT connected.');
            this.setJwtMqttConnected(true);
            this.setCloudConnected(true);
            this.authFailureSince = 0;

            const topics = new Set<string>();
            for (const record of records) {
                if (record.productKey && record.deviceName) {
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/status`);
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/thing/event/+/post`);
                    topics.add(`/sys/proto/${record.productKey}/${record.deviceName}/thing/event/+/post`);
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/properties`);
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/events`);
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/model/down_raw`);
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/_thing/event/notify`);
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/app/down/thing/event/property/post_reply`);
                    topics.add(`/sys/${record.productKey}/${record.deviceName}/thing/event/property/post`);
                }
            }

            const isDeviceTopic = (t: string): boolean =>
                t.includes('/thing/event/') || t.includes('/thing/event/+/');
            for (const topic of topics) {
                client.subscribe(topic, (err: Error | null) => {
                    if (err) {
                        this.log.warn(`MQTT subscribe failed (${topic}): ${err.message}`);
                    } else if (isDeviceTopic(topic)) {
                        this.log.debug(`[MQTT] Physical device topic reachable: ${topic}`);
                    }
                });
            }

            // Area-name responses are async over MQTT. If previous requests happened while
            // MQTT was down/flapping, retry only for devices without known areas.
            void this.requestAreaNamesForMissingDevices().catch(err => {
                this.log.debug(`Area-name re-request after JWT MQTT connect failed: ${this.extractAxiosError(err)}`);
            });
        });

        client.on('message', (topic: string, payload: Buffer) => {
            void this.handleMqttMessage(topic, payload);
        });

        client.on('error', (err: Error) => {
            try {
                this.log.warn(`MQTT error: ${err.message}`);
                void this.setStateChangedAsync('info.lastError', `MQTT: ${err.message}`, true);
                void this.ensureAliyunMqttRunning('jwt-error');
            } catch {
                // adapter may be shutting down
            }
        });

        client.on('close', () => {
            try {
                this.setJwtMqttConnected(false);
                this.log.debug('JWT MQTT connection closed');
                void this.ensureAliyunMqttRunning('jwt-close');
            } catch {
                // adapter may be shutting down
            }
        });

        client.on('offline', () => {
            try {
                this.setJwtMqttConnected(false);
                this.log.debug('JWT MQTT offline');
                void this.ensureAliyunMqttRunning('jwt-offline');
            } catch {
                // adapter may be shutting down
            }
        });
    }

    private async handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
        const topicParts = topic.split('/');
        this.log.debug(`[MQTT] topic=${topic} payloadLen=${payload.length}`);
        if (topicParts.length < 5) {
            return;
        }

        // /sys/proto/{pk}/{dn}/... topics carry binary protobuf (not JSON-wrapped)
        const isProtoTopic = topicParts[1] === 'sys' && topicParts[2] === 'proto';
        const productKey = isProtoTopic ? topicParts[3] : topicParts[2];
        const recordDeviceName = isProtoTopic ? topicParts[4] : topicParts[3];
        // down_raw topics aso carry raw binary protobuf
        const isRawProto = isProtoTopic || topic.includes('/down_raw');

        const payloadText = payload.toString('utf8');
        this.log.debug(`[MQTT] payload (first 2000): ${payloadText.substring(0, 2000)}`);
        const payloadData = this.safeJsonParse<Record<string, any>>(payloadText);
        if (payloadData && typeof payloadData.params === 'string') {
            const parsedParams = this.safeJsonParse<Record<string, any>>(payloadData.params);
            if (parsedParams) {
                payloadData.params = parsedParams;
            }
        }
        if (payloadData && typeof payloadData.data === 'string') {
            const parsedData = this.safeJsonParse<Record<string, any>>(payloadData.data);
            if (parsedData) {
                payloadData.data = parsedData;
            }
        }
        const payloadIotId =
            (typeof payloadData?.params?.iotId === 'string' && payloadData.params.iotId) ||
            (typeof payloadData?.params?.iot_id === 'string' && payloadData.params.iot_id) ||
            (typeof payloadData?.data?.iotId === 'string' && payloadData.data.iotId) ||
            (typeof payloadData?.data?.iot_id === 'string' && payloadData.data.iot_id) ||
            (typeof payloadData?.iot_id === 'string' && payloadData.iot_id) ||
            '';

        const deviceKey = this.resolveDeviceKey(productKey, recordDeviceName, payloadIotId);
        if (!deviceKey) {
            this.log.debug(`[MQTT] No deviceKey for pk=${productKey} dn=${recordDeviceName} iotId=${payloadIotId}`);
            return;
        }

        const ctx = this.deviceContexts.get(deviceKey);
        // Only update topic-map with real device productKey/deviceName (not AEP/proto credentias)
        if (ctx && !ctx.productKey && productKey && recordDeviceName && !isProtoTopic) {
            ctx.productKey = productKey;
            ctx.recordDeviceName = recordDeviceName;
            this.mqttTopicMap.set(`${productKey}/${recordDeviceName}`, deviceKey);
            await this.setStateChangedAsync(`devices.${deviceKey}.productKey`, productKey, true);
            await this.setStateChangedAsync(
                `devices.${deviceKey}.productKeyGroup`,
                resolveProductKeyGroup(productKey) || 'UNKNOWN',
                true,
            );
            await this.setStateChangedAsync(`devices.${deviceKey}.recordDeviceName`, recordDeviceName, true);
        }
        if (ctx && payloadIotId && payloadIotId !== ctx.iotId) {
            ctx.iotId = payloadIotId;
            await this.setStateChangedAsync(`devices.${deviceKey}.iotId`, payloadIotId, true);
        }

        const channelId = `devices.${deviceKey}`;
        const now = Date.now();
        this.lastRealtimeMqttMessageAt = now;

        await this.setStateChangedAsync('info.lastMessageTs', now, true);
        await this.setStateChangedAsync(`${channelId}.telemetry.lastTopic`, topic, true);
        await this.setStateChangedAsync(`${channelId}.telemetry.lastUpdate`, now, true);
        if (this.shouldStoreDebugPayloads()) {
            await this.setStateChangedAsync(`${channelId}.telemetry.lastPayload`, payloadText, true);
        }

        // Handle raw binary protobuf topics (down_raw, /sys/proto/...)
        if (isRawProto && !payloadData) {
            const rawBase64 = payload.toString('base64');
            this.log.debug(`[MQTT] Raw-Proto-Payload (len=${payload.length}), trying LubaMsg decode`);
            if (this.shouldStoreDebugPayloads()) {
                await this.setStateChangedAsync(`${channelId}.telemetry.lastProtoContent`, rawBase64, true);
            }
            this.resolveCommDataAck(deviceKey, rawBase64);
            void this.parseMctlSysProto(deviceKey, rawBase64);
            const areas = this.tryParseAreaHashNames(rawBase64);
            if (areas && areas.length > 0) {
                this.rememberAreaNames(deviceKey, areas);
                this.log.debug(`[MQTT] Zone names received (raw): ${areas.length} entries cached`);
            }
            const hashIds = this.tryParseNavGetHashListAck(rawBase64, deviceKey);
            if (hashIds && hashIds.length > 0 && ctx) {
                this.log.debug(`[MQTT] NavGetHashListAck (raw): ${hashIds.length} Hashes, requesting names`);
                await this.requestAreaNamesForHashes(ctx, hashIds);
            } else if (!areas || areas.length === 0) {
                this.log.debug(`[MQTT] Raw proto: no zone names / no HashListAck`);
            }
            return;
        }

        if (!payloadData) {
            return;
        }
        const data = payloadData;

        const params = data.params;
        if (params?.identifier) {
            await this.setStateChangedAsync(`${channelId}.telemetry.lastEventId`, `${params.identifier}`, true);
        }

        // When a message arrives on AEP topics, the payload may contain the mower's real productKey/deviceName.
        // Subscribe to the mower's own topics so we can receive its zone-name responses.
        const payloadPk = typeof params?.productKey === 'string' ? params.productKey : '';
        const payloadDn = typeof params?.deviceName === 'string' ? params.deviceName : '';
        if (payloadPk && payloadDn && payloadPk !== productKey) {
            const deviceTopicKey = `${payloadPk}/${payloadDn}`;
            if (!this.subscribedDeviceTopics.has(deviceTopicKey)) {
                this.subscribedDeviceTopics.add(deviceTopicKey);
                const mqttClient = this.aliyunMqttClient || this.mqttClient;
                if (mqttClient?.connected) {
                    const deviceTopics = [
                        `/sys/${payloadPk}/${payloadDn}/thing/event/+/post`,
                        `/sys/proto/${payloadPk}/${payloadDn}/thing/event/+/post`,
                        `/sys/${payloadPk}/${payloadDn}/app/down/thing/model/down_raw`,
                        `/sys/${payloadPk}/${payloadDn}/app/down/_thing/event/notify`,
                        `/sys/${payloadPk}/${payloadDn}/app/down/thing/event/property/post_reply`,
                    ];
                    for (const dt of deviceTopics) {
                        mqttClient.subscribe(dt, { qos: 1 }, (err: Error | null) => {
                            if (err) {
                                this.log.debug(`[MQTT] Device topic subscribe failed (${dt}): ${err.message}`);
                            } else {
                                this.log.info(`[MQTT] Device-Topic subscribed: ${dt}`);
                            }
                        });
                    }
                }
            }
        }
        const statusValue = this.pickNumber(
            params?.status?.value,
            params?.items?.iotState?.value,
            params?.iotState,
            data.iotState?.value,
            data.iotState,
        );
        if (statusValue !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.connected`, statusValue === 1, true);
        }

        const batteryValue = this.pickNumber(
            params?.items?.batteryPercentage?.value,
            params?.batteryPercentage?.value,
            params?.batteryPercentage,
            data.batteryPercentage?.value,
            data.batteryPercentage,
        );
        if (batteryValue !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.batteryPercent`, batteryValue, true);
        }

        const knifeHeightValue = this.pickNumber(
            params?.items?.knifeHeight?.value,
            params?.knifeHeight?.value,
            params?.knifeHeight,
            data.knifeHeight?.value,
            data.knifeHeight,
        );
        if (knifeHeightValue !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.bladeHeightMm`, knifeHeightValue, true);
        }

        const deviceStateValue = this.pickNumber(
            params?.items?.deviceState?.value,
            params?.deviceState?.value,
            params?.deviceState,
            data.deviceState?.value,
            data.deviceState,
        );
        if (deviceStateValue !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.deviceState`, deviceStateValue, true);
            this.triggerStartSettingsEnforceIfDeviceActive(deviceKey, deviceStateValue);
        }

        const coordinateValue =
            params?.items?.coordinate?.value ??
            params?.coordinate?.value ??
            params?.coordinate ??
            data.coordinate?.value ??
            data.coordinate;
        if (coordinateValue) {
            const coordinate =
                typeof coordinateValue === 'string'
                    ? this.safeJsonParse<Record<string, any>>(coordinateValue)
                    : coordinateValue;
            if (coordinate && typeof coordinate === 'object') {
                const lat = this.pickNumber((coordinate as Record<string, any>).lat, (coordinate as Record<string, any>).latitude);
                const lon = this.pickNumber((coordinate as Record<string, any>).lon, (coordinate as Record<string, any>).lng);
                const normalized = this.normalizeCoordinate(lat, lon);
                if (normalized.lat !== null) {
                    await this.setStateChangedAsync(`${channelId}.telemetry.latitude`, normalized.lat, true);
                }
                if (normalized.lon !== null) {
                    await this.setStateChangedAsync(`${channelId}.telemetry.longitude`, normalized.lon, true);
                }
            }
        }

        const fwVersionMqtt =
            params?.items?.deviceVersion?.value ?? params?.deviceVersion?.value ?? params?.deviceVersion ??
            data.deviceVersion?.value ?? data.deviceVersion;
        if (typeof fwVersionMqtt === 'string' && fwVersionMqtt) {
            await this.setStateChangedAsync(`${channelId}.telemetry.firmwareVersion`, fwVersionMqtt, true);
        }

        const networkInfoRawMqtt =
            params?.items?.networkInfo?.value ?? params?.networkInfo?.value ?? params?.networkInfo ??
            data.networkInfo?.value ?? data.networkInfo;
        const networkInfoMqtt =
            typeof networkInfoRawMqtt === 'string'
                ? this.safeJsonParse<Record<string, any>>(networkInfoRawMqtt)
                : networkInfoRawMqtt;
        if (networkInfoMqtt && typeof networkInfoMqtt === 'object') {
            const wifiRssi = this.pickNumber((networkInfoMqtt as Record<string, any>).wifi_rssi);
            if (wifiRssi !== null) await this.setStateChangedAsync(`${channelId}.telemetry.wifiRssi`, wifiRssi, true);
            const wtSec = this.pickNumber((networkInfoMqtt as Record<string, any>).wt_sec);
            if (wtSec !== null) await this.setStateChangedAsync(`${channelId}.telemetry.totalWorkTimeSec`, wtSec, true);
            const mileage = this.pickNumber((networkInfoMqtt as Record<string, any>).mileage);
            if (mileage !== null) await this.setStateChangedAsync(`${channelId}.telemetry.totalMileageM`, mileage, true);
        }

        const deviceOtherInfoRawMqtt =
            params?.items?.deviceOtherInfo?.value ?? params?.deviceOtherInfo?.value ?? params?.deviceOtherInfo ??
            data.deviceOtherInfo?.value ?? data.deviceOtherInfo;
        const deviceOtherInfoMqtt =
            typeof deviceOtherInfoRawMqtt === 'string'
                ? this.safeJsonParse<Record<string, any>>(deviceOtherInfoRawMqtt)
                : deviceOtherInfoRawMqtt;
        if (deviceOtherInfoMqtt && typeof deviceOtherInfoMqtt === 'object') {
            const taskArea = this.pickNumber((deviceOtherInfoMqtt as Record<string, any>).task_area);
            if (taskArea !== null) await this.setStateChangedAsync(`${channelId}.telemetry.taskAreaM2`, taskArea, true);
        }

        // Extract proto content from various known JSON paths
        const protoContent =
            params?.value?.content ??
            data?.value?.content ??
            params?.content ??
            data?.content ??
            params?.items?.content?.value ??
            params?.items?.content ??
            data?.items?.content?.value ??
            data?.items?.content;
        this.log.debug(`[MQTT] params top-level keys: ${Object.keys(params ?? {}).join(',')}`);
        if (typeof protoContent === 'string') {
            this.log.debug(`[MQTT] protoContent found (len=${protoContent.length})`);
            if (this.shouldStoreDebugPayloads()) {
                await this.setStateChangedAsync(`${channelId}.telemetry.lastProtoContent`, protoContent, true);
            }
            // Check for async field-33 (NavGetCommDataAck) responses first
            this.resolveCommDataAck(deviceKey, protoContent);
            void this.parseMctlSysProto(deviceKey, protoContent);

            const areas = this.tryParseAreaHashNames(protoContent);
            if (areas && areas.length > 0) {
                this.rememberAreaNames(deviceKey, areas);
                this.log.debug(`[MQTT] Zone names received: ${areas.length} entries cached`);
            }
            const hashIds = this.tryParseNavGetHashListAck(protoContent, deviceKey);
            if (hashIds && hashIds.length > 0 && ctx) {
                this.log.debug(`[MQTT] NavGetHashListAck: ${hashIds.length} Hashes, requesting names`);
                await this.requestAreaNamesForHashes(ctx, hashIds);
            } else if (!areas || areas.length === 0) {
                this.log.debug(`[MQTT] protoContent contains no zone names / no HashListAck`);
            }
        } else {
            this.log.debug(`[MQTT] No protoContent found. params.value=${(JSON.stringify(params?.value) ?? '(none)').substring(0, 200)}`);
        }
    }

    private async invokeTaskControlCommandModern(session: AuthSession, context: DeviceContext, content: string): Promise<string> {
        const invoke = async (deviceName: string, productKey: string): Promise<MammotionApiResponse<{ result?: string }>> => {
            const response = await axios.post<MammotionApiResponse<{ result?: string }>>(
                `${session.iotDomain}/v1/mqtt/rpc/thing/service/invoke`,
                {
                    args: { content },
                    deviceName,
                    identifier: 'device_protobuf_sync_service',
                    iotId: context.iotId,
                    productKey,
                },
                {
                    headers: {
                        Authorization: `Bearer ${session.accessToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'okhttp/4.9.3',
                        'Client-Id': session.clientId,
                        'Client-Type': '1',
                    },
                    timeout: 10000,
                },
            );
            return response.data;
        };

        let response = await invoke(context.recordDeviceName || context.deviceName || '', context.productKey || '');
        if (response.code === 50101) {
            response = await invoke('', '');
        }

        if (response.code !== 0) {
            throw new Error(response.msg || 'Command invoke failed');
        }
        this.log.debug(`[MODERN-INVOKE] result len=${response.data?.result?.length ?? 0}`);
        return response.data?.result || 'ok';
    }

    private async invokeTaskControlCommandWithFallback(
        session: AuthSession,
        context: DeviceContext,
        content: string,
    ): Promise<string> {
        try {
            return await this.invokeTaskControlCommandModern(session, context, content);
        } catch (err) {
            const msg = this.extractAxiosError(err).toLowerCase();
            // Fall through to legacy for "Invalid device" (Luba1/legacy devices) and
            // "Access to this resource requires authentication" (shared-account devices).
            // Legacy uses iotToken which is independent of the modern Bearer JWT.
            if (!msg.includes('invalid device') && !msg.includes('access to this resource')) {
                throw err;
            }
        }

        this.log.warn(`Modern command path returned Invalid device for ${context.deviceName || context.iotId}, trying Aliyun fallback.`);
        return this.invokeTaskControlCommandLegacy(session, context, content);
    }

    private async executeTaskControlCommand(context: DeviceContext, command: DeviceCommand): Promise<string> {
        const session = await this.ensureValidSession(!this.cloudConnected);
        const content = this.buildTaskControlContent(session, context, command);
        try {
            return await this.invokeTaskControlCommandWithFallback(session, context, content);
        } catch (err) {
            const msg = this.extractAxiosError(err);
            if (!this.isRetryableCommandError(msg, err)) {
                throw err;
            }

            this.log.warn(`Command ${command} first attempt failed (${msg}), new login + retry.`);
            await this.hydrateContextFromTelemetry(context.key);
            await this.refreshSessionAndDeviceCache();
            const refreshedContext = this.deviceContexts.get(context.key) || context;
            const retrySession = await this.ensureValidSession(true);
            const retryContent = this.buildTaskControlContent(retrySession, refreshedContext, command);
            return this.invokeTaskControlCommandWithFallback(retrySession, refreshedContext, retryContent);
        }
    }

    private async executeTaskSettingsCommand(context: DeviceContext, cutHeightMm: number, mowSpeedMs: number): Promise<string> {
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

            this.log.warn(`Task settings first attempt failed (${msg}), new login + retry.`);
            await this.hydrateContextFromTelemetry(context.key);
            await this.refreshSessionAndDeviceCache();
            const refreshedContext = this.deviceContexts.get(context.key) || context;
            const retrySession = await this.ensureValidSession(true);
            try {
                const retryBladeContent = this.buildSetBladeHeightContent(retrySession, cutHeightMm);
                const retryBladeResult = await this.invokeTaskControlCommandWithFallback(
                    retrySession,
                    refreshedContext,
                    retryBladeContent,
                );
                const retrySpeedContent = this.buildSetMowSpeedContent(retrySession, mowSpeedMs);
                const retrySpeedResult = await this.invokeTaskControlCommandWithFallback(
                    retrySession,
                    refreshedContext,
                    retrySpeedContent,
                );
                return `blade:${retryBladeResult};speed:${retrySpeedResult}`;
            } catch (_retryErr) {
                const fallbackContent = this.buildTaskSettingsContent(retrySession, cutHeightMm, mowSpeedMs);
                return this.invokeTaskControlCommandWithFallback(retrySession, refreshedContext, fallbackContent);
            }
        }
    }

    private async executeEncodedContentCommand(
        context: DeviceContext,
        commandLabel: string,
        buildContent: (session: AuthSession, context: DeviceContext) => string,
    ): Promise<string> {
        const session = await this.ensureValidSession(!this.cloudConnected);
        const content = buildContent(session, context);
        try {
            return await this.invokeTaskControlCommandWithFallback(session, context, content);
        } catch (err) {
            const msg = this.extractAxiosError(err);
            if (!this.isRetryableCommandError(msg, err)) {
                throw err;
            }

            this.log.warn(`Command ${commandLabel} first attempt failed (${msg}), new login + retry.`);
            await this.hydrateContextFromTelemetry(context.key);
            await this.refreshSessionAndDeviceCache();
            const refreshedContext = this.deviceContexts.get(context.key) || context;
            const retrySession = await this.ensureValidSession(true);
            const retryContent = buildContent(retrySession, refreshedContext);
            return this.invokeTaskControlCommandWithFallback(retrySession, refreshedContext, retryContent);
        }
    }

    private async refreshSessionAndDeviceCache(): Promise<void> {
        const session = await this.ensureValidSession(true);

        // Modern APIs may not return shared devices (owned: 0) – make resilient
        let devices: MammotionDevice[] = [];
        try {
            devices = await this.fetchDeviceList(session);
        } catch (err) {
            this.log.debug(`Modern device list unavailable: ${this.extractAxiosError(err)}`);
        }

        let modernRecords: DeviceRecord[] = [];
        try {
            modernRecords = await this.fetchDeviceRecords(session);
        } catch (err) {
            this.log.debug(`Modern device records unavailable: ${this.extractAxiosError(err)}`);
        }

        // Legacy bindings always fetched – shared devices (owned: 0) only appear here
        const legacyRecords = await this.fetchLegacyDeviceRecords(session);

        // Merge: modern records first, add legacy entries not already covered
        const modernIotIds = new Set(modernRecords.map(r => r.iotId).filter(Boolean));
        const records = [
            ...modernRecords,
            ...legacyRecords.filter(r => r.iotId && !modernIotIds.has(r.iotId)),
        ];

        if (!records.length) {
            this.log.warn('No devices found (neither modern nor legacy). Is a shared device configured?');
        }

        await this.syncDevices(devices, records);
        await this.setStateChangedAsync('info.deviceCount', this.deviceContexts.size, true);

        // Try JWT MQTT for ALL records (modern or legacy/shared).
        // With owner credentias this grants ACL to physical device topics (thing/event/+/post)
        // which carries both proactive telemetry AND command responses like NavGetCommDataAck.
        if (records.length && (!this.mqttClient || !this.mqttClient.connected)) {
            try {
                const mqttAuth = await this.fetchMqttCredentias(session);
                await this.connectMqtt(mqttAuth, records);
            } catch (err) {
                this.log.debug(`JWT MQTT credentias unavailable (${this.extractAxiosError(err)}), AEP fallback remains active.`);
                if (this.mqttClient) {
                    this.mqttClient.removeAllListeners();
                    this.mqttClient.end(true);
                    this.mqttClient = null;
                }
                this.setJwtMqttConnected(false);
            }
        }
        if (!records.length) {
            if (this.mqttClient) {
                this.mqttClient.removeAllListeners();
                this.mqttClient.end(true);
                this.mqttClient = null;
            }
            this.setJwtMqttConnected(false);
        }

        if (this.deviceContexts.size) {
            this.startLegacyPolling();
        } else {
            this.stopLegacyPolling();
        }
    }

    private isRetryableCommandError(msg: string, err: unknown): boolean {
        return this.isAuthError(err, msg) || msg.toLowerCase().includes('invalid device');
    }

    private isAuthError(err: unknown, msg: string): boolean {
        if (axios.isAxiosError(err)) {
            const status = err.response?.status;
            if (status === 401 || status === 403) {
                return true;
            }
        }

        const lower = msg.toLowerCase();
        return (
            lower.includes('token') ||
            lower.includes('unauthorized') ||
            lower.includes('authentication') ||
            lower.includes('not login') ||
            lower.includes('access denied') ||
            lower.includes('forbidden') ||
            lower.includes('auth error') ||
            lower.includes('request auth error') ||
            lower.includes('invalid session') ||
            lower.includes('identityid is blank') ||
            lower.includes('identity id is blank')
        );
    }

    private isLegacySessionRetryError(messageLower: string): boolean {
        return (
            messageLower.includes('token') ||
            messageLower.includes('session') ||
            messageLower.includes('460') ||
            messageLower.includes('identityid is blank') ||
            messageLower.includes('identity id is blank') ||
            messageLower.includes('auth error') ||
            messageLower.includes('request auth error') ||
            messageLower.includes('unauthorized')
        );
    }

    private markAuthFailure(msg: string): void {
        this.cloudConnected = false;
        if (!this.authFailureSince) {
            this.authFailureSince = Date.now();
        }
        this.syncConnectionStates();
        void this.setStateChangedAsync('info.lastError', msg, true);
    }

    private startReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
        }
        this.reconnectTimer = setInterval(() => {
            void this.reconnectIfAllowed();
        }, 60_000);
    }

    private async reconnectIfAllowed(): Promise<void> {
        // Watchdog: polling appears stalled (>10min without poll) -> force reconnect
        const pollWatchdogMs = 10 * 60 * 1000;
        if (
            this.legacyPollingEnabled &&
            this.cloudConnected &&
            this.legacyLastPollAt > 0 &&
            !this.legacyPollInFlight &&
            !this.legacyPollTimer &&
            Date.now() - this.legacyLastPollAt > pollWatchdogMs
        ) {
            this.log.warn('Polling watchdog: no poll for >10 minutes - restarting polling.');
            this.scheduleLegacyPolling(0);
            return;
        }

        if (this.cloudConnected || !this.authFailureSince) {
            return;
        }

        const cooldownMs = 15 * 60 * 1000;
        if (Date.now() - this.authFailureSince < cooldownMs) {
            return;
        }

        try {
            this.log.info('Auth cooldown elapsed, attempting reconnect.');
            await this.refreshSessionAndDeviceCache();
            await this.requestIotSyncForAllDevices();
            this.setCloudConnected(true);
            this.authFailureSince = 0;
        } catch (err) {
            const msg = this.extractAxiosError(err);
            this.log.warn(`Automatic reconnect failed: ${msg}`);
            this.markAuthFailure(msg);
        }
    }

    private async fetchLegacyDeviceRecords(session: AuthSession): Promise<DeviceRecord[]> {
        try {
            const legacy = await this.ensureLegacySession(session);
            const bindings = await this.fetchLegacyBindings(legacy);
            return bindings
                .filter(binding => typeof binding.iotId === 'string' && typeof binding.deviceName === 'string')
                .map(binding => ({
                    iotId: binding.iotId || '',
                    productKey: binding.productKey || '',
                    deviceName: binding.deviceName || '',
                    identityId: binding.identityId || '',
                    status: this.pickNumber(binding.status) ?? undefined,
                    owned: this.pickNumber(binding.owned) ?? undefined,
                }));
        } catch (err) {
            this.log.warn(`Legacy bindings could not be loaded: ${this.extractAxiosError(err)}`);
            return [];
        }
    }

    private async invokeTaskControlCommandLegacy(session: AuthSession, context: DeviceContext, content: string): Promise<string> {
        const invoke = async (forceSessionRefresh: boolean): Promise<LegacyInvokeData | null> => {
            const legacy = await this.ensureLegacySession(session, forceSessionRefresh);
            const response = await this.callLegacyApi<LegacyInvokeData>(
                legacy.apiGatewayEndpoint,
                '/thing/service/invoke',
                '1.0.5',
                {
                    args: { content },
                    identifier: 'device_protobuf_sync_service',
                    iotId: context.iotId,
                },
                legacy.iotToken,
            );
            if (response.code !== 200) {
                throw new Error(this.extractLegacyApiMessage(response, 'Legacy invoke failed'));
            }
            return response.data || null;
        };

        try {
            const result = await invoke(false);
            this.setCloudConnected(true);
            this.authFailureSince = 0;
            // Log the full response for debugging — zone data may come back synchronously
            this.log.debug(`[LEGACY-INVOKE] response: messageId=${result?.messageId} data=${JSON.stringify(result?.data ?? null).substring(0,300)} output.content len=${result?.output?.content?.length ?? 0} content len=${result?.content?.length ?? 0}`);
            // Prefer proto content from output.content or content (synchronous response)
            const syncContent = result?.output?.content || result?.content || result?.messageId || 'ok';
            return syncContent;
        } catch (err) {
            const msg = this.extractAxiosError(err).toLowerCase();
            if (
                !msg.includes('token') &&
                !msg.includes('session') &&
                !msg.includes('460') &&
                !msg.includes('identityid is blank') &&
                !msg.includes('identity id is blank')
            ) {
                throw err;
            }
        }

        const retry = await invoke(true);
        this.setCloudConnected(true);
        this.authFailureSince = 0;
        return retry?.output?.content || retry?.content || retry?.messageId || 'ok';
    }

    private async ensureLegacySession(session: AuthSession, force = false): Promise<LegacySession> {
        const validUntil =
            this.legacySession && this.legacySession.issuedAt + this.legacySession.iotTokenExpire * 1000 - 300_000;
        if (!force && this.legacySession && validUntil && validUntil > Date.now()) {
            return this.legacySession;
        }

        this.legacySession = await this.createLegacySession(session);
        return this.legacySession;
    }

    private async createLegacySession(session: AuthSession): Promise<LegacySession> {
        if (!session.authorizationCode) {
            throw new Error('Legacy login not possible: authorization_code missing');
        }

        const countryCode = session.countryCode || this.extractAreaCodeFromToken(session.accessToken) || 'DE';
        const regionResponse = await this.callLegacyApi<LegacyRegionData>(
            LEGACY_ALIYUN_DOMAIN,
            '/living/account/region/get',
            '1.0.2',
            {
                authCode: session.authorizationCode,
                type: 'THIRD_AUTHCODE',
                countryCode,
            },
        );
        if (regionResponse.code !== 200 || !regionResponse.data?.apiGatewayEndpoint || !regionResponse.data?.oaApiGatewayEndpoint) {
            throw new Error(this.extractLegacyApiMessage(regionResponse, 'Legacy region lookup failed'));
        }

        const connect = await this.callLegacyOpenAccountConnect();
        const loginByOauth = await this.callLegacyLoginByOauth(
            regionResponse.data.oaApiGatewayEndpoint,
            session.authorizationCode,
            countryCode,
            connect.vid,
            connect.deviceId,
            connect.utdid,
        );
        const sid = loginByOauth?.data?.data?.loginSuccessResult?.sid;
        if (!sid) {
            throw new Error('Legacy login failed: sid missing');
        }

        const sessionResponse = await this.callLegacyApi<LegacySessionData>(
            regionResponse.data.apiGatewayEndpoint,
            '/account/createSessionByAuthCode',
            '1.0.4',
            {
                request: {
                    authCode: sid,
                    accountType: 'OA_SESSION',
                    appKey: LEGACY_APP_KEY,
                },
            },
        );
        if (sessionResponse.code !== 200 || !sessionResponse.data?.iotToken) {
            throw new Error(this.extractLegacyApiMessage(sessionResponse, 'Legacy session could not be created'));
        }

        const apiGatewayEndpoint = regionResponse.data.apiGatewayEndpoint || '';
        const regionId =
            regionResponse.data.regionId ||
            (apiGatewayEndpoint ? apiGatewayEndpoint.split('.')[0] : '') ||
            'cn-shanghai';

        return {
            apiGatewayEndpoint,
            oaApiGatewayEndpoint: regionResponse.data.oaApiGatewayEndpoint || '',
            iotToken: sessionResponse.data.iotToken,
            iotTokenExpire: Number(sessionResponse.data.iotTokenExpire) || 3600,
            refreshToken: sessionResponse.data.refreshToken || '',
            refreshTokenExpire: Number(sessionResponse.data.refreshTokenExpire) || 0,
            identityId: sessionResponse.data.identityId || '',
            issuedAt: Date.now(),
            regionId,
        };
    }

    private async fetchLegacyBindings(session: LegacySession): Promise<LegacyBinding[]> {
        const response = await this.callLegacyApi<LegacyBindingListData>(
            session.apiGatewayEndpoint,
            '/uc/listBindingByAccount',
            '1.0.8',
            {
                pageSize: 100,
                pageNo: 1,
            },
            session.iotToken,
        );

        if (response.code !== 200) {
            throw new Error(this.extractLegacyApiMessage(response, 'Legacy device list failed'));
        }
        return Array.isArray(response.data?.data) ? response.data.data : [];
    }

    private stopLegacyPolling(): void {
        this.legacyPollingEnabled = false;
        if (this.legacyPollTimer) {
            clearTimeout(this.legacyPollTimer);
            this.legacyPollTimer = null;
        }
        this.legacyPollInFlight = false;
        this.legacyHasActiveDevice = false;
        this.legacyFastPollUntil = 0;
        this.lastRealtimeMqttMessageAt = 0;
    }

    private startLegacyPolling(): void {
        this.legacyPollingEnabled = true;
        void this.ensureAliyunMqttRunning('start-polling');

        this.scheduleLegacyPolling(0);
    }

    private async ensureAliyunMqttRunning(reason: string): Promise<void> {
        const now = Date.now();
        if (this.aliyunMqttClient?.connected) {
            return;
        }
        if (this.aliyunEnsureInFlight) {
            return;
        }
        if (now - this.lastAliyunEnsureAt < 15_000) {
            return;
        }

        this.aliyunEnsureInFlight = true;
        this.lastAliyunEnsureAt = now;
        try {
            const activeSession = await this.ensureValidSession(!this.cloudConnected);
            const legacy = await this.ensureLegacySession(activeSession, false);
            await this.connectAliyunMqtt(legacy);
            this.log.debug(`Aliyun MQTT ensure ok (${reason}).`);
        } catch (err) {
            const msg = this.extractAxiosError(err);
            this.log.warn(`Aliyun MQTT ensure failed (${reason}): ${msg}`);
            await this.setStateChangedAsync('info.lastError', `Aliyun MQTT ensure (${reason}): ${msg}`, true);
        } finally {
            this.aliyunEnsureInFlight = false;
        }
    }

    private scheduleLegacyPolling(delayMs: number): void {
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

    private async runLegacyPollingCycle(): Promise<void> {
        if (this.legacyPollInFlight) {
            return;
        }

        this.legacyPollInFlight = true;
        this.legacyLastPollAt = Date.now();
        try {
            this.legacyHasActiveDevice = await this.pollLegacyTelemetry();
        } catch (err) {
            this.log.warn(`Legacy polling cycle failed: ${this.extractAxiosError(err)}`);
        } finally {
            this.legacyPollInFlight = false;
            if (this.legacyPollingEnabled) {
                if (this.deviceContexts.size) {
                    this.scheduleLegacyPolling(this.getLegacyNextPollDelayMs());
                } else {
                    this.log.warn('Legacy polling: no devices in cache - forcing reconnect.');
                    this.setCloudConnected(false);
                    if (!this.authFailureSince) {
                        // Skip cooldown immediately so reconnectIfAllowed() can trigger on the next tick
                        this.authFailureSince = Date.now() - 15 * 60 * 1000 - 1;
                    }
                }
            }
        }
    }

    private getLegacyNextPollDelayMs(): number {
        const configuredInterval = Number(this.config.legacyPollIntervalSec);
        const baseSec = Number.isFinite(configuredInterval)
            ? Math.min(300, Math.max(10, Math.trunc(configuredInterval)))
            : 30;
        const activeSec = Math.min(60, Math.max(15, Math.trunc(baseSec / 2)));
        const idleSec = Math.min(300, Math.max(120, baseSec * 4));
        const boostSec = Math.max(10, Math.min(15, activeSec));
        if (Date.now() < this.legacyFastPollUntil) {
            return boostSec * 1000;
        }
        return (this.legacyHasActiveDevice ? activeSec : idleSec) * 1000;
    }

    private enableFastLegacyPollingWindow(): void {
        this.legacyFastPollUntil = Math.max(this.legacyFastPollUntil, Date.now() + LEGACY_FAST_POLL_WINDOW_MS);
    }

    private shouldUseActiveLegacyPolling(deviceState: number | null, connected: boolean | null): boolean {
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

    private asNumericStateValue(value: ioBroker.StateValue | null | undefined): number | null {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : null;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }

    private asBooleanStateValue(value: ioBroker.StateValue | null | undefined): boolean | null {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === '1' || normalized === 'true' || normalized === 'on') {
                return true;
            }
            if (normalized === '0' || normalized === 'false' || normalized === 'off') {
                return false;
            }
        }
        return null;
    }

    private async pollLegacyTelemetry(): Promise<boolean> {
        if (!this.deviceContexts.size) {
            return false;
        }
        const mqttActive = this.jwtMqttConnected || this.aliyunMqttConnected;
        if (mqttActive && this.lastRealtimeMqttMessageAt > 0 && Date.now() - this.lastRealtimeMqttMessageAt < 5 * 60_000) {
            return this.legacyHasActiveDevice;
        }

        let session: AuthSession;
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
                this.log.debug(`Legacy telemetry (properties) failed for ${ctx.deviceName || ctx.iotId}: ${msg}`);
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
                this.log.debug(`Legacy telemetry (status) failed for ${ctx.deviceName || ctx.iotId}: ${msg}`);
            }

            const [deviceState, connected] = await Promise.all([
                this.getStateAsync(`devices.${ctx.key}.telemetry.deviceState`),
                this.getStateAsync(`devices.${ctx.key}.telemetry.connected`),
            ]);
            if (this.shouldUseActiveLegacyPolling(this.asNumericStateValue(deviceState?.val), this.asBooleanStateValue(connected?.val))) {
                hasActiveDevice = true;
            }
        }

        return hasActiveDevice;
    }

    private async fetchLegacyProperties(session: AuthSession, iotId: string): Promise<Record<string, any> | null> {
        const load = async (activeSession: AuthSession, forceSessionRefresh: boolean): Promise<Record<string, any> | null> => {
            const legacy = await this.ensureLegacySession(activeSession, forceSessionRefresh);
            const response = await this.callLegacyApi<Record<string, any>>(
                legacy.apiGatewayEndpoint,
                '/thing/properties/get',
                '1.0.0',
                { iotId },
                legacy.iotToken,
            );
            if (response.code !== 200) {
                throw new Error(this.extractLegacyApiMessage(response, `Legacy properties error for ${iotId}`));
            }
            this.log.debug(`[PROPS] Property keys for ${iotId}: ${Object.keys(response.data || {}).join(', ')}`);
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

    private async fetchLegacyStatus(session: AuthSession, iotId: string): Promise<Record<string, any> | null> {
        const load = async (activeSession: AuthSession, forceSessionRefresh: boolean): Promise<Record<string, any> | null> => {
            const legacy = await this.ensureLegacySession(activeSession, forceSessionRefresh);
            const response = await this.callLegacyApi<Record<string, any>>(
                legacy.apiGatewayEndpoint,
                '/thing/status/get',
                '1.0.0',
                { iotId },
                legacy.iotToken,
            );
            if (response.code !== 200) {
                throw new Error(this.extractLegacyApiMessage(response, `Legacy status error for ${iotId}`));
            }
            if (!response.data) {
                return null;
            }
            if (typeof response.data === 'string') {
                return this.safeJsonParse<Record<string, any>>(response.data);
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

    private async applyLegacyTelemetry(channelId: string, properties: Record<string, any>): Promise<void> {
        await this.applyLegacySnapshot(channelId, properties, 'legacy-http/thing/properties/get');
    }

    private async applyLegacyStatusTelemetry(channelId: string, status: Record<string, any>): Promise<void> {
        await this.applyLegacySnapshot(channelId, status, 'legacy-http/thing/status/get');
    }

    private async applyLegacySnapshot(channelId: string, snapshot: Record<string, any>, sourceTopic: string): Promise<void> {
        const now = Date.now();
        this.setCloudConnected(true);
        this.authFailureSince = 0;
        await this.setStateChangedAsync('info.lastMessageTs', now, true);
        await this.setStateChangedAsync(`${channelId}.telemetry.lastTopic`, sourceTopic, true);
        await this.setStateChangedAsync(`${channelId}.telemetry.lastUpdate`, now, true);
        if (this.shouldStoreDebugPayloads()) {
            await this.setStateChangedAsync(`${channelId}.telemetry.lastPayload`, JSON.stringify(snapshot), true);
        }

        const data =
            snapshot.data && typeof snapshot.data === 'object'
                ? (snapshot.data as Record<string, any>)
                : snapshot;
        const items =
            data.items && typeof data.items === 'object'
                ? (data.items as Record<string, any>)
                : undefined;

        const battery = this.pickNumber(
            items?.batteryPercentage?.value,
            items?.batteryPercentage,
            data.batteryPercentage?.value,
            data.batteryPercentage,
        );
        if (battery !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.batteryPercent`, battery, true);
        }

        const knifeHeight = this.pickNumber(items?.knifeHeight?.value, items?.knifeHeight, data.knifeHeight?.value, data.knifeHeight);
        if (knifeHeight !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.bladeHeightMm`, knifeHeight, true);
        }

        const deviceState = this.pickNumber(items?.deviceState?.value, items?.deviceState, data.deviceState?.value, data.deviceState);
        if (deviceState !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.deviceState`, deviceState, true);
            this.triggerStartSettingsEnforceIfDeviceActive(channelId.replace('devices.', ''), deviceState);
        }

        const online = this.pickNumber(items?.iotState?.value, items?.iotState, data.iotState?.value, data.iotState, data.status);
        if (online !== null) {
            await this.setStateChangedAsync(`${channelId}.telemetry.connected`, online === 1, true);
        }

        const coordinateValue =
            items?.coordinate?.value ??
            items?.coordinate ??
            data.coordinate?.value ??
            data.coordinate ??
            data.location?.value ??
            data.location;
        if (coordinateValue !== undefined && coordinateValue !== null) {
            const coordinate =
                typeof coordinateValue === 'string'
                    ? this.safeJsonParse<Record<string, any>>(coordinateValue)
                    : coordinateValue;
            if (coordinate && typeof coordinate === 'object') {
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

        const fwVersion = items?.deviceVersion?.value ?? items?.deviceVersion ?? data.deviceVersion?.value ?? data.deviceVersion;
        if (typeof fwVersion === 'string' && fwVersion) {
            await this.setStateChangedAsync(`${channelId}.telemetry.firmwareVersion`, fwVersion, true);
        }

        const networkInfoRaw = items?.networkInfo?.value ?? items?.networkInfo ?? data.networkInfo?.value ?? data.networkInfo;
        const networkInfo =
            typeof networkInfoRaw === 'string'
                ? this.safeJsonParse<Record<string, any>>(networkInfoRaw)
                : networkInfoRaw;
        if (networkInfo && typeof networkInfo === 'object') {
            const wifiRssi = this.pickNumber(networkInfo.wifi_rssi);
            if (wifiRssi !== null) await this.setStateChangedAsync(`${channelId}.telemetry.wifiRssi`, wifiRssi, true);
            const wtSec = this.pickNumber(networkInfo.wt_sec);
            if (wtSec !== null) await this.setStateChangedAsync(`${channelId}.telemetry.totalWorkTimeSec`, wtSec, true);
            const mileage = this.pickNumber(networkInfo.mileage);
            if (mileage !== null) await this.setStateChangedAsync(`${channelId}.telemetry.totalMileageM`, mileage, true);
        }

        const deviceOtherInfoRaw = items?.deviceOtherInfo?.value ?? items?.deviceOtherInfo ?? data.deviceOtherInfo?.value ?? data.deviceOtherInfo;
        const deviceOtherInfo =
            typeof deviceOtherInfoRaw === 'string'
                ? this.safeJsonParse<Record<string, any>>(deviceOtherInfoRaw)
                : deviceOtherInfoRaw;
        if (deviceOtherInfo && typeof deviceOtherInfo === 'object') {
            const taskArea = this.pickNumber(deviceOtherInfo.task_area);
            if (taskArea !== null) await this.setStateChangedAsync(`${channelId}.telemetry.taskAreaM2`, taskArea, true);
        }
    }

    private normalizeCoordinate(lat: number | null, lon: number | null): { lat: number | null; lon: number | null } {
        if (lat === null || lon === null) {
            return { lat, lon };
        }

        // Legacy properties come in radians for many devices.
        if (Math.abs(lat) <= Math.PI / 2 && Math.abs(lon) <= Math.PI) {
            return {
                lat: (lat * 180) / Math.PI,
                lon: (lon * 180) / Math.PI,
            };
        }

        return { lat, lon };
    }

    private async callLegacyApi<TData>(
        domain: string,
        path: string,
        apiVer: string,
        params: Record<string, any>,
        iotToken?: string,
    ): Promise<LegacyApiResponse<TData>> {
        const body = {
            id: this.randomUuid(),
            params,
            request: {
                apiVer,
                language: 'en-US',
                ...(iotToken ? { iotToken } : {}),
            },
            version: '1.0',
        };
        const bodyText = JSON.stringify(body);
        const headers = this.buildLegacyGatewayHeaders(domain, bodyText);
        this.signLegacyGatewayRequest('POST', path, headers, {});

        const response = await axios.post<LegacyApiResponse<TData>>(`https://${domain}${path}`, bodyText, {
            headers,
            timeout: 15000,
        });
        return response.data;
    }

    private async callLegacyOpenAccountConnect(): Promise<LegacyOpenAccountConnectResult> {
        const domain = 'sdk.openaccount.aliyun.com';
        const body = {
            context: {
                sdkVersion: '3.4.2',
                platformName: 'android',
                netType: 'wifi',
                appKey: LEGACY_APP_KEY,
                yunOSId: '',
                appVersion: LEGACY_APP_VERSION,
                utDid: this.legacyUtdid,
                appAuthToken: this.legacyUtdid,
                securityToken: this.legacyUtdid,
            },
            config: {
                version: 0,
                lastModify: 0,
            },
            device: {
                model: 'sdk_gphone_x86_arm',
                brand: 'goldfish_x86',
                platformVersion: '30',
            },
        };
        const bodyJson = JSON.stringify(body);

        const headers: Record<string, string> = {
            host: domain,
            date: this.legacyUtcDate(),
            'x-ca-nonce': this.randomUuid(),
            'x-ca-key': LEGACY_APP_KEY,
            'x-ca-signaturemethod': 'HmacSHA256',
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': 'okhttp/4.9.3',
        };

        const { signatureHeaders, headerBlock } = this.buildLegacySignatureHeaders(headers);
        headers['x-ca-signature-headers'] = signatureHeaders;
        const toSign = `POST\n${headers.accept}\n\n${headers['content-type']}\n${headers.date}\n${headerBlock}\n/api/prd/connect.json?request=${bodyJson}`;
        headers['x-ca-signature'] = this.hmacSha256Base64(LEGACY_APP_SECRET, toSign);

        const response = await axios.post<LegacyOpenAccountResponse>(`https://${domain}/api/prd/connect.json`, null, {
            headers,
            params: { request: bodyJson },
            timeout: 15000,
        });
        const data = response.data;
        const vid = data?.data?.vid || data?.vid || '';
        const deviceId = data?.data?.data?.device?.data?.deviceId || '';
        if (!vid || !deviceId) {
            throw new Error('Legacy connect failed: vid/deviceId missing');
        }

        return {
            vid,
            deviceId,
            utdid: this.legacyUtdid,
        };
    }

    private async callLegacyLoginByOauth(
        oaApiGatewayEndpoint: string,
        authorizationCode: string,
        countryCode: string,
        vid: string,
        deviceId: string,
        utdid: string,
    ): Promise<LegacyLoginByOauthResponse> {
        const body = {
            country: countryCode,
            authCode: authorizationCode,
            oauthPlateform: 23,
            oauthAppKey: LEGACY_APP_KEY,
            riskControlInfo: {
                appID: 'com.agilexrobotics',
                appAuthToken: '',
                signType: 'RSA',
                sdkVersion: '3.4.2',
                utdid,
                umidToken: utdid,
                deviceId,
                USE_OA_PWD_ENCRYPT: 'true',
                USE_H5_NC: 'true',
            },
        };
        const bodyJson = JSON.stringify(body);

        const headers: Record<string, string> = {
            host: oaApiGatewayEndpoint,
            date: this.legacyUtcDate(),
            'x-ca-nonce': this.randomUuid(),
            'x-ca-key': LEGACY_APP_KEY,
            'x-ca-signaturemethod': 'HmacSHA256',
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
            'user-agent': 'okhttp/4.9.3',
            vid,
        };

        const { signatureHeaders, headerBlock } = this.buildLegacySignatureHeaders(headers);
        headers['x-ca-signature-headers'] = signatureHeaders;
        const toSign = `POST\n${headers.accept}\n\n${headers['content-type']}\n${headers.date}\n${headerBlock}\n/api/prd/loginbyoauth.json?loginByOauthRequest=${bodyJson}`;
        headers['x-ca-signature'] = this.hmacSha256Base64(LEGACY_APP_SECRET, toSign);

        const form = new URLSearchParams();
        form.set('loginByOauthRequest', bodyJson);

        const response = await axios.post<LegacyLoginByOauthResponse>(
            `https://${oaApiGatewayEndpoint}/api/prd/loginbyoauth.json`,
            form.toString(),
            { headers, timeout: 15000 },
        );
        return response.data;
    }

    private buildLegacyGatewayHeaders(domain: string, bodyText: string): Record<string, string> {
        return {
            host: domain,
            date: this.legacyUtcDate(),
            'x-ca-nonce': this.randomUuid(),
            'x-ca-key': LEGACY_APP_KEY,
            'x-ca-signaturemethod': 'HmacSHA256',
            accept: 'application/json',
            'user-agent': 'okhttp/4.9.3',
            'content-type': 'application/octet-stream',
            'content-md5': createHash('md5').update(bodyText, 'utf8').digest('base64'),
        };
    }

    private signLegacyGatewayRequest(
        method: 'GET' | 'POST',
        path: string,
        headers: Record<string, string>,
        query: Record<string, string | number | undefined | null>,
    ): void {
        const { signatureHeaders, headerBlock } = this.buildLegacySignatureHeaders(headers);
        headers['x-ca-signature-headers'] = signatureHeaders;
        const queryString = this.legacyBuildQueryString(query);
        const url = queryString ? `${path}?${queryString}` : path;

        const toSign = `${method}\n${headers.accept || ''}\n${headers['content-md5'] || ''}\n${headers['content-type'] || ''}\n${
            headers.date || ''
        }\n${headerBlock}\n${url}`;
        headers['x-ca-signature'] = this.hmacSha256Base64(LEGACY_APP_SECRET, toSign);
    }

    private buildLegacySignatureHeaders(headers: Record<string, string>): { signatureHeaders: string; headerBlock: string } {
        const copy: Record<string, string> = { ...headers };
        for (const key of Object.keys(copy)) {
            if (LEGACY_MOVE_HEADERS.has(key.toLowerCase())) {
                delete copy[key];
            }
        }
        const keys = Object.keys(copy).sort();
        return {
            signatureHeaders: keys.join(','),
            headerBlock: keys.map(key => `${key}:${copy[key] ?? ''}`).join('\n'),
        };
    }

    private legacyBuildQueryString(query: Record<string, string | number | undefined | null>): string {
        return Object.entries(query)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
    }

    private legacyUtcDate(): string {
        return new Date().toUTCString();
    }

    private randomUuid(): string {
        const nativeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
        if (nativeCrypto?.randomUUID) {
            return nativeCrypto.randomUUID();
        }
        return `${Date.now()}-${Math.trunc(Math.random() * 1e9)}`;
    }

    private hmacSha256Base64(secret: string, value: string): string {
        return createHmac('sha256', secret).update(value, 'utf8').digest('base64');
    }

    private extractLegacyApiMessage<T>(response: LegacyApiResponse<T>, fallback: string): string {
        return response.message || response.msg || fallback;
    }

    private buildTaskControlContent(session: AuthSession, context: DeviceContext, command: DeviceCommand): string {
        const action = this.commandToAction(command);
        const subtype = Number.parseInt(session.userAccount, 10);
        const commandBytes = this.buildNavTaskControlCommand(
            action,
            Number.isNaN(subtype) ? 0 : subtype,
            this.getReceiverDevice(context),
        );
        return commandBytes.toString('base64');
    }

    private buildTaskSettingsContent(session: AuthSession, cutHeightMm: number, mowSpeedMs: number): string {
        const subtype = Number.parseInt(session.userAccount, 10);
        const requestPayload = this.encodeMessage([
            this.encodeFieldVarint(3, Math.trunc(cutHeightMm)),
            this.encodeFieldFloat32(4, mowSpeedMs),
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
            this.encodeFieldVarint(15, now),
        ]).toString('base64');
    }

    private buildSetBladeHeightContent(session: AuthSession, cutHeightMm: number): string {
        const subtype = Number.parseInt(session.userAccount, 10);
        const bladeHeightPayload = this.encodeMessage([this.encodeFieldVarint(1, Math.trunc(cutHeightMm))]);
        const driverPayload = this.encodeMessage([this.encodeFieldBytes(2, bladeHeightPayload)]);
        const now = Date.now();

        return this.encodeMessage([
            this.encodeFieldVarint(1, 243),
            this.encodeFieldVarint(2, 7),
            this.encodeFieldVarint(3, 1),
            this.encodeFieldVarint(4, 1),
            this.encodeFieldVarint(5, (this.seq = (this.seq + 1) & 0xff)),
            this.encodeFieldVarint(6, 1),
            this.encodeFieldVarint(7, Number.isNaN(subtype) ? 0 : subtype),
            this.encodeFieldBytes(12, driverPayload),
            this.encodeFieldVarint(15, now),
        ]).toString('base64');
    }

    private buildSetMowSpeedContent(session: AuthSession, mowSpeedMs: number): string {
        const subtype = Number.parseInt(session.userAccount, 10);
        const speedPayload = this.encodeMessage([this.encodeFieldVarint(1, 1), this.encodeFieldFloat32(2, mowSpeedMs)]);
        const driverPayload = this.encodeMessage([this.encodeFieldBytes(3, speedPayload)]);
        const now = Date.now();

        return this.encodeMessage([
            this.encodeFieldVarint(1, 243),
            this.encodeFieldVarint(2, 7),
            this.encodeFieldVarint(3, 1),
            this.encodeFieldVarint(4, 1),
            this.encodeFieldVarint(5, (this.seq = (this.seq + 1) & 0xff)),
            this.encodeFieldVarint(6, 1),
            this.encodeFieldVarint(7, Number.isNaN(subtype) ? 0 : subtype),
            this.encodeFieldBytes(12, driverPayload),
            this.encodeFieldVarint(15, now),
        ]).toString('base64');
    }

    private buildRequestIotSyncContent(session: AuthSession, stop = false): string {
        const subtype = Number.parseInt(session.userAccount, 10);
        const reportTypes = [1, 3, 4, 6, 10, 8];
        const reportCfgFields: Buffer[] = [
            this.encodeFieldVarint(1, stop ? 1 : 0),
            this.encodeFieldVarint(2, 10_000),
            this.encodeFieldVarint(3, 3_000),
            this.encodeFieldVarint(4, 4_000),
            this.encodeFieldVarint(5, 0),
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
            this.encodeFieldVarint(5, (this.seq = (this.seq + 1) & 0xff)),
            this.encodeFieldVarint(6, 1),
            this.encodeFieldVarint(7, Number.isNaN(subtype) ? 0 : subtype),
            this.encodeFieldBytes(10, sysPayload),
            this.encodeFieldVarint(15, now),
        ]).toString('base64');
    }

    private buildRoutePlanningContent(
        session: AuthSession,
        context: DeviceContext,
        settings: RouteSettings,
        mode: RouteCommandMode,
    ): string {
        const routePayload: Buffer[] = [
            this.encodeFieldVarint(1, 1),
            this.encodeFieldVarint(4, settings.jobMode),
            this.encodeFieldVarint(5, this.routeCommandToSubCmd(mode)),
            this.encodeFieldVarint(6, settings.mowingLaps),
            this.encodeFieldVarint(7, settings.cutHeightMm),
            this.encodeFieldVarint(8, settings.channelWidthCm),
            this.encodeFieldVarint(9, settings.ultraWave),
            this.encodeFieldVarint(10, settings.channelMode),
            this.encodeFieldInt32(11, settings.towardDeg),
            this.encodeFieldFloat32(12, settings.mowSpeedMs),
            this.encodeFieldVarint(17, settings.towardMode),
            this.encodeFieldInt32(18, settings.towardIncludedAngleDeg),
            this.encodeFieldFloat32(19, settings.rideBoundaryDistance),
            this.encodeFieldRawBytes(15, Buffer.from(this.buildRouteReservedString(context, settings), 'utf8')),
        ];

        for (const areaHash of settings.areaHashes) {
            routePayload.push(this.encodeFieldFixed64(13, areaHash));
        }

        const navPayload = this.encodeMessage([this.encodeFieldBytes(34, this.encodeMessage(routePayload))]);
        const subtype = Number.parseInt(session.userAccount, 10);
        const lubaMessage = this.buildLubaMessage({
            msgType: 240,
            // The Android app sends NavReqCoverPath to DEV_MAINCTL.
            receiverDevice: this.getReceiverDevice(context),
            subtype: Number.isNaN(subtype) ? 0 : subtype,
            subMessageField: 11,
            subMessagePayload: navPayload,
        });
        return lubaMessage.toString('base64');
    }

    private buildNonWorkHoursContent(session: AuthSession, context: DeviceContext, settings: NonWorkHoursSettings): string {
        const unableTimePayload = this.encodeMessage([
            this.encodeFieldVarint(1, settings.subCmd),
            this.encodeFieldString(2, context.iotId),
            this.encodeFieldString(3, settings.startTime),
            this.encodeFieldString(4, settings.endTime),
            this.encodeFieldVarint(5, 0),
            this.encodeFieldString(6, '0'),
            this.encodeFieldVarint(7, 0),
        ]);
        const navPayload = this.encodeMessage([this.encodeFieldBytes(41, unableTimePayload)]);
        const subtype = Number.parseInt(session.userAccount, 10);
        const lubaMessage = this.buildLubaMessage({
            msgType: 240,
            receiverDevice: this.getReceiverDevice(context),
            subtype: Number.isNaN(subtype) ? 0 : subtype,
            subMessageField: 11,
            subMessagePayload: navPayload,
        });
        return lubaMessage.toString('base64');
    }

    private buildBladeControlContent(session: AuthSession, _context: DeviceContext, settings: BladeControlSettings): string {
        const mowCtrlByHand = this.encodeMessage([
            this.encodeFieldVarint(1, settings.powerOn ? 1 : 0),
            this.encodeFieldVarint(2, settings.powerOn ? 1 : 0),
            this.encodeFieldVarint(3, settings.heightMm),
            this.encodeFieldFloat32(4, settings.maxSpeedMs),
        ]);
        const driverPayload = this.encodeMessage([this.encodeFieldBytes(6, mowCtrlByHand)]);
        const subtype = Number.parseInt(session.userAccount, 10);
        const lubaMessage = this.buildLubaMessage({
            msgType: 243,
            receiverDevice: 1,
            subtype: Number.isNaN(subtype) ? 0 : subtype,
            subMessageField: 12,
            subMessagePayload: driverPayload,
        });
        return lubaMessage.toString('base64');
    }

    private buildRouteReservedString(context: DeviceContext, settings: RouteSettings): string {
        const bytes = Buffer.alloc(8);
        bytes[0] = this.clampByte(settings.borderMode);
        bytes[1] = this.clampByte(settings.obstacleLaps);
        bytes[2] = 0;
        bytes[3] = this.clampByte(settings.startProgress);
        bytes[5] = 0;
        const isLuba1 = this.isLuba1Device(context);
        const isLubaPro = this.isLubaProDevice(context);
        const isYuka = this.isYukaDevice(context);
        const isYukaMini = this.isYukaMiniDevice(context);
        const isYukaMl = this.isYukaMlDevice(context);
        if (!isLuba1) {
            bytes[4] = 0;
            if (isYuka && !isYukaMini && !isYukaMl) {
                bytes[5] = this.clampByte(this.getYukaConfig(settings, context.deviceName));
            } else if (isLubaPro) {
                bytes[5] = 8;
            }
            bytes[6] = this.clampByte(settings.isDump ? settings.collectGrassFrequency : 10);
        } else {
            bytes[4] = this.clampByte(settings.towardMode);
        }
        return bytes.toString('utf8');
    }

    private getYukaConfig(settings: RouteSettings, _deviceName: string): number {
        if (settings.isMow && settings.isDump && settings.isEdge) return 14;
        if (settings.isMow && settings.isDump && !settings.isEdge) return 12;
        if (settings.isMow && !settings.isDump && settings.isEdge) return 10;
        if (settings.isMow && !settings.isDump && !settings.isEdge) return 8;
        if (!settings.isMow && settings.isDump && settings.isEdge) return 6;
        if (!settings.isMow && settings.isDump && !settings.isEdge) return 4;
        if (!settings.isMow && !settings.isDump && settings.isEdge) return 2;
        return 0;
    }

    private clampByte(value: number): number {
        return Math.max(0, Math.min(255, Math.trunc(value)));
    }

    private normalizeCutHeightMm(value: number, context?: DeviceContext): number {
        const limits = this.getDeviceCommandLimits(context);
        return this.clampToStep(value, limits.cutHeight.min, limits.cutHeight.max, limits.cutHeight.step);
    }

    private normalizeRouteChannelWidthCm(value: number, context?: DeviceContext): number {
        const limits = this.getDeviceCommandLimits(context);
        return this.clampToStep(value, limits.routeWidth.min, limits.routeWidth.max, limits.routeWidth.step);
    }

    private clampToStep(value: number, min: number, max: number, step: number): number {
        const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
        const normalized = Math.round((clamped - min) / step) * step + min;
        return Math.min(max, Math.max(min, normalized));
    }

    private getDeviceCommandLimits(context?: DeviceContext): DeviceCommandLimits {
        const hint = `${context?.deviceName || ''} ${context?.series || ''} ${context?.productSeries || ''}`.toLowerCase();
        const isLubaMini = hint.includes('luba mini');
        const isHighCutVariant = /(mini|vision).*[0-9]h\b|\bmini.*\bh\b/.test(hint);

        let limits: DeviceCommandLimits = {
            cutHeight: { min: CUT_HEIGHT_MIN_MM, max: CUT_HEIGHT_MAX_MM, step: CUT_HEIGHT_STEP_MM },
            routeWidth: { min: ROUTE_CHANNEL_WIDTH_MIN_CM, max: ROUTE_CHANNEL_WIDTH_MAX_CM, step: 1 },
            mowSpeed: { min: 0.2, max: 1, step: 0.01 },
        };

        if (this.isYukaDevice(context)) {
            limits = {
                cutHeight: { min: 55, max: 55, step: 1 },
                routeWidth: { min: YUKA_ROUTE_CHANNEL_WIDTH_MIN_CM, max: YUKA_ROUTE_CHANNEL_WIDTH_MAX_CM, step: 1 },
                mowSpeed: { min: 0.2, max: 0.6, step: 0.01 },
            };
        }

        if (this.isYukaMiniDevice(context) || this.isYukaMlDevice(context)) {
            limits = {
                cutHeight: isHighCutVariant ? { min: 50, max: 90, step: 5 } : { min: 20, max: 60, step: 5 },
                routeWidth: { min: YUKA_MINI_ROUTE_CHANNEL_WIDTH_MIN_CM, max: YUKA_MINI_ROUTE_CHANNEL_WIDTH_MAX_CM, step: 1 },
                mowSpeed: { min: 0.2, max: 0.6, step: 0.01 },
            };
        }

        if (isLubaMini && isHighCutVariant) {
            limits.cutHeight = { min: 55, max: 100, step: 5 };
        }

        return limits;
    }

    private getDeviceTypeCode(context?: DeviceContext): number | null {
        return this.pickNumber(context?.deviceType);
    }

    private isYukaDevice(context?: DeviceContext): boolean {
        if (!context) {
            return false;
        }
        if (YUKA_PRODUCT_KEYS.has(context.productKey) || YUKA_MINI_PRODUCT_KEYS.has(context.productKey) || YUKA_ML_PRODUCT_KEYS.has(context.productKey)) {
            return true;
        }
        const type = this.getDeviceTypeCode(context);
        if (type !== null && [3, 4, 5, 8, 14, 16, 21].includes(type)) {
            return true;
        }
        const hint = `${context.deviceName} ${context.series || ''} ${context.productSeries || ''}`.toLowerCase();
        return hint.includes('yuka');
    }

    private isYukaMiniDevice(context?: DeviceContext): boolean {
        if (!context) {
            return false;
        }
        if (YUKA_MINI_PRODUCT_KEYS.has(context.productKey)) {
            return true;
        }
        const type = this.getDeviceTypeCode(context);
        if (type !== null && [4, 5].includes(type)) {
            return true;
        }
        const hint = `${context.deviceName} ${context.series || ''} ${context.productSeries || ''}`.toLowerCase();
        return this.isYukaDevice(context) && hint.includes('mini');
    }

    private isYukaMlDevice(context?: DeviceContext): boolean {
        if (!context) {
            return false;
        }
        if (YUKA_ML_PRODUCT_KEYS.has(context.productKey)) {
            return true;
        }
        const type = this.getDeviceTypeCode(context);
        if (type === 16) {
            return true;
        }
        const hint = `${context.deviceName} ${context.series || ''} ${context.productSeries || ''}`.toLowerCase();
        return hint.includes('yuka ml');
    }

    private isLuba1Device(context?: DeviceContext): boolean {
        if (!context) {
            return false;
        }
        const type = this.getDeviceTypeCode(context);
        if (type === 1) {
            return true;
        }
        const hint = `${context.deviceName} ${context.series || ''} ${context.productSeries || ''}`.toLowerCase();
        return hint.includes('luba 1');
    }

    private isLubaProDevice(context?: DeviceContext): boolean {
        if (!context) {
            return false;
        }
        const hint = `${context.deviceName} ${context.series || ''} ${context.productSeries || ''}`.toLowerCase();
        return hint.includes('luba pro') || LUBA_PRO_PRODUCT_KEYS.has(context.productKey);
    }

    private routeCommandToSubCmd(mode: RouteCommandMode): number {
        switch (mode) {
            case 'generate':
                return 0;
            case 'modify':
                return 3;
            case 'query':
                return 2;
        }
    }

    private buildLubaMessage(args: {
        msgType: number;
        receiverDevice: number;
        subtype: number;
        subMessageField: number;
        subMessagePayload: Buffer;
    }): Buffer {
        const now = BigInt(Date.now());
        this.seq = (this.seq + 1) & 0xff;

        return this.encodeMessage([
            this.encodeFieldVarint(1, args.msgType),
            this.encodeFieldVarint(2, 7),
            this.encodeFieldVarint(3, args.receiverDevice),
            this.encodeFieldVarint(4, 1),
            this.encodeFieldVarint(5, this.seq),
            this.encodeFieldVarint(6, 1),
            this.encodeFieldVarint(7, args.subtype),
            this.encodeFieldBytes(args.subMessageField, args.subMessagePayload),
            this.encodeFieldVarint(15, now),
        ]);
    }

    private commandToAction(command: DeviceCommand): number {
        switch (command) {
            case 'start':
                return 1;
            case 'pause':
                return 2;
            case 'resume':
                return 3;
            case 'stop':
            case 'cancelJob':
                return 4;
            case 'dock':
                return 5;
            case 'cancelDock':
                return 12;
        }
    }

    private getReceiverDevice(context: DeviceContext): number {
        if (this.isLubaProDevice(context)) {
            return 17; // DEV_NAVIGATION
        }
        return 1; // DEV_MAINCTL
    }

    private buildNavTaskControlCommand(action: number, subtype: number, receiverDevice: number): Buffer {
        const taskCtrl = this.encodeMessage([
            this.encodeFieldVarint(1, 1), // type
            this.encodeFieldVarint(2, action), // action
            this.encodeFieldVarint(3, 0), // result
        ]);

        const nav = this.encodeMessage([this.encodeFieldBytes(37, taskCtrl)]);

        const now = Date.now();
        this.seq = (this.seq + 1) & 0xff;

        return this.encodeMessage([
            this.encodeFieldVarint(1, 240), // MSG_CMD_TYPE_NAV
            this.encodeFieldVarint(2, 7), // DEV_MOBILEAPP
            this.encodeFieldVarint(3, receiverDevice), // DEV_MAINCTL / DEV_NAVIGATION
            this.encodeFieldVarint(4, 1), // MSG_ATTR_REQ
            this.encodeFieldVarint(5, this.seq),
            this.encodeFieldVarint(6, 1), // version
            this.encodeFieldVarint(7, subtype), // user account id
            this.encodeFieldBytes(11, nav), // nav payload
            this.encodeFieldVarint(15, now), // timestamp
        ]);
    }

    // ─── Zone / area name support ────────────────────────────────────────────────

    private buildAreaNameListContent(
        session: AuthSession,
        context: DeviceContext,
        subCmd = 0,
        receiverDeviceOverride?: number,
    ): string {
        // NavGetHashList (todev_gethash): requests the device to send its complete zone hash list.
        // sub_cmd=0: all hashes → device responds with NavGetHashListAck (field 31).
        // sub_cmd=3: area hash names → device may respond with AppGetAllAreaHashName (field 61).
        const getHashPayload = this.encodeMessage([
            this.encodeFieldVarint(1, 1),       // pver = 1
            this.encodeFieldVarint(2, subCmd),  // sub_cmd
        ]);
        // MctlNav field 30 = todev_gethash (NavGetHashList)
        const navPayload = this.encodeMessage([this.encodeFieldBytes(30, getHashPayload)]);
        const subtype = Number.parseInt(session.userAccount, 10);
        const lubaMessage = this.buildLubaMessage({
            msgType: 240,
            receiverDevice: receiverDeviceOverride ?? this.getReceiverDevice(context),
            subtype: Number.isNaN(subtype) ? 0 : subtype,
            subMessageField: 11,
            subMessagePayload: navPayload,
        });
        return lubaMessage.toString('base64');
    }

    private async sendAreaNameListRequest(context: DeviceContext): Promise<void> {
        const primaryReceiver = this.getReceiverDevice(context);
        const receivers = new Set<number>([primaryReceiver]);
        // Some Yuka firmware revisions answer NavGetHashList only on receiver 17.
        if (this.isYukaDevice(context)) {
            receivers.add(17);
            receivers.add(1);
        }

        // First try sub_cmd=3 (AppGetAllAreaHashName / field 61) – gives area hashes + names directly.
        for (const receiver of receivers) {
            this.log.debug(
                `[AREA-REQ] Sending sub_cmd=3 (AppGetAllAreaHashName) for ${context.deviceName || context.iotId}, receiver=${receiver}`,
            );
            const result3 = await this.executeEncodedContentCommand(context, 'area-name-list-v3', (_session, ctx) =>
                this.buildAreaNameListContent(_session, ctx, 3, receiver),
            );
            this.log.debug(
                `[AREA-REQ] sub_cmd=3 response (receiver=${receiver}, len=${result3?.length ?? 0}): ${result3?.substring(0, 100)}`,
            );
            if (result3 && result3 !== 'ok' && result3.length > 20) {
                const areas = this.tryParseAreaHashNames(result3);
                if (areas && areas.length > 0) {
                    this.rememberAreaNames(context.key, areas);
                    this.log.debug(`[AREA-REQ] Names cached via sub_cmd=3: ${areas.length}`);
                }
            }
        }

        // sub_cmd=0: device responds with NavGetHashListAck (field 31) → triggers field-32 classification
        for (const receiver of receivers) {
            const result0 = await this.executeEncodedContentCommand(context, 'area-name-list', (_session, ctx) =>
                this.buildAreaNameListContent(_session, ctx, 0, receiver),
            );
            this.log.debug(
                `[AREA-REQ] sub_cmd=0 response (receiver=${receiver}, len=${result0?.length ?? 0}): ${result0?.substring(0, 100)}`,
            );
            if (result0 && result0 !== 'ok' && result0.length > 20) {
                const areas = this.tryParseAreaHashNames(result0);
                if (areas && areas.length > 0) {
                    this.rememberAreaNames(context.key, areas);
                    this.log.debug(`[AREA-REQ] Names cached via sub_cmd=0: ${areas.length}`);
                }
            }
        }
    }


    private buildNavGetCommDataContent(session: AuthSession, context: DeviceContext, hash: bigint): string {
        // NavGetCommData (MctlNav field 32): ask device for type+name of a specific hash.
        // NavGetCommDataAck (field 33) response: type(field 5), Hash(field 6), nameTime(field 15).
        // type=0 (PathType.AREA) = mowing zone; type=1 = obstacle; type=2 = path, etc.
        const commDataPayload = this.encodeMessage([
            this.encodeFieldVarint(1, 1),    // pver = 1
            this.encodeFieldVarint(2, 1),    // sub_cmd = 1
            this.encodeFieldVarint(3, 8),    // action = 8 (synchronize hash data)
            this.encodeFieldVarint(5, hash), // hash (int64 varint)
        ]);
        const navPayload = this.encodeMessage([this.encodeFieldBytes(32, commDataPayload)]);
        const subtype = Number.parseInt(session.userAccount, 10);
        const lubaMessage = this.buildLubaMessage({
            msgType: 240,
            receiverDevice: this.getReceiverDevice(context),
            subtype: Number.isNaN(subtype) ? 0 : subtype,
            subMessageField: 11,
            subMessagePayload: navPayload,
        });
        return lubaMessage.toString('base64');
    }

    private async requestAreaNamesForHashes(context: DeviceContext, hashIds: bigint[]): Promise<void> {
        if (this.zoneDiscoveryInFlight.has(context.key)) {
            this.log.debug(`[ZONE] Discovery already running for ${context.deviceName || context.iotId}, skipping duplicate trigger.`);
            return;
        }
        this.zoneDiscoveryInFlight.add(context.key);
        try {
            const hashSetKey = hashIds.map(String).join(',');
            const prevHashSet = this.lastRequestedHashSetByDevice.get(context.key);
            if (prevHashSet === hashSetKey && (await this.hasKnownAreas(context.key))) {
                return;
            }
            this.lastRequestedHashSetByDevice.set(context.key, hashSetKey);

            this.log.debug(`[ZONE] ${hashIds.length} hashes received, classifying sequentially via field-32/33`);

            // Classify each hash one at a time. The device has a rate limit and only processes
            // one field-32 request at a time, so we wait for each field-33 response before sending the next.
            const areaHashes: bigint[] = [];
            let unknownHashes: bigint[] = [];
            const typeHistogram = new Map<number, number>();
            for (const hash of hashIds) {
                const type = await this.classifyHashType(context, hash);
                this.log.debug(`[ZONE] hash=${hash} → type=${type}`);
                typeHistogram.set(type, (typeHistogram.get(type) ?? 0) + 1);
                if (type === 0) areaHashes.push(hash); // PathType.AREA = 0
                if (type < 0) unknownHashes.push(hash);
            }

            // MQTT may flap for a few seconds; retry unknown hashes once before finalizing.
            if (unknownHashes.length > 0) {
                this.log.debug(`[ZONE] Retrying ${unknownHashes.length} unknown hash classifications once.`);
                const retryUnknown: bigint[] = [];
                for (const hash of unknownHashes) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    const retryType = await this.classifyHashType(context, hash);
                    this.log.debug(`[ZONE] retry hash=${hash} → type=${retryType}`);
                    typeHistogram.set(retryType, (typeHistogram.get(retryType) ?? 0) + 1);
                    if (retryType === 0 && !areaHashes.some(existing => existing === hash)) {
                        areaHashes.push(hash);
                        continue;
                    }
                    if (retryType < 0) {
                        retryUnknown.push(hash);
                    }
                }
                unknownHashes = retryUnknown;
            }

            const histogramText = [...typeHistogram.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([type, count]) => `${type}:${count}`)
                .join(', ');
            this.log.info(
                `[ZONE] ${areaHashes.length} mowing zones (type=0) detected out of ${hashIds.length} hashes (types: ${histogramText})`,
            );

            const existingAreas = await this.getKnownAreas(context.key);
            let finalAreaHashes = areaHashes;

            // If classification timed out for some hashes, do not drop already known zones.
            if (unknownHashes.length > 0 && existingAreas.length > 0) {
                const merged = new Map<string, bigint>();
                for (const area of existingAreas) {
                    merged.set(area.hash.toString(), area.hash);
                }
                for (const hash of areaHashes) {
                    merged.set(hash.toString(), hash);
                }
                finalAreaHashes = [...merged.values()];
                this.log.warn(
                    `[ZONE] Partial classification (${unknownHashes.length} timeout/unknown). Keeping ${existingAreas.length} existing zones; merged result has ${finalAreaHashes.length} zones.`,
                );
            }

            if (!finalAreaHashes.length) {
                this.log.warn(
                    `[ZONE] No mowing zones (type=0) detected - skipping zone update to avoid creating paths/NoGo as zones.`,
                );
                return;
            }
            this.classifiedAreaHashesByDevice.set(context.key, new Set(finalAreaHashes.map(h => h.toString())));
            const names = this.pendingAreaNamesByDevice.get(context.key);
            const existingNames = new Map(existingAreas.map(area => [area.hash.toString(), area.name]));
            const areas = this.buildAreaListWithUniqueNames(finalAreaHashes, names, existingNames);
            await this.updateZoneStates(context.key, areas);
        } finally {
            this.zoneDiscoveryInFlight.delete(context.key);
        }
    }

    private buildAreaListWithUniqueNames(
        hashes: bigint[],
        pendingNames: Map<string, string> | undefined,
        existingNames: Map<string, string>,
    ): Array<{ name: string; hash: bigint }> {
        const hasRealNames = !!pendingNames && pendingNames.size > 0;
        const taken = new Set<string>();
        const areas: Array<{ name: string; hash: bigint }> = [];
        let nextFallbackIndex = 1;

        const nextFallbackName = (): string => {
            while (true) {
                const candidate = `Area ${nextFallbackIndex++}`;
                const candidateId = this.sanitizeObjectId(candidate);
                if (!taken.has(candidateId)) {
                    return candidate;
                }
            }
        };

        for (const hash of hashes) {
            const key = hash.toString();
            let name = hasRealNames ? (pendingNames?.get(key) || existingNames.get(key) || '').trim() : '';
            if (!name) {
                name = nextFallbackName();
            }

            let sanitized = this.sanitizeObjectId(name);
            if (!sanitized) {
                name = nextFallbackName();
                sanitized = this.sanitizeObjectId(name);
            }

            if (taken.has(sanitized)) {
                // Avoid odd names like "Area 2 2" when duplicate fallback names occur.
                // Reassign to the next free "Area N" label instead.
                name = nextFallbackName();
                sanitized = this.sanitizeObjectId(name);
            }

            taken.add(sanitized);
            areas.push({ name, hash });
        }

        return areas;
    }

    private async getKnownAreas(deviceKey: string): Promise<Array<{ name: string; hash: bigint }>> {
        const areasJsonState = await this.getStateAsync(`devices.${deviceKey}.telemetry.areasJson`);
        const raw = areasJsonState?.val;
        if (typeof raw !== 'string' || !raw.trim()) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw) as Array<{ name?: unknown; hash?: unknown }>;
            if (!Array.isArray(parsed)) {
                return [];
            }
            const result: Array<{ name: string; hash: bigint }> = [];
            for (const entry of parsed) {
                const name = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : '';
                const hashRaw = entry?.hash;
                if (!name || (typeof hashRaw !== 'string' && typeof hashRaw !== 'number' && typeof hashRaw !== 'bigint')) {
                    continue;
                }
                try {
                    result.push({ name, hash: BigInt(`${hashRaw}`) });
                } catch {
                    // ignore malformed hash entries
                }
            }
            return result;
        } catch {
            return [];
        }
    }

    /**
     * Sends field-32 (NavGetCommData) for a single hash and waits up to 8 s for the field-33
     * (NavGetCommDataAck) response, which arrives either in the HTTP sync response or via MQTT.
     * Returns the PathType (0=AREA, 1=OBSTACLE, 2=PATH, …) or -1 on timeout.
     */
    private classifyHashType(context: DeviceContext, hash: bigint): Promise<number> {
        return new Promise<number>((resolve) => {
            const waitKey = `${context.key}:${hash}`;
            const timer = setTimeout(() => {
                if (this.classifyWaiters.delete(waitKey)) resolve(-1); // timeout, type unknown
            }, 8000);

            this.classifyWaiters.set(waitKey, (type: number) => {
                clearTimeout(timer);
                resolve(type);
            });

            // Send field-32 request; aso check sync HTTP response immediately
            void this.executeEncodedContentCommand(context, 'get-comm-data', (_s, ctx) =>
                this.buildNavGetCommDataContent(_s, ctx, hash),
            ).then(result => {
                if (result && result !== 'ok' && result.length > 20) {
                    this.resolveCommDataAck(context.key, result);
                }
            }).catch(() => {
                if (this.classifyWaiters.delete(waitKey)) {
                    clearTimeout(timer);
                    resolve(-1);
                }
            });
        });
    }

    /** Called when a field-33 (NavGetCommDataAck) proto arrives (sync HTTP or async MQTT). */
    private async parseMctlSysProto(deviceKey: string, protoBase64: string): Promise<void> {
        try {
            const buf = Buffer.from(protoBase64, 'base64');
            const lubaFields = this.decodeProtoFields(buf);
            for (const sysBuf of lubaFields.get(10) ?? []) {
                if (!(sysBuf instanceof Buffer)) continue;
                const sysFields = this.decodeProtoFields(sysBuf);

                // SysBatUp (field 1) → bat_val (field 1) = battery %
                for (const batBuf of sysFields.get(1) ?? []) {
                    if (!(batBuf instanceof Buffer)) continue;
                    const batFields = this.decodeProtoFields(batBuf);
                    const batVal = batFields.get(1)?.[0];
                    if (batVal !== undefined && !(batVal instanceof Buffer)) {
                        await this.setStateChangedAsync(`devices.${deviceKey}.telemetry.batteryPercent`, Number(batVal), true);
                    }
                }

                // SysWorkState (field 2) → device_state (field 1)
                for (const workBuf of sysFields.get(2) ?? []) {
                    if (!(workBuf instanceof Buffer)) continue;
                    const workFields = this.decodeProtoFields(workBuf);
                    const devState = workFields.get(1)?.[0];
                    if (devState !== undefined && !(devState instanceof Buffer)) {
                        const state = Number(devState);
                        await this.setStateChangedAsync(`devices.${deviceKey}.telemetry.deviceState`, state, true);
                        this.triggerStartSettingsEnforceIfDeviceActive(deviceKey, state);
                    }
                }

                // SysMowInfo (field 11) → device_state (field 1), bat_val (field 2)
                for (const mowBuf of sysFields.get(11) ?? []) {
                    if (!(mowBuf instanceof Buffer)) continue;
                    const mowFields = this.decodeProtoFields(mowBuf);
                    const devState = mowFields.get(1)?.[0];
                    if (devState !== undefined && !(devState instanceof Buffer)) {
                        const state = Number(devState);
                        await this.setStateChangedAsync(`devices.${deviceKey}.telemetry.deviceState`, state, true);
                        this.triggerStartSettingsEnforceIfDeviceActive(deviceKey, state);
                    }
                    const batVal = mowFields.get(2)?.[0];
                    if (batVal !== undefined && !(batVal instanceof Buffer)) {
                        await this.setStateChangedAsync(`devices.${deviceKey}.telemetry.batteryPercent`, Number(batVal), true);
                    }
                }
            }
        } catch { }
    }

    private resolveCommDataAck(deviceKey: string, protoBase64: string): void {
        try {
            const buf = Buffer.from(protoBase64, 'base64');
            const fieldMaps = this.collectProtoFieldMapsFromBuffer(buf);
            for (const fields of fieldMaps) {
                for (const ackBuf of fields.get(33) ?? []) {
                    if (!(ackBuf instanceof Buffer)) continue;
                    const ackFields = this.decodeProtoFields(ackBuf);
                    // Proto3: type=0 (PathType.AREA) is default and NOT encoded on the wire.
                    const type = Number(ackFields.get(5)?.[0] ?? 0n);
                    const hashVal = ackFields.get(6)?.[0];
                    if (hashVal === undefined || hashVal instanceof Buffer) continue;
                    const hash = hashVal as bigint;
                    const waitKey = `${deviceKey}:${hash}`;
                    const resolver = this.classifyWaiters.get(waitKey);
                    if (resolver) {
                        this.classifyWaiters.delete(waitKey);
                        resolver(type);
                    }
                }
            }
        } catch {
            // ignore parse errors
        }
    }


    private async requestAreaNamesForAllDevices(): Promise<void> {
        for (const ctx of this.deviceContexts.values()) {
            try {
                await this.sendAreaNameListRequest(ctx);
                this.startAreaNameRetry(ctx.key);
            } catch (err) {
                this.log.debug(`Area-name request failed for ${ctx.deviceName || ctx.iotId}: ${this.extractAxiosError(err)}`);
            }
        }
    }

    private async requestAreaNamesForMissingDevices(): Promise<void> {
        for (const ctx of this.deviceContexts.values()) {
            if (await this.hasKnownAreas(ctx.key)) {
                this.clearAreaNameRetry(ctx.key);
                continue;
            }
            try {
                await this.sendAreaNameListRequest(ctx);
                this.startAreaNameRetry(ctx.key);
            } catch (err) {
                this.log.debug(
                    `Area-Name-Re-Request (missing) failed for ${ctx.deviceName || ctx.iotId}: ${this.extractAxiosError(err)}`,
                );
            }
        }
    }

    private async callAepHandle(session: LegacySession): Promise<AliyunMqttCreds> {
        const clientId = this.legacyUtdid.substring(0, 8);
        const deviceSn = this.legacyUtdid;
        const timestamp = String(Date.now() / 1000);
        const signStr = `appKey${LEGACY_APP_KEY}clientId${clientId}deviceSn${deviceSn}timestamp${timestamp}`;
        const sign = createHmac('sha1', LEGACY_APP_SECRET).update(signStr, 'utf8').digest('hex');

        const response = await this.callLegacyApi<AepResponseData>(
            session.apiGatewayEndpoint,
            '/app/aepauth/handle',
            '1.0.0',
            {
                authInfo: {
                    clientId,
                    sign,
                    deviceSn,
                    timestamp,
                },
            },
            session.iotToken,
        );

        if (response.code !== 200 || !response.data?.deviceSecret) {
            throw new Error(this.extractLegacyApiMessage(response, 'AEP handle failed'));
        }

        return {
            aepProductKey: response.data.productKey || '',
            aepDeviceName: response.data.deviceName || '',
            aepDeviceSecret: response.data.deviceSecret,
            regionId: session.regionId,
        };
    }

    private async connectAliyunMqtt(session: LegacySession): Promise<void> {
        if (this.aliyunMqttClient?.connected) {
            return;
        }
        if (this.aliyunMqttClient) {
            this.aliyunMqttClient.removeAllListeners();
            this.aliyunMqttClient.on('error', () => {}); // prevent uncaught connack timeout after teardown
            this.aliyunMqttClient.end(true);
            this.aliyunMqttClient = null;
            this.setAliyunMqttConnected(false);
        }

        if (!this.aliyunMqttCreds) {
            this.aliyunMqttCreds = await this.callAepHandle(session);
        }
        const creds = this.aliyunMqttCreds;

        const clientIdBase = this.legacyUtdid.substring(0, 8);
        const signStr = `clientId${clientIdBase}deviceName${creds.aepDeviceName}productKey${creds.aepProductKey}`;
        const password = createHmac('sha1', creds.aepDeviceSecret).update(signStr, 'utf8').digest('hex');
        // securemode=2 = plain TCP (port 1883), securemode=3 = TLS (port 8883)
        // Use plain TCP to avoid Aliyun root-CA issues in Node.js
        const brokerHost = `${creds.aepProductKey}.iot-as-mqtt.${creds.regionId}.aliyuncs.com`;
        const brokerUrl = `mqtt://${brokerHost}:1883`;
        this.log.debug(`[ALIYUN-MQTT] Connecting to ${brokerHost}:1883 as ${creds.aepDeviceName}&${creds.aepProductKey}`);

        const client = mqtt.connect(brokerUrl, {
            clientId: `${clientIdBase}|securemode=2,signmethod=hmacsha1|`,
            username: `${creds.aepDeviceName}&${creds.aepProductKey}`,
            password,
            reconnectPeriod: 5_000,
            connectTimeout: 15_000,
            protocolVersion: 4,
            clean: true,
        });
        this.aliyunMqttClient = client;

        client.on('connect', () => {
            this.log.info('Aliyun IoT MQTT connected (Legacy/Shared).');
            this.setAliyunMqttConnected(true);
            this.setCloudConnected(true);
            this.authFailureSince = 0;

            // Bind the user session (iotToken) to this MQTT connection
            const bindTopic = `/sys/${creds.aepProductKey}/${creds.aepDeviceName}/app/up/account/bind`;
            client.publish(
                bindTopic,
                JSON.stringify({
                    id: this.randomUuid(),
                    version: '1.0',
                    request: { clientId: `${creds.aepDeviceName}&${creds.aepProductKey}` },
                    params: { iotToken: session.iotToken },
                }),
                { qos: 1 },
            );

            // Subscribe on the AEP virtual-device topics.
            // After the iotToken bind Aliyun routes all mower push events through these topics.
            const aepBase = `/sys/${creds.aepProductKey}/${creds.aepDeviceName}`;
            const aepTopics = [
                `${aepBase}/app/down/account/bind_reply`,
                `${aepBase}/app/down/thing/events`,
                `${aepBase}/app/down/thing/status`,
                `${aepBase}/app/down/thing/properties`,
                `${aepBase}/app/down/thing/model/down_raw`,
                `${aepBase}/app/down/_thing/event/notify`,
                `${aepBase}/app/down/thing/event/property/post_reply`,
            ];
            for (const topic of aepTopics) {
                client.subscribe(topic, { qos: 1 }, (err: Error | null) => {
                    if (err) {
                        this.log.warn(`Aliyun MQTT subscribe failed (${topic}): ${err.message}`);
                    } else {
                        this.log.debug(`[ALIYUN-MQTT] Subscribed: ${topic}`);
                    }
                });
            }

            // Re-request area names now that MQTT is connected and can receive the async response
            setTimeout(() => {
                void this.requestAreaNamesForMissingDevices().catch(err => {
                    this.log.debug(`Area-name re-request after MQTT connect failed: ${this.extractAxiosError(err)}`);
                });
            }, 2_000);
        });

        client.on('message', (topic: string, payload: Buffer) => {
            void this.handleMqttMessage(topic, payload);
        });

        client.on('error', (err: Error) => {
            try {
                this.log.warn(`Aliyun IoT MQTT error: ${err.message}`);
                void this.setStateChangedAsync('info.lastError', `Aliyun MQTT: ${err.message}`, true);
            } catch {
                // adapter may be shutting down
            }
        });

        client.on('close', () => {
            try {
                this.setAliyunMqttConnected(false);
                this.log.debug('Aliyun MQTT connection closed');
            } catch {
                // adapter may be shutting down
            }
        });

        client.on('offline', () => {
            try {
                this.setAliyunMqttConnected(false);
                this.log.debug('Aliyun MQTT offline');
            } catch {
                // adapter may be shutting down
            }
        });
    }

    private async handleRequestAreaNames(deviceKey: string, localId: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, `Unknown device: ${deviceKey}`, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }
        try {
            await this.sendAreaNameListRequest(ctx);
            this.startAreaNameRetry(deviceKey);
            await this.setStateChangedAsync(localId, false, true);
            this.log.info(`Area-name list requested for ${ctx.deviceName || ctx.iotId}.`);
        } catch (err) {
            const msg = this.extractAxiosError(err);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            this.log.warn(`Area-name request failed for ${ctx.deviceName}: ${msg}`);
        }
    }

    private decodeVarintAt(buf: Buffer, pos: number): [bigint, number] {
        let result = 0n;
        let shift = 0n;
        while (pos < buf.length) {
            const byte = buf[pos++];
            result |= BigInt(byte & 0x7f) << shift;
            shift += 7n;
            if (!(byte & 0x80)) break;
        }
        return [result, pos];
    }

    private decodeProtoFields(buf: Buffer): Map<number, Array<Buffer | bigint>> {
        const result = new Map<number, Array<Buffer | bigint>>();
        let pos = 0;
        try {
            while (pos < buf.length) {
                const [tagVal, pos1] = this.decodeVarintAt(buf, pos);
                pos = pos1;
                const fieldNumber = Number(tagVal >> 3n);
                const wireType = Number(tagVal & 7n);
                if (fieldNumber === 0) break;

                let value: Buffer | bigint;
                if (wireType === 0) {
                    const [v, p] = this.decodeVarintAt(buf, pos);
                    pos = p;
                    value = v;
                } else if (wireType === 1) {
                    value = buf.readBigUInt64LE(pos);
                    pos += 8;
                } else if (wireType === 2) {
                    const [lenVal, p] = this.decodeVarintAt(buf, pos);
                    pos = p;
                    const len = Number(lenVal);
                    value = buf.subarray(pos, pos + len);
                    pos += len;
                } else if (wireType === 5) {
                    value = BigInt(buf.readUInt32LE(pos));
                    pos += 4;
                } else {
                    break;
                }

                if (!result.has(fieldNumber)) result.set(fieldNumber, []);
                result.get(fieldNumber)!.push(value);
            }
        } catch {
            // Ignore parse errors – return what was decoded so far
        }
        return result;
    }

    private collectProtoFieldMapsFromBuffer(buf: Buffer, maxDepth = 6): Array<Map<number, Array<Buffer | bigint>>> {
        const maps: Array<Map<number, Array<Buffer | bigint>>> = [];
        const walk = (current: Buffer, depth: number): void => {
            if (depth > maxDepth || current.length === 0) {
                return;
            }
            const fields = this.decodeProtoFields(current);
            if (!fields.size) {
                return;
            }
            maps.push(fields);
            if (depth === maxDepth) {
                return;
            }
            for (const values of fields.values()) {
                for (const value of values) {
                    if (value instanceof Buffer && value.length > 1 && value.length <= 16_384) {
                        walk(value, depth + 1);
                    }
                }
            }
        };
        walk(buf, 0);
        return maps;
    }

    private tryParseAreaHashNames(protoBase64: string): Array<{ name: string; hash: bigint }> | null {
        try {
            const buf = Buffer.from(protoBase64, 'base64');
            const fieldMaps = this.collectProtoFieldMapsFromBuffer(buf);
            const areas = new Map<string, { name: string; hash: bigint }>();

            for (const fields of fieldMaps) {
                // MctlNav field 61 = toapp_all_hash_name (AppGetAllAreaHashName)
                for (const areaListBuf of fields.get(61) ?? []) {
                    if (!(areaListBuf instanceof Buffer)) {
                        continue;
                    }
                    const areaListFields = this.decodeProtoFields(areaListBuf);
                    for (const hashNameBuf of areaListFields.get(2) ?? []) {
                        if (!(hashNameBuf instanceof Buffer)) {
                            continue;
                        }
                        const f = this.decodeProtoFields(hashNameBuf);
                        const hash = f.get(1)?.[0];
                        const nameBuf = f.get(2)?.[0];
                        if (hash !== undefined && !(hash instanceof Buffer) && nameBuf instanceof Buffer) {
                            const name = nameBuf.toString('utf8').trim();
                            if (name) {
                                areas.set(`${hash}:${name}`, { name, hash: hash as bigint });
                            }
                        }
                    }
                }

                // MctlNav field 33 = toapp_get_commondata_ack (NavGetCommDataAck)
                for (const ackBuf of fields.get(33) ?? []) {
                    if (!(ackBuf instanceof Buffer)) {
                        continue;
                    }
                    const ackFields = this.decodeProtoFields(ackBuf);
                    const hash = ackFields.get(6)?.[0];
                    const nameTimeBuf = ackFields.get(15)?.[0];
                    if (hash !== undefined && !(hash instanceof Buffer) && nameTimeBuf instanceof Buffer) {
                        const nameTimeFields = this.decodeProtoFields(nameTimeBuf);
                        const nameBuf = nameTimeFields.get(1)?.[0];
                        if (nameBuf instanceof Buffer) {
                            const name = nameBuf.toString('utf8').trim();
                            if (name) {
                                areas.set(`${hash}:${name}`, { name, hash: hash as bigint });
                            }
                        }
                    }
                }
            }
            return areas.size ? [...areas.values()] : null;
        } catch {
            return null;
        }
    }

    private tryParseNavGetHashListAck(protoBase64: string, deviceKey: string): bigint[] | null {
        try {
            const buf = Buffer.from(protoBase64, 'base64');
            const fieldMaps = this.collectProtoFieldMapsFromBuffer(buf);
            for (const fields of fieldMaps) {
                // MctlNav field 31 = toapp_gethash_ack (NavGetHashListAck)
                // NavGetHashListAck.dataCouple (field 13) = packed repeated int64 hash values
                for (const ackBuf of fields.get(31) ?? []) {
                    if (!(ackBuf instanceof Buffer)) continue;
                    const ackFields = this.decodeProtoFields(ackBuf);
                    // sub_cmd=0 → mowing areas, sub_cmd=1 → obstacles, sub_cmd=2 → paths, etc.
                    // Only process area hashes (sub_cmd=0).
                    const subCmd = Number(ackFields.get(2)?.[0] ?? 0n);
                    const totalFrame = Number(ackFields.get(3)?.[0] ?? 1n);
                    const currentFrame = Number(ackFields.get(4)?.[0] ?? 1n);
                    const hashLen = Number(ackFields.get(6)?.[0] ?? 0n);
                    if (subCmd !== 0) {
                        continue;
                    }
                    const hashes: bigint[] = [];
                    for (const entry of ackFields.get(13) ?? []) {
                        if (entry instanceof Buffer) {
                            // Packed repeated int64: decode sequence of varints from the buffer
                            let p = 0;
                            while (p < entry.length) {
                                const [v, np] = this.decodeVarintAt(entry, p);
                                hashes.push(v);
                                p = np;
                            }
                        } else {
                            hashes.push(entry as bigint);
                        }
                    }
                    // hash_len tells us how many of the data_couple entries are actual mowing zones.
                    // The remaining entries are paths/obstacles mixed into the same message.
                    const zoneHashes = hashLen > 0 && hashes.length > hashLen ? hashes.slice(0, hashLen) : hashes;
                    this.log.debug(`[ZONE] ${hashes.length} hashes received (hashLen=${hashLen})`);
                    if (zoneHashes.length === 0) continue;

                    // If device sends only one frame, return immediately
                    if (totalFrame <= 1) return zoneHashes;

                    // Multi-frame: accumulate until all frames received
                    let acc = this.hashFrameAccumulator.get(deviceKey);
                    if (!acc || acc.totalFrame !== totalFrame) {
                        acc = { totalFrame, frames: new Map() };
                        this.hashFrameAccumulator.set(deviceKey, acc);
                    }
                    acc.frames.set(currentFrame, zoneHashes);
                    if (acc.frames.size < totalFrame) return null; // not all frames yet
                    // All frames received – combine and return
                    const allHashes: bigint[] = [];
                    for (let f = 1; f <= totalFrame; f++) {
                        allHashes.push(...(acc.frames.get(f) ?? []));
                    }
                    this.hashFrameAccumulator.delete(deviceKey);
                    this.log.debug(`[PROTO] NavGetHashListAck all ${totalFrame} frames received, ${allHashes.length} total hashes`);
                    return allHashes;
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    private async updateZoneStates(deviceKey: string, areas: Array<{ name: string; hash: bigint }>): Promise<void> {
        const channelId = `devices.${deviceKey}`;
        this.clearAreaNameRetry(deviceKey);

        const areasJson = JSON.stringify(areas.map(a => ({ name: a.name, hash: a.hash.toString() })));
        await this.setStateChangedAsync(`${channelId}.telemetry.areasJson`, areasJson, true);

        await this.extendObjectAsync(`${channelId}.zones`, { type: 'channel', common: { name: 'Zones' }, native: {} });
        const defaultOrder = [...areas]
            .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' }))
            .map((area, index) => ({ area, position: index + 1 }));
        const defaultPositionBySanitizedName = new Map(
            defaultOrder.map(entry => [this.sanitizeObjectId(entry.area.name), entry.position]),
        );

        for (const area of areas) {
            const sanitizedName = this.sanitizeObjectId(area.name);
            const zoneChannel = `${channelId}.zones.${sanitizedName}`;

            await this.extendObjectAsync(zoneChannel, { type: 'channel', common: { name: area.name }, native: {} });
            await this.setObjectNotExistsAsync(`${zoneChannel}.enabled`, this.createWritableBooleanState(`zone "${area.name}" active`, false));
            await this.setObjectAsync(`${zoneChannel}.start`, this.createCommandState(`Start zone "${area.name}"`));
            await this.setObjectNotExistsAsync(`${zoneChannel}.hash`, this.createReadonlyState(`zone "${area.name}" hash`, 'string', 'text'));
            await this.setObjectNotExistsAsync(
                `${zoneChannel}.position`,
                this.createWritableNumberState('Execution order', 'level', defaultPositionBySanitizedName.get(sanitizedName) ?? 1, {
                    min: 1,
                    max: 999,
                    step: 1,
                }),
            );

            await this.setStateChangedAsync(`${zoneChannel}.hash`, area.hash.toString(), true);
            if (!(await this.getStateAsync(`${zoneChannel}.enabled`))) {
                await this.setStateAsync(`${zoneChannel}.enabled`, false, true);
            }
            if (!(await this.getStateAsync(`${zoneChannel}.position`))) {
                await this.setStateAsync(`${zoneChannel}.position`, defaultPositionBySanitizedName.get(sanitizedName) ?? 1, true);
            }
        }

        await this.cleanupObsoleteZones(deviceKey, new Set(areas.map(area => this.sanitizeObjectId(area.name))));
        this.log.debug(`${deviceKey}: ${areas.length} zone(s) updated.`);
    }

    private rememberAreaNames(deviceKey: string, areas: Array<{ name: string; hash: bigint }>): void {
        let cached = this.pendingAreaNamesByDevice.get(deviceKey);
        if (!cached) {
            cached = new Map<string, string>();
            this.pendingAreaNamesByDevice.set(deviceKey, cached);
        }
        for (const area of areas) {
            const key = area.hash.toString();
            if (!cached.has(key) || cached.get(key) !== area.name) {
                cached.set(key, area.name);
            }
        }
    }

    private async cleanupObsoleteZones(deviceKey: string, activeSanitizedZoneIds: Set<string>): Promise<void> {
        const zonesRoot = `devices.${deviceKey}.zones`;
        const zoneChannels = await this.getChannelsOfAsync(zonesRoot);
        for (const channel of zoneChannels) {
            const fullId = channel._id || '';
            const localId = fullId.startsWith(`${this.namespace}.`) ? fullId.slice(this.namespace.length + 1) : fullId;
            const suffix = localId.startsWith(`${zonesRoot}.`) ? localId.slice(zonesRoot.length + 1) : '';
            if (!suffix || suffix.includes('.')) {
                continue;
            }
            if (!activeSanitizedZoneIds.has(suffix)) {
                await this.deleteObjectTree(localId);
            }
        }
    }

    private async deleteObjectTree(rootLocalId: string): Promise<void> {
        try {
            const prefix = `${this.namespace}.${rootLocalId}`;
            const list = await this.getObjectListAsync({
                startkey: `${prefix}.`,
                endkey: `${prefix}.\u9999`,
            });
            const ids = (list.rows || [])
                .map(row => row.id)
                .filter((id): id is string => typeof id === 'string');
            ids.push(prefix);
            ids.sort((a, b) => b.length - a.length);
            for (const id of ids) {
                const local = id.startsWith(`${this.namespace}.`) ? id.slice(this.namespace.length + 1) : id;
                try {
                    await this.delObjectAsync(local);
                } catch {
                    // Ignore missing/dependency errors while pruning obsolete zones
                }
            }
        } catch (err) {
            this.log.debug(`Could not delete obsolete zone tree ${rootLocalId} delete: ${this.extractAxiosError(err)}`);
        }
    }

    private async hasKnownAreas(deviceKey: string): Promise<boolean> {
        const areasJsonState = await this.getStateAsync(`devices.${deviceKey}.telemetry.areasJson`);
        const raw = areasJsonState?.val;
        if (typeof raw !== 'string' || !raw.trim()) {
            return false;
        }
        try {
            const parsed = JSON.parse(raw) as Array<{ hash?: string }>;
            return Array.isArray(parsed) && parsed.length > 0;
        } catch {
            return false;
        }
    }

    private clearAreaNameRetry(deviceKey: string): void {
        const timer = this.areaNameRetryTimers.get(deviceKey);
        if (timer) {
            clearTimeout(timer);
            this.areaNameRetryTimers.delete(deviceKey);
        }
        this.areaNameRetryAttempts.delete(deviceKey);
    }

    private startAreaNameRetry(deviceKey: string): void {
        this.clearAreaNameRetry(deviceKey);
        this.areaNameRetryAttempts.set(deviceKey, 0);
        this.scheduleAreaNameRetry(deviceKey);
    }

    private scheduleAreaNameRetry(deviceKey: string): void {
        const attempt = this.areaNameRetryAttempts.get(deviceKey) ?? 0;
        if (attempt >= AREA_NAME_RETRY_DELAYS_MS.length) {
            this.clearAreaNameRetry(deviceKey);
            return;
        }
        const delay = AREA_NAME_RETRY_DELAYS_MS[attempt];
        const timer = setTimeout(() => {
            void this.runAreaNameRetry(deviceKey);
        }, delay);
        this.areaNameRetryTimers.set(deviceKey, timer);
        this.areaNameRetryAttempts.set(deviceKey, attempt + 1);
    }

    private async runAreaNameRetry(deviceKey: string): Promise<void> {
        this.areaNameRetryTimers.delete(deviceKey);
        if (await this.hasKnownAreas(deviceKey)) {
            this.clearAreaNameRetry(deviceKey);
            return;
        }

        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            this.clearAreaNameRetry(deviceKey);
            return;
        }

        const attempt = this.areaNameRetryAttempts.get(deviceKey) ?? 0;
        this.log.debug(`[AREA-REQ] retry ${attempt}/${AREA_NAME_RETRY_DELAYS_MS.length} for ${ctx.deviceName || ctx.iotId}`);
        try {
            await this.sendAreaNameListRequest(ctx);
        } catch (err) {
            this.log.debug(`[AREA-REQ] retry failed for ${ctx.deviceName || ctx.iotId}: ${this.extractAxiosError(err)}`);
        }

        if (await this.hasKnownAreas(deviceKey)) {
            this.clearAreaNameRetry(deviceKey);
            return;
        }
        this.scheduleAreaNameRetry(deviceKey);
    }

    private async collectOrderedZoneHashes(
        deviceKey: string,
        areas: Array<{ name: string; hash: string }>,
        predicate: (area: { name: string; hash: string }) => Promise<boolean>,
    ): Promise<bigint[]> {
        const selected: Array<{ hash: bigint; position: number; name: string }> = [];

        for (const area of areas) {
            if (!(await predicate(area))) {
                continue;
            }
            const sanitizedName = this.sanitizeObjectId(area.name);
            const positionState = await this.getStateAsync(`devices.${deviceKey}.zones.${sanitizedName}.position`);
            const rawPosition = Number(positionState?.val);
            const position = Number.isFinite(rawPosition) ? Math.max(1, Math.trunc(rawPosition)) : Number.MAX_SAFE_INTEGER;
            selected.push({
                hash: BigInt(area.hash),
                position,
                name: area.name,
            });
        }

        selected.sort((a, b) => {
            if (a.position !== b.position) {
                return a.position - b.position;
            }
            return a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' });
        });
        return selected.map(entry => entry.hash);
    }

    private async readBaseRouteSettings(deviceKey: string): Promise<Omit<RouteSettings, 'areaHashes'>> {
        const cutHeightMm = await this.readNumericCommandState(deviceKey, 'bladeHeightMm', 65);
        const mowSpeedMs = await this.readNumericCommandState(deviceKey, 'targetMowSpeedMs', 0.3);
        const routeJobMode = await this.readNumericCommandState(deviceKey, 'routeJobMode', 4);
        const routeJobVersion = await this.readNumericCommandState(deviceKey, 'routeJobVersion', 1);
        const routeJobId = await this.readNumericCommandState(deviceKey, 'routeJobId', 0);
        const routeUltraWave = await this.readNumericCommandState(deviceKey, 'routeUltraWave', 2);
        const routeChannelMode = await this.readNumericCommandState(deviceKey, 'routeChannelMode', 0);
        const routeChannelWidthCm = await this.readNumericCommandState(deviceKey, 'routeChannelWidthCm', 25);
        const routeTowardDeg = await this.readNumericCommandState(deviceKey, 'routeTowardDeg', 0);
        const routeTowardIncludedAngleDeg = await this.readNumericCommandStateWithFallback(
            deviceKey,
            ['routeTowardIncludedAngleDeg', 'routeTowardIncludedAngelDeg', 'routeTowardIncludedAngle', 'routeTowardIncludedAngel'],
            0,
        );
        const routeTowardMode = await this.readNumericCommandState(deviceKey, 'routeTowardMode', 0);
        const routeMowingLaps = await this.readNumericCommandState(deviceKey, 'routeMowingLaps', 1);
        const routeBorderMode = await this.readNumericCommandState(deviceKey, 'routeBorderMode', 1);
        const routeObstacleLaps = await this.readNumericCommandState(deviceKey, 'routeObstacleLaps', 1);
        const routeCollectGrassFrequency = await this.readNumericCommandState(deviceKey, 'routeCollectGrassFrequency', 10);
        const routeStartProgress = await this.readNumericCommandState(deviceKey, 'routeStartProgress', 0);
        const routeRideBoundaryDistance = await this.readNumericCommandState(deviceKey, 'routeRideBoundaryDistance', 0);
        const routeIsMow = await this.readBooleanCommandState(deviceKey, 'routeIsMow', true);
        const routeIsDump = await this.readBooleanCommandState(deviceKey, 'routeIsDump', true);
        const routeIsEdge = await this.readBooleanCommandState(deviceKey, 'routeIsEdge', false);
        const context = this.deviceContexts.get(deviceKey);
        const limits = this.getDeviceCommandLimits(context);

        return {
            cutHeightMm: this.normalizeCutHeightMm(cutHeightMm, context),
            mowSpeedMs: Number(Math.min(limits.mowSpeed.max, Math.max(limits.mowSpeed.min, mowSpeedMs)).toFixed(2)),
            jobMode: Math.min(10, Math.max(0, Math.trunc(routeJobMode))),
            jobVersion: Math.max(1, Math.trunc(routeJobVersion)),
            jobId: Math.max(1, Math.trunc(routeJobId) || Date.now()),
            ultraWave: Math.min(20, Math.max(0, Math.trunc(routeUltraWave))),
            channelMode: Math.min(3, Math.max(0, Math.trunc(routeChannelMode))),
            channelWidthCm: this.normalizeRouteChannelWidthCm(routeChannelWidthCm, context),
            towardDeg: Math.min(180, Math.max(-180, Math.trunc(routeTowardDeg))),
            towardIncludedAngleDeg: Math.min(180, Math.max(-180, Math.trunc(routeTowardIncludedAngleDeg))),
            towardMode: Math.min(2, Math.max(0, Math.trunc(routeTowardMode))),
            mowingLaps: Math.min(ROUTE_MOWING_LAPS_MAX, Math.max(0, Math.trunc(routeMowingLaps))),
            borderMode: Math.min(1, Math.max(0, Math.trunc(routeBorderMode))),
            obstacleLaps: Math.min(ROUTE_OBSTACLE_LAPS_MAX, Math.max(0, Math.trunc(routeObstacleLaps))),
            collectGrassFrequency: Math.min(100, Math.max(0, Math.trunc(routeCollectGrassFrequency))),
            startProgress: Math.min(100, Math.max(0, Math.trunc(routeStartProgress))),
            rideBoundaryDistance: Number(Math.min(1000, Math.max(0, routeRideBoundaryDistance)).toFixed(2)),
            isMow: routeIsMow,
            isDump: routeIsDump,
            isEdge: routeIsEdge,
        };
    }

    private async handleStartZones(deviceKey: string, localId: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, `Unknown device: ${deviceKey}`, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }

        try {
            const areasJsonState = await this.getStateAsync(`devices.${deviceKey}.telemetry.areasJson`);
            if (!areasJsonState?.val) {
                throw new Error('No zones known. Please run "requestAreaNames" first.');
            }

            const areas = JSON.parse(`${areasJsonState.val}`) as Array<{ name: string; hash: string }>;
            const areaHashes = await this.collectOrderedZoneHashes(deviceKey, areas, area => {
                const sanitizedName = this.sanitizeObjectId(area.name);
                return this.getStateAsync(`devices.${deviceKey}.zones.${sanitizedName}.enabled`).then(state => state?.val === true);
            });

            if (!areaHashes.length) {
                throw new Error('No zone enabled. Please enable at least one zone under devices.<id>.zones.<name>.enabled.');
            }

            const base = await this.readBaseRouteSettings(deviceKey);
            const routeSettings: RouteSettings = { ...base, areaHashes };

            const result = await this.applyRouteSelectionAndStart(ctx, deviceKey, routeSettings, 'startZones');

            const now = Date.now();
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            await this.setStateChangedAsync(localId, false, true);
            this.log.info(`startZones for ${ctx.deviceName || ctx.iotId}: ${areaHashes.length} zone(s) sent.`);
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            this.log.error(`startZones failed: ${msg}`);
        }
    }

    private async handleStartAllZones(deviceKey: string, localId: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, `Unknown device: ${deviceKey}`, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }

        try {
            const areasJsonState = await this.getStateAsync(`devices.${deviceKey}.telemetry.areasJson`);
            if (!areasJsonState?.val) {
                throw new Error('No zones known. Please run "requestAreaNames" first.');
            }

            const areas = JSON.parse(`${areasJsonState.val}`) as Array<{ name: string; hash: string }>;
            const areaHashes = await this.collectOrderedZoneHashes(deviceKey, areas, async () => true);

            if (!areaHashes.length) {
                throw new Error('No zones found.');
            }

            const base = await this.readBaseRouteSettings(deviceKey);
            const routeSettings: RouteSettings = { ...base, areaHashes };

            const result = await this.applyRouteSelectionAndStart(ctx, deviceKey, routeSettings, 'startAllZones');
            const now = Date.now();
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            await this.setStateChangedAsync(localId, false, true);
            this.log.info(`startAllZones for ${ctx.deviceName || ctx.iotId}: ${areaHashes.length} zone(s) sent.`);
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            this.log.error(`startAllZones failed: ${msg}`);
        }
    }

    private async handleStartSingleZone(deviceKey: string, zoneSanitizedName: string, localId: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, `Unknown device: ${deviceKey}`, true);
            await this.setStateChangedAsync(localId, false, true);
            return;
        }

        try {
            const hashState = await this.getStateAsync(`devices.${deviceKey}.zones.${zoneSanitizedName}.hash`);
            if (!hashState?.val) {
                throw new Error(`No hash found for zone "${zoneSanitizedName}".`);
            }

            const areaHashes = [BigInt(`${hashState.val}`)];
            const base = await this.readBaseRouteSettings(deviceKey);
            const routeSettings: RouteSettings = { ...base, areaHashes };

            const result = await this.applyRouteSelectionAndStart(ctx, deviceKey, routeSettings, 'startSingleZone');

            const now = Date.now();
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            await this.setStateChangedAsync(localId, false, true);
            this.log.info(`startSingleZone for ${ctx.deviceName || ctx.iotId}: zone "${zoneSanitizedName}" sent.`);
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            await this.setStateChangedAsync(localId, false, true);
            this.log.error(`startSingleZone failed: ${msg}`);
        }
    }

    private async applyRouteSelectionAndStart(
        context: DeviceContext,
        deviceKey: string,
        routeSettings: RouteSettings,
        label: string,
    ): Promise<string> {
        const routePayload = this.createRoutePayloadObject(routeSettings, {
            action: 'startRoute',
            mode: 'generate',
            step: 'route-generate',
            label,
            routeReceiver: this.getReceiverDevice(context),
            startReceiver: this.getReceiverDevice(context),
            start: true,
        });
        const routeDebugInfo = JSON.stringify(routePayload);
        await this.setStateChangedAsync(
            `devices.${deviceKey}.commands.routeAreaIds`,
            routeSettings.areaHashes.map(hash => hash.toString()).join(','),
            true,
        );
        await this.setStateChangedAsync(`devices.${deviceKey}.commands.debugLastZoneStartJson`, routeDebugInfo, true);
        await this.storeCommandPayload(deviceKey, routePayload);

        const routeResult = await this.executeEncodedContentCommand(context, `${label}-route`, (session, ctx) => {
            const payload = this.buildRoutePlanningContent(session, ctx, routeSettings, 'generate');
            void this.setStateChangedAsync(`devices.${deviceKey}.commands.debugLastRoutePayload`, payload, true);
            return payload;
        });

        const bladeResult = await this.executeEncodedContentCommand(context, `${label}-blade-height`, (session, ctx) => {
            const payload = this.buildSetBladeHeightContent(session, routeSettings.cutHeightMm);
            void this.setStateChangedAsync(`devices.${deviceKey}.commands.debugLastBladePayload`, payload, true);
            return payload;
        });

        const startResult = await this.executeEncodedContentCommand(context, `${label}-start-job`, (session, ctx) => {
            const payload = this.buildTaskControlContent(session, ctx, 'start');
            void this.setStateChangedAsync(`devices.${deviceKey}.commands.debugLastStartPayload`, payload, true);
            return payload;
        });

        return `route:${routeResult};blade:${bladeResult};start:${startResult}`;
    }

    private async handlePayloadCommand(deviceKey: string, localId: string, jsonStr: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, `Unknown device: ${deviceKey}`, true);
            return;
        }

        try {
            const payload = JSON.parse(jsonStr) as RoutePayloadInput;
            const payloadDeviceCommand = this.resolvePayloadDeviceCommand(payload);
            if (payloadDeviceCommand) {
                await this.storeCommandPayload(deviceKey, {
                    action: payloadDeviceCommand,
                    step: 'task-control',
                    label: payload.label ?? payloadDeviceCommand,
                });

                const result = await this.executeTaskControlCommand(ctx, payloadDeviceCommand);
                const now = Date.now();
                await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
                await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
                await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
                await this.setStateChangedAsync(localId, jsonStr, true);
                if (localId.endsWith('.routePayloadJson')) {
                    await this.setStateChangedAsync(`devices.${deviceKey}.commands.payload`, jsonStr, true);
                } else {
                    await this.setStateChangedAsync(`devices.${deviceKey}.commands.routePayloadJson`, jsonStr, true);
                }
                this.log.info(`Payload command for ${ctx.deviceName || ctx.iotId} sent (${payloadDeviceCommand}).`);
                await this.requestIotSync(ctx);
                await this.refreshTelemetryAfterCommand();
                return;
            }

            const routeSettings = await this.buildRouteSettingsFromPayload(deviceKey, payload);
            const executeStart = this.shouldExecuteStartFromPayload(payload);
            const routeMode = this.resolvePayloadRouteMode(payload);

            await this.storeCommandPayload(
                deviceKey,
                this.createRoutePayloadObject(routeSettings, {
                    action: executeStart ? 'startRoute' : `${routeMode}Route`,
                    mode: executeStart ? 'generate' : routeMode,
                    step: executeStart ? 'route-generate' : 'route-command',
                    label: payload.label ?? payload.action ?? (executeStart ? 'payload-startRoute' : `payload-${routeMode}`),
                    routeReceiver: this.getReceiverDevice(ctx),
                    startReceiver: this.getReceiverDevice(ctx),
                    start: executeStart,
                }),
            );

            const result = executeStart
                ? await this.applyRouteSelectionAndStart(ctx, deviceKey, routeSettings, 'payload')
                : await this.executeEncodedContentCommand(ctx, 'payload-route', (session, context) =>
                      this.buildRoutePlanningContent(session, context, routeSettings, routeMode),
                  );

            const now = Date.now();
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastResult`, result, true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, '', true);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastTimestamp`, now, true);
            await this.setStateChangedAsync(localId, jsonStr, true);
            if (localId.endsWith('.routePayloadJson')) {
                await this.setStateChangedAsync(`devices.${deviceKey}.commands.payload`, jsonStr, true);
            } else {
                await this.setStateChangedAsync(`devices.${deviceKey}.commands.routePayloadJson`, jsonStr, true);
            }
            this.log.info(`Payload command for ${ctx.deviceName || ctx.iotId} sent (${executeStart ? 'startRoute' : routeMode}).`);
            await this.requestIotSync(ctx);
            await this.refreshTelemetryAfterCommand();
        } catch (err) {
            const msg = this.extractAxiosError(err);
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastError`, msg, true);
            this.log.error(`Payload command failed: ${msg}`);
        }
    }

    private async buildRouteSettingsFromPayload(deviceKey: string, payload: RoutePayloadInput): Promise<RouteSettings> {
        const base = await this.readBaseRouteSettings(deviceKey);
        let areaHashes = this.parsePayloadAreaHashes(payload.areaHashes);

        if (!areaHashes.length && typeof payload.routeAreaIds === 'string') {
            areaHashes = this.parseAreaHashes(payload.routeAreaIds);
        }
        if (!areaHashes.length && typeof payload.routeAreasCsv === 'string') {
            areaHashes = this.parseAreaHashes(payload.routeAreasCsv);
        }
        if (!areaHashes.length) {
            const routeAreaIds = await this.readStringCommandState(deviceKey, 'routeAreaIds', '');
            if (routeAreaIds) {
                areaHashes = this.parseAreaHashes(routeAreaIds);
            }
        }
        if (!areaHashes.length) {
            throw new Error('payload: "areaHashes" is missing or empty.');
        }

        const context = this.deviceContexts.get(deviceKey);
        const limits = this.getDeviceCommandLimits(context);
        const cutHeightRaw = payload.cutHeightMm ?? payload.targetCutHeightMm ?? payload.bladeHeightMm ?? base.cutHeightMm;
        const mowSpeedRaw = payload.mowSpeedMs ?? payload.targetMowSpeedMs ?? base.mowSpeedMs;
        return {
            areaHashes,
            cutHeightMm: this.normalizeCutHeightMm(cutHeightRaw, context),
            mowSpeedMs: Number(Math.min(limits.mowSpeed.max, Math.max(limits.mowSpeed.min, mowSpeedRaw)).toFixed(2)),
            jobMode: Math.min(10, Math.max(0, Math.trunc(payload.jobMode ?? payload.routeJobMode ?? base.jobMode))),
            jobVersion: Math.max(1, Math.trunc(payload.jobVersion ?? payload.routeJobVersion ?? base.jobVersion)),
            jobId: Math.max(1, Math.trunc(payload.jobId ?? payload.routeJobId ?? base.jobId) || Date.now()),
            ultraWave: Math.min(20, Math.max(0, Math.trunc(payload.ultraWave ?? payload.routeUltraWave ?? base.ultraWave))),
            channelMode: Math.min(3, Math.max(0, Math.trunc(payload.channelMode ?? payload.routeChannelMode ?? base.channelMode))),
            channelWidthCm: this.normalizeRouteChannelWidthCm(payload.channelWidthCm ?? payload.routeChannelWidthCm ?? base.channelWidthCm, context),
            towardDeg: Math.min(180, Math.max(-180, Math.trunc(payload.towardDeg ?? payload.routeTowardDeg ?? base.towardDeg))),
            towardIncludedAngleDeg: Math.min(
                180,
                Math.max(
                    -180,
                    Math.trunc(
                        payload.towardIncludedAngleDeg ??
                            payload.routeTowardIncludedAngleDeg ??
                            payload.routeTowardIncludedAngelDeg ??
                            base.towardIncludedAngleDeg,
                    ),
                ),
            ),
            towardMode: Math.min(2, Math.max(0, Math.trunc(payload.towardMode ?? payload.routeTowardMode ?? base.towardMode))),
            mowingLaps: Math.min(
                ROUTE_MOWING_LAPS_MAX,
                Math.max(0, Math.trunc(payload.mowingLaps ?? payload.routeMowingLaps ?? base.mowingLaps)),
            ),
            borderMode: Math.min(1, Math.max(0, Math.trunc(payload.borderMode ?? payload.routeBorderMode ?? base.borderMode))),
            obstacleLaps: Math.min(
                ROUTE_OBSTACLE_LAPS_MAX,
                Math.max(0, Math.trunc(payload.obstacleLaps ?? payload.routeObstacleLaps ?? base.obstacleLaps)),
            ),
            collectGrassFrequency: Math.min(
                100,
                Math.max(0, Math.trunc(payload.collectGrassFrequency ?? payload.routeCollectGrassFrequency ?? base.collectGrassFrequency)),
            ),
            startProgress: Math.min(100, Math.max(0, Math.trunc(payload.startProgress ?? payload.routeStartProgress ?? base.startProgress))),
            rideBoundaryDistance: Number(
                Math.min(1000, Math.max(0, payload.rideBoundaryDistance ?? payload.routeRideBoundaryDistance ?? base.rideBoundaryDistance)).toFixed(2),
            ),
            isMow: payload.isMow ?? payload.routeIsMow ?? base.isMow,
            isDump: payload.isDump ?? payload.routeIsDump ?? base.isDump,
            isEdge: payload.isEdge ?? payload.routeIsEdge ?? base.isEdge,
        };
    }

    private parsePayloadAreaHashes(areaHashes: unknown): bigint[] {
        if (!Array.isArray(areaHashes)) {
            return [];
        }
        return areaHashes
            .map(hash => `${hash ?? ''}`.trim())
            .filter(Boolean)
            .map(hash => BigInt(hash));
    }

    private shouldExecuteStartFromPayload(payload: RoutePayloadInput): boolean {
        if (payload.start === true || payload.executeStart === true) {
            return true;
        }
        const key = `${payload.action ?? payload.label ?? ''}`.trim().toLowerCase();
        return key.includes('start');
    }

    private resolvePayloadRouteMode(payload: RoutePayloadInput): RouteCommandMode {
        const rawMode = `${payload.mode ?? payload.commandMode ?? payload.action ?? ''}`.trim().toLowerCase();
        if (rawMode.includes('query')) {
            return 'query';
        }
        if (rawMode.includes('generate')) {
            return 'generate';
        }
        return 'modify';
    }

    private resolvePayloadDeviceCommand(payload: RoutePayloadInput): DeviceCommand | null {
        const key = `${payload.action ?? payload.label ?? ''}`.trim().toLowerCase();
        switch (key) {
            case 'start':
            case 'pause':
            case 'resume':
            case 'stop':
            case 'dock':
            case 'canceljob':
            case 'canceldock':
                return key as DeviceCommand;
            default:
                return null;
        }
    }

    private createRoutePayloadObject(
        routeSettings: RouteSettings,
        options: {
            action: string;
            mode: RouteCommandMode;
            step: string;
            label: string;
            routeReceiver: number;
            startReceiver: number;
            start?: boolean;
        },
    ): RoutePayloadInput {
        return {
            action: options.action,
            mode: options.mode,
            step: options.step,
            label: options.label,
            start: options.start ?? false,
            areaHashes: routeSettings.areaHashes.map(hash => hash.toString()),
            cutHeightMm: routeSettings.cutHeightMm,
            mowSpeedMs: routeSettings.mowSpeedMs,
            jobId: routeSettings.jobId,
            jobVersion: routeSettings.jobVersion,
            jobMode: routeSettings.jobMode,
            mowingLaps: routeSettings.mowingLaps,
            obstacleLaps: routeSettings.obstacleLaps,
            channelWidthCm: routeSettings.channelWidthCm,
            ultraWave: routeSettings.ultraWave,
            channelMode: routeSettings.channelMode,
            towardDeg: routeSettings.towardDeg,
            towardIncludedAngleDeg: routeSettings.towardIncludedAngleDeg,
            towardMode: routeSettings.towardMode,
            rideBoundaryDistance: routeSettings.rideBoundaryDistance,
            routeReceiver: options.routeReceiver,
            startReceiver: options.startReceiver,
        };
    }

    private async storeCommandPayload(deviceKey: string, payload: RoutePayloadInput): Promise<void> {
        const payloadJson = JSON.stringify(payload);
        await this.setStateChangedAsync(`devices.${deviceKey}.commands.payload`, payloadJson, true);
        if (Array.isArray(payload.areaHashes) && payload.areaHashes.length > 0) {
            await this.setStateChangedAsync(`devices.${deviceKey}.commands.routePayloadJson`, payloadJson, true);
        }
        await this.setStateChangedAsync(`devices.${deviceKey}.commands.lastPayload`, payloadJson, true);
    }

    // ─── End zone / area name support ────────────────────────────────────────────

    private encodeMessage(fields: Buffer[]): Buffer {
        return Buffer.concat(fields);
    }

    private encodeFieldVarint(fieldNumber: number, value: number | bigint): Buffer {
        const tag = (fieldNumber << 3) | 0;
        return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(value)]);
    }

    private encodeFieldInt32(fieldNumber: number, value: number): Buffer {
        const tag = (fieldNumber << 3) | 0;
        let v = BigInt(Math.trunc(value));
        if (v < 0n) {
            v = (1n << 64n) + v;
        }
        return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(v)]);
    }

    private encodeFieldBytes(fieldNumber: number, value: Buffer): Buffer {
        const tag = (fieldNumber << 3) | 2;
        return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(value.length), value]);
    }

    private encodeFieldRawBytes(fieldNumber: number, value: Buffer): Buffer {
        const tag = (fieldNumber << 3) | 2;
        return Buffer.concat([this.encodeVarint(tag), this.encodeVarint(value.length), value]);
    }

    private encodeFieldString(fieldNumber: number, value: string): Buffer {
        return this.encodeFieldRawBytes(fieldNumber, Buffer.from(value, 'utf8'));
    }

    private encodeFieldFixed64(fieldNumber: number, value: bigint): Buffer {
        const tag = (fieldNumber << 3) | 1;
        const payload = Buffer.allocUnsafe(8);
        const normalized = BigInt.asUintN(64, value);
        payload.writeBigUInt64LE(normalized, 0);
        return Buffer.concat([this.encodeVarint(tag), payload]);
    }

    private encodeFieldFloat32(fieldNumber: number, value: number): Buffer {
        const tag = (fieldNumber << 3) | 5;
        const payload = Buffer.allocUnsafe(4);
        payload.writeFloatLE(value, 0);
        return Buffer.concat([this.encodeVarint(tag), payload]);
    }

    private encodeVarint(value: number | bigint): Buffer {
        let v = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
        if (v < 0n) {
            v = 0n;
        }
        const bytes: number[] = [];
        while (v > 127n) {
            bytes.push(Number(v & 0x7fn) | 0x80);
            v >>= 7n;
        }
        bytes.push(Number(v));
        return Buffer.from(bytes);
    }

    private async ensureBaseStates(): Promise<void> {
        await this.setObjectNotExistsAsync('info.connection', this.createReadonlyState('If connected to service', 'boolean', 'indicator.connected'));
        await this.setObjectNotExistsAsync('info.mqttConnected', this.createReadonlyState('If MQTT is connected', 'boolean', 'indicator.connected'));
        await this.setObjectNotExistsAsync('info.deviceCount', this.createReadonlyState('Number of discovered devices', 'number', 'value'));
        await this.setObjectNotExistsAsync('info.lastMessageTs', this.createReadonlyState('Last MQTT message timestamp', 'number', 'value.time'));
        await this.setObjectNotExistsAsync('info.lastError', this.createReadonlyState('Last error', 'string', 'text'));

        await this.setObjectNotExistsAsync('account.expiresAt', this.createReadonlyState('Access token expiry', 'number', 'value.time'));
        await this.setObjectNotExistsAsync('account.userId', this.createReadonlyState('Account user id', 'string', 'text'));
        await this.setObjectNotExistsAsync('account.userAccount', this.createReadonlyState('Account user account', 'string', 'text'));
        await this.setObjectNotExistsAsync('account.iotDomain', this.createReadonlyState('IoT API domain', 'string', 'text'));
    }

    private createReadonlyState(
        name: string,
        type: ioBroker.CommonType,
        role: string,
        states?: Record<number, string>,
        expert = false,
    ): ioBroker.SettableObject {
        return {
            type: 'state',
            common: {
                name,
                type,
                role,
                read: true,
                write: false,
                states: states ? this.normalizeStatesMap(states) : undefined,
                expert: expert || undefined,
            },
            native: {},
        };
    }

    private async ensureDeviceStateObjects(channelId: string): Promise<void> {
        await this.setObjectNotExistsAsync(`${channelId}.name`, this.createReadonlyState('Name', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.iotId`, this.createReadonlyState('IoT ID', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.deviceId`, this.createReadonlyState('Device ID', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.deviceType`, this.createReadonlyState('Device type', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.deviceTypeText`, this.createReadonlyState('Device type text', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.series`, this.createReadonlyState('Series', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.productSeries`, this.createReadonlyState('Product series', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.productKey`, this.createReadonlyState('Product key', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.productKeyGroup`, this.createReadonlyState('Product key group', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.recordDeviceName`, this.createReadonlyState('Record device name', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.status`, this.createReadonlyState('Status', 'number', 'value'));
        await this.setObjectNotExistsAsync(`${channelId}.raw`, this.createReadonlyState('Raw device payload', 'string', 'json'));

        await this.extendObjectAsync(`${channelId}.telemetry`, { type: 'channel', common: { name: 'Telemetry' }, native: {} });
        await this.setObjectNotExistsAsync(
            `${channelId}.telemetry.connected`,
            this.createReadonlyState('Device online', 'boolean', 'indicator.reachable'),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.telemetry.batteryPercent`,
            this.createReadonlyState('Battery percent', 'number', 'value.battery'),
        );
        await this.removeLegacyState(`${channelId}.telemetry.knifeHeightMm`);
        await this.setObjectNotExistsAsync(
            `${channelId}.telemetry.bladeHeightMm`,
            this.createReadonlyState('Blade height', 'number', 'value.distance'),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.telemetry.deviceState`,
            this.createReadonlyState('Device state', 'number', 'value', WORK_MODE_NAMES),
        );
        await this.removeLegacyState(`${channelId}.telemetry.deviceStateText`);
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.latitude`, this.createReadonlyState('Latitude', 'number', 'value.gps.latitude'));
        await this.setObjectNotExistsAsync(
            `${channelId}.telemetry.longitude`,
            this.createReadonlyState('Longitude', 'number', 'value.gps.longitude'),
        );
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastTopic`, this.createReadonlyState('Last MQTT topic', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastPayload`, this.createReadonlyState('Last MQTT payload (debug)', 'string', 'json'));
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastEventId`, this.createReadonlyState('Last event identifier', 'string', 'text'));
        await this.setObjectNotExistsAsync(
            `${channelId}.telemetry.lastProtoContent`,
            this.createReadonlyState('Last protobuf content (base64, debug)', 'string', 'text'),
        );
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.lastUpdate`, this.createReadonlyState('Last telemetry timestamp', 'number', 'value.time'));
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.firmwareVersion`, this.createReadonlyState('Firmware version', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.wifiRssi`, this.createReadonlyState('WiFi RSSI', 'number', 'value'));
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.totalWorkTimeSec`, this.createReadonlyState('Total work time (seconds)', 'number', 'value.interval'));
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.totalMileageM`, this.createReadonlyState('Total mileage (meters)', 'number', 'value.distance'));
        await this.setObjectNotExistsAsync(`${channelId}.telemetry.taskAreaM2`, this.createReadonlyState('Current task area (m²)', 'number', 'value'));

        await this.extendObjectAsync(`${channelId}.commands`, { type: 'channel', common: { name: 'Commands' }, native: {} });
        await this.setObjectNotExistsAsync(`${channelId}.commands.start`, this.createCommandState('Start mowing'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.pause`, this.createCommandState('Pause mowing'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.resume`, this.createCommandState('Resume mowing'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.stop`, this.createCommandState('Stop mowing'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.dock`, this.createCommandState('Return to dock'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.cancelJob`, this.createCommandState('Cancel current job'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.cancelDock`, this.createCommandState('Cancel return to dock'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.generateRoute`, this.createCommandState('Generate route', true));
        await this.setObjectNotExistsAsync(`${channelId}.commands.modifyRoute`, this.createCommandState('Modify route', true));
        await this.setObjectNotExistsAsync(`${channelId}.commands.queryRoute`, this.createCommandState('Query route', true));
        await this.setObjectNotExistsAsync(`${channelId}.commands.applyNonWorkHours`, this.createCommandState('Set non-work hours', true));
        await this.setObjectNotExistsAsync(`${channelId}.commands.applyBladeControl`, this.createCommandState('Start/stop blades', true));
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.targetMowSpeedMs`,
            this.createWritableNumberState('Target mowing speed', 'value.speed', 0.3, { unit: 'm/s', min: 0.1, max: 1, step: 0.01 }),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeAreaIds`,
            this.createWritableStringState('Area hash IDs (comma-separated)', 'text', '', true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeJobMode`,
            this.createWritableNumberState('Route job mode', 'level', 4, { min: 0, max: 10, step: 1 }, ROUTE_JOB_MODE_NAMES, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeJobVersion`,
            this.createWritableNumberState('Route job version', 'level', 1, { min: 1, max: 1000000, step: 1 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeJobId`,
            this.createWritableNumberState('Route job id', 'level', 0, { min: 0, max: 9_000_000_000_000_000, step: 1 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeUltraWave`,
            this.createWritableNumberState('Obstacle mode', 'level', 2, { min: 0, max: 20, step: 1 }, ROUTE_ULTRAWAVE_MODE_NAMES),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeChannelMode`,
            this.createWritableNumberState('Route pattern mode', 'level', 0, { min: 0, max: 3, step: 1 }, ROUTE_CHANNEL_MODE_NAMES),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeChannelWidthCm`,
            this.createWritableNumberState('Route spacing', 'value.distance', 25, {
                unit: 'cm',
                min: ROUTE_CHANNEL_WIDTH_MIN_CM,
                max: ROUTE_CHANNEL_WIDTH_MAX_CM,
                step: 1,
            }),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeTowardDeg`,
            this.createWritableNumberState('Route angle', 'value', 0, { unit: 'deg', min: -180, max: 180, step: 1 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeTowardIncludedAngleDeg`,
            this.createWritableNumberState('Cross angle', 'value', 0, { unit: 'deg', min: -180, max: 180, step: 1 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeTowardMode`,
            this.createWritableNumberState('Route angle mode', 'level', 0, { min: 0, max: 2, step: 1 }, ROUTE_TOWARD_MODE_NAMES, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeMowingLaps`,
            this.createWritableNumberState('Mowing laps', 'level', 1, { min: 0, max: ROUTE_MOWING_LAPS_MAX, step: 1 }),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeBorderMode`,
            this.createWritableNumberState('Border mode', 'level', 1, { min: 0, max: 1, step: 1 }, ROUTE_BORDER_MODE_NAMES, true),
        );
        await this.removeLegacyState(`${channelId}.commands.routeJobModeText`);
        await this.removeLegacyState(`${channelId}.commands.routeUltraWaveText`);
        await this.removeLegacyState(`${channelId}.commands.routeChannelModeText`);
        await this.removeLegacyState(`${channelId}.commands.routeTowardModeText`);
        await this.removeLegacyState(`${channelId}.commands.routeBorderModeText`);
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeObstacleLaps`,
            this.createWritableNumberState('Obstacle laps', 'level', 1, { min: 0, max: ROUTE_OBSTACLE_LAPS_MAX, step: 1 }),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeCollectGrassFrequency`,
            this.createWritableNumberState('Collect frequency', 'level', 10, { min: 0, max: 100, step: 1 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routeStartProgress`,
            this.createWritableNumberState('Start progress', 'value', 0, { unit: '%', min: 0, max: 100, step: 1 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(`${channelId}.commands.routeIsMow`, this.createWritableBooleanState('Route mowing enabled', true, true));
        await this.setObjectNotExistsAsync(`${channelId}.commands.routeIsDump`, this.createWritableBooleanState('Route dumping enabled', true, true));
        await this.setObjectNotExistsAsync(`${channelId}.commands.routeIsEdge`, this.createWritableBooleanState('Route edge enabled', false, true));
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.nonWorkStart`,
            this.createWritableStringState('Non-work start', 'text', '22:00', true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.nonWorkEnd`,
            this.createWritableStringState('Non-work end', 'text', '07:00', true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.nonWorkSubCmd`,
            this.createWritableNumberState('Non-work sub command', 'level', 0, { min: 0, max: 10, step: 1 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(`${channelId}.commands.bladePowerOn`, this.createWritableBooleanState('Blade power', true, true));
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.bladeHeightMm`,
            this.createWritableNumberState('Blade height', 'value.distance', 60, {
                unit: 'mm',
                min: CUT_HEIGHT_MIN_MM,
                max: CUT_HEIGHT_MAX_MM,
                step: CUT_HEIGHT_STEP_MM,
            }),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.bladeMaxSpeedMs`,
            this.createWritableNumberState('Blade max speed', 'value.speed', 1.2, { unit: 'm/s', min: 0.1, max: 1.5, step: 0.01 }, undefined, true),
        );
        await this.setObjectNotExistsAsync(`${channelId}.commands.applyTaskSettings`, this.createCommandState('Apply task settings', true));
        await this.setObjectNotExistsAsync(`${channelId}.commands.startZones`, this.createCommandState('Start mowing enabled zones'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.startAllZones`, this.createCommandState('Start mowing all known zones'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.requestAreaNames`, this.createCommandState('Request area name list from device'));
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.payload`,
            this.createWritableStringState('Command payload JSON (execute + persist)', 'json', ''),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.routePayloadJson`,
            this.createWritableStringState('Route payload JSON (legacy alias)', 'json', '', true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.lastPayload`,
            this.createReadonlyState('Last executed command payload JSON', 'string', 'json'),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.debugLastZoneStartJson`,
            this.createReadonlyState('Debug last zone start JSON', 'string', 'json', undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.debugLastRoutePayload`,
            this.createReadonlyState('Debug last route payload (base64)', 'string', 'text', undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.debugLastBladePayload`,
            this.createReadonlyState('Debug last blade-height payload (base64)', 'string', 'text', undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.debugLastStartPayload`,
            this.createReadonlyState('Debug last NavStartJob payload (base64)', 'string', 'text', undefined, true),
        );
        await this.setObjectNotExistsAsync(
            `${channelId}.telemetry.areasJson`,
            this.createReadonlyState('Known zones JSON', 'string', 'json'),
        );
        await this.setObjectNotExistsAsync(`${channelId}.commands.lastResult`, this.createReadonlyState('Last command result', 'string', 'text'));
        await this.setObjectNotExistsAsync(`${channelId}.commands.lastError`, this.createReadonlyState('Last command error', 'string', 'text'));
        await this.setObjectNotExistsAsync(
            `${channelId}.commands.lastTimestamp`,
            this.createReadonlyState('Last command timestamp', 'number', 'value.time'),
        );
        await this.applyCleanCommandUiProfile(channelId);

        if (!(await this.getStateAsync(`${channelId}.commands.targetMowSpeedMs`))) {
            await this.setStateAsync(`${channelId}.commands.targetMowSpeedMs`, 0.3, true);
        }
        // Migrate routeAreasCsv → routeAreaIds
        if (!(await this.getStateAsync(`${channelId}.commands.routeAreaIds`))) {
            const legacyCsvState = await this.getStateAsync(`${channelId}.commands.routeAreasCsv`);
            const migratedValue = legacyCsvState?.val !== undefined && legacyCsvState.val !== null ? `${legacyCsvState.val}` : '';
            await this.setStateAsync(`${channelId}.commands.routeAreaIds`, migratedValue, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeJobMode`))) {
            await this.setStateAsync(`${channelId}.commands.routeJobMode`, 4, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeJobVersion`))) {
            await this.setStateAsync(`${channelId}.commands.routeJobVersion`, 1, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeJobId`))) {
            await this.setStateAsync(`${channelId}.commands.routeJobId`, 0, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeUltraWave`))) {
            await this.setStateAsync(`${channelId}.commands.routeUltraWave`, 2, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeChannelMode`))) {
            await this.setStateAsync(`${channelId}.commands.routeChannelMode`, 0, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeChannelWidthCm`))) {
            await this.setStateAsync(`${channelId}.commands.routeChannelWidthCm`, 25, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeTowardDeg`))) {
            await this.setStateAsync(`${channelId}.commands.routeTowardDeg`, 0, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngleDeg`))) {
            await this.setStateAsync(`${channelId}.commands.routeTowardIncludedAngleDeg`, 0, true);
        }
        const legacyTowardIncludedAngleState =
            (await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngelDeg`)) ||
            (await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngle`)) ||
            (await this.getStateAsync(`${channelId}.commands.routeTowardIncludedAngel`));
        if (legacyTowardIncludedAngleState?.val !== undefined && legacyTowardIncludedAngleState?.val !== null) {
            const migratedToward = Number(legacyTowardIncludedAngleState.val);
            if (Number.isFinite(migratedToward)) {
                await this.setStateChangedAsync(`${channelId}.commands.routeTowardIncludedAngleDeg`, migratedToward, true);
            }
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeTowardMode`))) {
            await this.setStateAsync(`${channelId}.commands.routeTowardMode`, 0, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeMowingLaps`))) {
            await this.setStateAsync(`${channelId}.commands.routeMowingLaps`, 1, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeBorderMode`))) {
            await this.setStateAsync(`${channelId}.commands.routeBorderMode`, 1, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeObstacleLaps`))) {
            await this.setStateAsync(`${channelId}.commands.routeObstacleLaps`, 1, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeCollectGrassFrequency`))) {
            await this.setStateAsync(`${channelId}.commands.routeCollectGrassFrequency`, 10, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeStartProgress`))) {
            await this.setStateAsync(`${channelId}.commands.routeStartProgress`, 0, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeIsMow`))) {
            await this.setStateAsync(`${channelId}.commands.routeIsMow`, true, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeIsDump`))) {
            await this.setStateAsync(`${channelId}.commands.routeIsDump`, true, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routeIsEdge`))) {
            await this.setStateAsync(`${channelId}.commands.routeIsEdge`, false, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.nonWorkStart`))) {
            await this.setStateAsync(`${channelId}.commands.nonWorkStart`, '22:00', true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.nonWorkEnd`))) {
            await this.setStateAsync(`${channelId}.commands.nonWorkEnd`, '07:00', true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.nonWorkSubCmd`))) {
            await this.setStateAsync(`${channelId}.commands.nonWorkSubCmd`, 0, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.bladePowerOn`))) {
            await this.setStateAsync(`${channelId}.commands.bladePowerOn`, true, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.bladeHeightMm`))) {
            await this.setStateAsync(`${channelId}.commands.bladeHeightMm`, 60, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.bladeMaxSpeedMs`))) {
            await this.setStateAsync(`${channelId}.commands.bladeMaxSpeedMs`, 1.2, true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.payload`))) {
            await this.setStateAsync(`${channelId}.commands.payload`, '', true);
        }
        if (!(await this.getStateAsync(`${channelId}.commands.routePayloadJson`))) {
            await this.setStateAsync(`${channelId}.commands.routePayloadJson`, '', true);
        }

        await this.removeLegacyState(`${channelId}.commands.targetCutHeightMm`);
        const deviceKey = channelId.replace(/^devices\./, '');
        const context = this.deviceContexts.get(deviceKey);
        const bladeHeightState = await this.getStateAsync(`${channelId}.commands.bladeHeightMm`);
        const normalizedBladeHeight = this.normalizeCutHeightMm(Number(bladeHeightState?.val), context);
        if (Number.isFinite(normalizedBladeHeight)) {
            await this.setStateChangedAsync(`${channelId}.commands.bladeHeightMm`, normalizedBladeHeight, true);
        }
        const routeWidthState = await this.getStateAsync(`${channelId}.commands.routeChannelWidthCm`);
        const normalizedRouteWidth = this.normalizeRouteChannelWidthCm(Number(routeWidthState?.val), context);
        if (Number.isFinite(normalizedRouteWidth)) {
            await this.setStateChangedAsync(`${channelId}.commands.routeChannelWidthCm`, normalizedRouteWidth, true);
        }
        const routeJobVersionState = await this.getStateAsync(`${channelId}.commands.routeJobVersion`);
        const normalizedRouteJobVersion = Math.max(1, Math.trunc(Number(routeJobVersionState?.val)));
        if (Number.isFinite(normalizedRouteJobVersion)) {
            await this.setStateChangedAsync(`${channelId}.commands.routeJobVersion`, normalizedRouteJobVersion, true);
        }
        const routeMowingLapsState = await this.getStateAsync(`${channelId}.commands.routeMowingLaps`);
        const normalizedMowingLaps = Math.min(ROUTE_MOWING_LAPS_MAX, Math.max(0, Math.trunc(Number(routeMowingLapsState?.val))));
        if (Number.isFinite(normalizedMowingLaps)) {
            await this.setStateChangedAsync(`${channelId}.commands.routeMowingLaps`, normalizedMowingLaps, true);
        }
        const routeObstacleLapsState = await this.getStateAsync(`${channelId}.commands.routeObstacleLaps`);
        const normalizedObstacleLaps = Math.min(
            ROUTE_OBSTACLE_LAPS_MAX,
            Math.max(0, Math.trunc(Number(routeObstacleLapsState?.val))),
        );
        if (Number.isFinite(normalizedObstacleLaps)) {
            await this.setStateChangedAsync(`${channelId}.commands.routeObstacleLaps`, normalizedObstacleLaps, true);
        }
    }

    private async applyDeviceCommandLimits(channelId: string, context: DeviceContext): Promise<void> {
        const limits = this.getDeviceCommandLimits(context);
        await this.extendObjectAsync(`${channelId}.commands.targetMowSpeedMs`, {
            common: {
                min: limits.mowSpeed.min,
                max: limits.mowSpeed.max,
                step: limits.mowSpeed.step,
            },
        });
        await this.extendObjectAsync(`${channelId}.commands.bladeHeightMm`, {
            common: {
                min: limits.cutHeight.min,
                max: limits.cutHeight.max,
                step: limits.cutHeight.step,
            },
        });
        await this.extendObjectAsync(`${channelId}.commands.routeChannelWidthCm`, {
            common: {
                min: limits.routeWidth.min,
                max: limits.routeWidth.max,
                step: limits.routeWidth.step,
            },
        });

        const speedState = await this.getStateAsync(`${channelId}.commands.targetMowSpeedMs`);
        const normalizedSpeed = Number(
            Math.min(limits.mowSpeed.max, Math.max(limits.mowSpeed.min, Number(speedState?.val ?? 0.3))).toFixed(2),
        );
        if (Number.isFinite(normalizedSpeed)) {
            await this.setStateChangedAsync(`${channelId}.commands.targetMowSpeedMs`, normalizedSpeed, true);
        }

        const bladeState = await this.getStateAsync(`${channelId}.commands.bladeHeightMm`);
        const normalizedBlade = this.normalizeCutHeightMm(Number(bladeState?.val), context);
        if (Number.isFinite(normalizedBlade)) {
            await this.setStateChangedAsync(`${channelId}.commands.bladeHeightMm`, normalizedBlade, true);
        }

        const widthState = await this.getStateAsync(`${channelId}.commands.routeChannelWidthCm`);
        const normalizedWidth = this.normalizeRouteChannelWidthCm(Number(widthState?.val), context);
        if (Number.isFinite(normalizedWidth)) {
            await this.setStateChangedAsync(`${channelId}.commands.routeChannelWidthCm`, normalizedWidth, true);
        }
    }

    private createCommandState(name: string, expert = false): ioBroker.SettableObject {
        return {
            type: 'state',
            common: {
                name,
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
                def: false,
                expert: expert || undefined,
            },
            native: {},
        };
    }

    private createWritableNumberState(
        name: string,
        role: string,
        def: number,
        limits: { unit?: string; min?: number; max?: number; step?: number } = {},
        states?: Record<number, string>,
        expert = false,
    ): ioBroker.SettableObject {
        return {
            type: 'state',
            common: {
                name,
                type: 'number',
                role,
                read: true,
                write: true,
                def,
                unit: limits.unit,
                min: limits.min,
                max: limits.max,
                step: limits.step,
                states: states ? this.normalizeStatesMap(states) : undefined,
                expert: expert || undefined,
            },
            native: {},
        };
    }

    private normalizeStatesMap(states: Record<number, string>): Record<string, string> {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(states)) {
            normalized[`${key}`] = value;
        }
        return normalized;
    }

    private createWritableBooleanState(name: string, def: boolean, expert = false): ioBroker.SettableObject {
        return {
            type: 'state',
            common: {
                name,
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def,
                expert: expert || undefined,
            },
            native: {},
        };
    }

    private createWritableStringState(name: string, role: string, def: string, expert = false): ioBroker.SettableObject {
        return {
            type: 'state',
            common: {
                name,
                type: 'string',
                role,
                read: true,
                write: true,
                def,
                expert: expert || undefined,
            },
            native: {},
        };
    }

    private async applyCleanCommandUiProfile(channelId: string): Promise<void> {
        const advancedCommandStates = [
            'generateRoute',
            'modifyRoute',
            'queryRoute',
            'applyNonWorkHours',
            'applyBladeControl',
            'applyTaskSettings',
            'routeAreaIds',
            'routeJobMode',
            'routeJobVersion',
            'routeJobId',
            'routeTowardDeg',
            'routeTowardIncludedAngleDeg',
            'routeTowardMode',
            'routeBorderMode',
            'routeCollectGrassFrequency',
            'routeStartProgress',
            'routeIsMow',
            'routeIsDump',
            'routeIsEdge',
            'nonWorkStart',
            'nonWorkEnd',
            'nonWorkSubCmd',
            'bladePowerOn',
            'bladeMaxSpeedMs',
            'routePayloadJson',
            'debugLastZoneStartJson',
            'debugLastRoutePayload',
            'debugLastBladePayload',
            'debugLastStartPayload',
        ];
        for (const stateName of advancedCommandStates) {
            await this.extendObjectAsync(`${channelId}.commands.${stateName}`, { common: { expert: true } });
        }
    }

    private async removeLegacyState(id: string): Promise<void> {
        const obj = await this.getObjectAsync(id);
        if (!obj) {
            return;
        }
        try {
            await this.delObjectAsync(id);
        } catch (err) {
            this.log.debug(`Could not delete legacy state ${id} delete: ${this.extractAxiosError(err)}`);
        }
    }

    private extractIotDomain(accessToken: string): string {
        const parts = accessToken.split('.');
        if (parts.length < 2) {
            throw new Error('Access token invalid: JWT payload missing');
        }
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        const claims = JSON.parse(decoded) as { iot?: string };

        if (!claims.iot) {
            throw new Error('Access token does not contain iot domain claim');
        }

        const domain = claims.iot.startsWith('http') ? claims.iot : `https://${claims.iot}`;
        return domain.replace(/\/$/, '');
    }

    private createOauthSignature(payload: Record<string, string>): string {
        const payloadJson = JSON.stringify(payload);
        const timestampMs = `${Date.now()}`;
        const stringToSign = `${OAUTH_APP_KEY}${timestampMs}${TOKEN_ENDPOINT}${payloadJson}`;
        const md5Secret = createHash('md5').update(OAUTH_APP_SECRET, 'utf8').digest('hex');
        return createHmac('sha256', md5Secret).update(stringToSign, 'utf8').digest('hex');
    }

    private extractAxiosError(err: unknown): string {
        if (axios.isAxiosError(err)) {
            const axiosErr = err as AxiosError<{
                error_description?: string;
                error?: string;
                message?: string;
                msg?: string;
            }>;
            const bodyMsg =
                axiosErr.response?.data?.error_description ||
                axiosErr.response?.data?.error ||
                axiosErr.response?.data?.message ||
                axiosErr.response?.data?.msg;
            return bodyMsg || axiosErr.message;
        }
        return (err as Error)?.message || `${err}`;
    }

    private buildClientId(deviceUuid: string): string {
        const suffixFromUuid = deviceUuid.replace(/[^0-9]/g, '').slice(0, 7);
        const randomSuffix = Array.from({ length: 7 }, () => randomInt(0, 10).toString()).join('');
        return `${Date.now()}_${suffixFromUuid || randomSuffix}_1`;
    }

    private sanitizeObjectId(id: string): string {
        return id.replace(/[^A-Za-z0-9_-]/g, '_');
    }

    private safeJsonParse<T>(text: string): T | null {
        try {
            return JSON.parse(text) as T;
        } catch {
            return null;
        }
    }

    private pickNumber(...values: any[]): number | null {
        for (const value of values) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string') {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
        }
        return null;
    }

    private resolveDeviceTypeName(deviceType: string | number | undefined, deviceName: string, series: string | undefined): string {
        const code = this.pickNumber(deviceType);
        if (code !== null && DEVICE_TYPE_NAMES[code]) {
            return DEVICE_TYPE_NAMES[code];
        }

        const lower = `${deviceName} ${series || ''}`.toLowerCase();
        if (lower.includes('luba')) {
            return 'Luba';
        }
        if (lower.includes('yuka')) {
            return 'Yuka';
        }
        if (lower.includes('rtk')) {
            return 'RTK';
        }
        return code !== null ? `UNKNOWN_${code}` : '';
    }

    private generateHardwareString(length: number): string {
        const seed = createHash('sha1').update(`${this.namespace}-${process.pid}`, 'utf8').digest('hex');
        return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
    }

    private extractAreaCodeFromToken(accessToken: string): string {
        const parts = accessToken.split('.');
        if (parts.length < 2) {
            return '';
        }
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        const claims = this.safeJsonParse<{ areaCode?: string }>(decoded);
        return claims?.areaCode || '';
    }

    private async hydrateContextFromTelemetry(deviceKey: string): Promise<void> {
        const ctx = this.deviceContexts.get(deviceKey);
        if (!ctx) {
            return;
        }

        const iotIdState = await this.getStateAsync(`devices.${deviceKey}.iotId`);
        const stateIotId = typeof iotIdState?.val === 'string' ? iotIdState.val : '';
        if (stateIotId && stateIotId !== ctx.iotId) {
            ctx.iotId = stateIotId;
        }

        const payloadState = await this.getStateAsync(`devices.${deviceKey}.telemetry.lastPayload`);
        const payload = typeof payloadState?.val === 'string' ? this.safeJsonParse<Record<string, any>>(payloadState.val) : null;
        const payloadIotId =
            (typeof payload?.params?.iotId === 'string' && payload.params.iotId) ||
            (typeof payload?.params?.iot_id === 'string' && payload.params.iot_id) ||
            (typeof payload?.iot_id === 'string' && payload.iot_id) ||
            '';
        if (payloadIotId && payloadIotId !== ctx.iotId) {
            ctx.iotId = payloadIotId;
            await this.setStateChangedAsync(`devices.${deviceKey}.iotId`, payloadIotId, true);
        }

        const topicState = await this.getStateAsync(`devices.${deviceKey}.telemetry.lastTopic`);
        if (typeof topicState?.val === 'string') {
            const parts = topicState.val.split('/');
            if (parts.length >= 4) {
                const productKey = parts[2] || '';
                const recordDeviceName = parts[3] || '';
                if (productKey && !ctx.productKey) {
                    ctx.productKey = productKey;
                    await this.setStateChangedAsync(`devices.${deviceKey}.productKey`, productKey, true);
                    await this.setStateChangedAsync(
                        `devices.${deviceKey}.productKeyGroup`,
                        resolveProductKeyGroup(productKey) || 'UNKNOWN',
                        true,
                    );
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

    private resolveDeviceKey(productKey: string, recordDeviceName: string, iotId: string): string | null {
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
            return this.deviceContexts.values().next().value?.key || null;
        }

        return null;
    }
}

interface MammotionApiResponse<TData> {
    code: number;
    msg: string;
    data?: TData;
}

interface LoginResponse {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
    authorization_code?: string;
    scope?: string;
    userInformation?: {
        userId?: string;
        userAccount?: string;
        domainAbbreviation?: string;
    };
}

interface MammotionDevice {
    iotId?: string;
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    series?: string;
    productSeries?: string;
    status?: number;
    locationVo?: {
        location?: [number, number] | number[];
    };
}

interface DeviceRecord {
    identityId?: string;
    iotId: string;
    productKey: string;
    deviceName: string;
    owned?: number;
    status?: number;
}

interface DevicePageData {
    records?: DeviceRecord[];
    total?: number;
    size?: number;
    current?: number;
    pages?: number;
}

interface MqttConnection {
    host: string;
    jwt: string;
    clientId: string;
    username: string;
}

interface AuthSession {
    accessToken: string;
    expiresAt: number;
    iotDomain: string;
    userId: string;
    userAccount: string;
    authorizationCode: string;
    countryCode: string;
    clientId: string;
}

interface LegacySession {
    apiGatewayEndpoint: string;
    oaApiGatewayEndpoint: string;
    iotToken: string;
    iotTokenExpire: number;
    refreshToken: string;
    refreshTokenExpire: number;
    identityId: string;
    issuedAt: number;
    regionId: string;
}

type DeviceCommand = 'start' | 'pause' | 'resume' | 'stop' | 'dock' | 'cancelJob' | 'cancelDock';
type RouteCommandMode = 'generate' | 'modify' | 'query';

interface RoutePayloadInput {
    action?: string;
    label?: string;
    step?: string;
    mode?: string;
    commandMode?: string;
    start?: boolean;
    executeStart?: boolean;
    areaHashes?: Array<string | number>;
    routeAreaIds?: string;
    routeAreasCsv?: string;
    cutHeightMm?: number;
    targetCutHeightMm?: number;
    bladeHeightMm?: number;
    mowSpeedMs?: number;
    targetMowSpeedMs?: number;
    jobMode?: number;
    routeJobMode?: number;
    jobVersion?: number;
    routeJobVersion?: number;
    jobId?: number;
    routeJobId?: number;
    ultraWave?: number;
    routeUltraWave?: number;
    channelMode?: number;
    routeChannelMode?: number;
    channelWidthCm?: number;
    routeChannelWidthCm?: number;
    towardDeg?: number;
    routeTowardDeg?: number;
    towardIncludedAngleDeg?: number;
    routeTowardIncludedAngleDeg?: number;
    routeTowardIncludedAngelDeg?: number;
    towardMode?: number;
    routeTowardMode?: number;
    mowingLaps?: number;
    routeMowingLaps?: number;
    borderMode?: number;
    routeBorderMode?: number;
    obstacleLaps?: number;
    routeObstacleLaps?: number;
    collectGrassFrequency?: number;
    routeCollectGrassFrequency?: number;
    startProgress?: number;
    routeStartProgress?: number;
    rideBoundaryDistance?: number;
    routeRideBoundaryDistance?: number;
    isMow?: boolean;
    routeIsMow?: boolean;
    isDump?: boolean;
    routeIsDump?: boolean;
    isEdge?: boolean;
    routeIsEdge?: boolean;
    routeReceiver?: number;
    startReceiver?: number;
}

interface RouteSettings {
    areaHashes: bigint[];
    cutHeightMm: number;
    mowSpeedMs: number;
    jobMode: number;
    jobVersion: number;
    jobId: number;
    ultraWave: number;
    channelMode: number;
    channelWidthCm: number;
    towardDeg: number;
    towardIncludedAngleDeg: number;
    towardMode: number;
    mowingLaps: number;
    borderMode: number;
    obstacleLaps: number;
    collectGrassFrequency: number;
    startProgress: number;
    rideBoundaryDistance: number;
    isMow: boolean;
    isDump: boolean;
    isEdge: boolean;
}

interface NonWorkHoursSettings {
    startTime: string;
    endTime: string;
    subCmd: number;
}

interface BladeControlSettings {
    powerOn: boolean;
    heightMm: number;
    maxSpeedMs: number;
}

interface DeviceContext {
    key: string;
    iotId: string;
    deviceId: string;
    deviceName: string;
    productKey: string;
    recordDeviceName: string;
    status?: number;
    deviceType?: number | null;
    series?: string;
    productSeries?: string;
}

interface DeviceCommandLimits {
    cutHeight: { min: number; max: number; step: number };
    routeWidth: { min: number; max: number; step: number };
    mowSpeed: { min: number; max: number; step: number };
}

interface LegacyApiResponse<TData> {
    code: number;
    msg?: string;
    message?: string;
    data?: TData;
}

interface LegacyRegionData {
    apiGatewayEndpoint?: string;
    oaApiGatewayEndpoint?: string;
    regionId?: string;
}

interface LegacySessionData {
    iotToken?: string;
    iotTokenExpire?: number | string;
    refreshToken?: string;
    refreshTokenExpire?: number | string;
    identityId?: string;
}

interface LegacyBindingListData {
    data?: LegacyBinding[];
}

interface LegacyBinding {
    iotId?: string;
    productKey?: string;
    deviceName?: string;
    identityId?: string;
    status?: number;
    owned?: number;
}

interface LegacyOpenAccountResponse {
    code?: number | string;
    vid?: string;
    data?: {
        vid?: string;
        data?: {
            device?: {
                data?: {
                    deviceId?: string;
                };
            };
        };
    };
}

interface LegacyOpenAccountConnectResult {
    vid: string;
    deviceId: string;
    utdid: string;
}

interface LegacyLoginByOauthResponse {
    code?: number | string;
    message?: string;
    msg?: string;
    data?: {
        data?: {
            loginSuccessResult?: {
                sid?: string;
            };
        };
    };
}

interface LegacyInvokeData {
    data?: string;
    messageId?: string;
    output?: { content?: string };
    content?: string;
}

interface AliyunMqttCreds {
    aepProductKey: string;
    aepDeviceName: string;
    aepDeviceSecret: string;
    regionId: string;
}

interface AepResponseData {
    deviceSecret?: string;
    productKey?: string;
    deviceName?: string;
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Mammotion(options);
} else {
    (() => new Mammotion())();
}
