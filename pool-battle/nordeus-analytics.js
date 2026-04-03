/**
 * Nordeus Analytics - HTML5/Browser implementation
 *
 * Port of the C# Nordeus.Analytics system for browser-based games.
 * Sends protobuf-encoded events to events.nordeus.com using the EventServiceV2 format.
 */

// Manual protobuf wire encoding — avoids a 40KB+ protobufjs dependency.

const textEncoder = new TextEncoder();

const PB = {
    VARINT: 0,
    LENGTH_DELIMITED: 2,

    encodeVarint(value) {
        const bytes = [];
        value = Number(value);
        if (value < 0) {
            // Negative varint: 10-byte two's complement encoding
            let lo = value >>> 0;
            let hi = (((value - (value >>> 0)) / 4294967296) >>> 0) | 0;
            // If original value is negative and hi is 0, set all hi bits
            if (value < 0 && hi === 0) hi = 0xFFFFFFFF;
            for (let i = 0; i < 10; i++) {
                if (i < 4) {
                    bytes.push((lo & 0x7F) | 0x80);
                    lo >>>= 7;
                } else if (i === 4) {
                    bytes.push(((lo & 0x0F) | ((hi & 0x07) << 4)) | 0x80);
                    hi >>>= 3;
                } else if (i < 9) {
                    bytes.push((hi & 0x7F) | 0x80);
                    hi >>>= 7;
                } else {
                    bytes.push(hi & 0x7F);
                }
            }
            return new Uint8Array(bytes);
        }
        do {
            let byte = value & 0x7F;
            value >>>= 7;
            if (value > 0) byte |= 0x80;
            bytes.push(byte);
        } while (value > 0);
        return new Uint8Array(bytes);
    },

    encodeTag(fieldNumber, wireType) {
        return PB.encodeVarint((fieldNumber << 3) | wireType);
    },

    encodeString(str) {
        return textEncoder.encode(str);
    },

    encodeLengthDelimited(fieldNumber, data) {
        const tag = PB.encodeTag(fieldNumber, PB.LENGTH_DELIMITED);
        const len = PB.encodeVarint(data.length);
        const result = new Uint8Array(tag.length + len.length + data.length);
        result.set(tag, 0);
        result.set(len, tag.length);
        result.set(data, tag.length + len.length);
        return result;
    },

    encodeVarintField(fieldNumber, value) {
        if (value === null || value === undefined) return new Uint8Array(0);
        const tag = PB.encodeTag(fieldNumber, PB.VARINT);
        const val = PB.encodeVarint(value);
        const result = new Uint8Array(tag.length + val.length);
        result.set(tag, 0);
        result.set(val, tag.length);
        return result;
    },

    encodeStringField(fieldNumber, value) {
        if (!value) return new Uint8Array(0);
        const strBytes = PB.encodeString(value);
        return PB.encodeLengthDelimited(fieldNumber, strBytes);
    },

    encodeFloatField(fieldNumber, value) {
        if (value === null || value === undefined) return new Uint8Array(0);
        const tag = PB.encodeTag(fieldNumber, 5);
        const buf = new ArrayBuffer(4);
        new DataView(buf).setFloat32(0, value, true); // little-endian
        const floatBytes = new Uint8Array(buf);
        const result = new Uint8Array(tag.length + 4);
        result.set(tag, 0);
        result.set(floatBytes, tag.length);
        return result;
    },

    encodeBoolField(fieldNumber, value) {
        const tag = PB.encodeTag(fieldNumber, PB.VARINT);
        const val = new Uint8Array([value ? 1 : 0]);
        const result = new Uint8Array(tag.length + 1);
        result.set(tag, 0);
        result.set(val, tag.length);
        return result;
    },

    concat(...arrays) {
        arrays = arrays.filter(a => a && a.length > 0);
        const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }
};

// ── Protobuf message encoders matching EventServiceV2.proto ─────────────

function encodeStringParam(key, value) {
    return PB.concat(
        PB.encodeStringField(1, key),
        PB.encodeStringField(2, value)
    );
}

function encodeFloatParam(key, value) {
    return PB.concat(
        PB.encodeStringField(1, key),
        PB.encodeFloatField(2, value)
    );
}

function encodeIntParam(key, value) {
    return PB.concat(
        PB.encodeStringField(1, key),
        PB.encodeVarintField(2, value)
    );
}

function encodeLongParam(key, value) {
    return PB.concat(
        PB.encodeStringField(1, key),
        PB.encodeVarintField(2, value)
    );
}

function encodeBoolParam(key, value) {
    return PB.concat(
        PB.encodeStringField(1, key),
        PB.encodeBoolField(2, value)
    );
}

/**
 * EventV2 proto fields:
 *   1: eventId (int32)
 *   2: loginId (int64)
 *   3: timestampMs (int64)
 *   4: eventUniqueId (string)
 *   5: trackingSessionId (string)
 *   6: trackingDeviceId (string)
 *   7: order (int64)
 *   8: stringParameters (repeated StringParameter)
 *   9: floatParameters (repeated FloatParameter)
 *  10: intParameters (repeated IntParameter)
 *  11: longParameters (repeated LongParameter)
 *  12: boolParameters (repeated BoolParameter)
 *  13: createdTicksMs (int64)
 */
function encodeEventV2(event) {
    const parts = [];

    parts.push(PB.encodeVarintField(1, event.eventId));
    if (event.loginId) parts.push(PB.encodeVarintField(2, event.loginId));
    parts.push(PB.encodeVarintField(3, event.timestampMs));
    parts.push(PB.encodeStringField(4, event.eventUniqueId));
    parts.push(PB.encodeStringField(5, event.trackingSessionId));
    parts.push(PB.encodeStringField(6, event.trackingDeviceId));
    parts.push(PB.encodeVarintField(7, event.order));

    // Typed parameters
    if (event.stringParams) {
        for (const [k, v] of event.stringParams) {
            parts.push(PB.encodeLengthDelimited(8, encodeStringParam(k, v)));
        }
    }
    if (event.floatParams) {
        for (const [k, v] of event.floatParams) {
            parts.push(PB.encodeLengthDelimited(9, encodeFloatParam(k, v)));
        }
    }
    if (event.intParams) {
        for (const [k, v] of event.intParams) {
            parts.push(PB.encodeLengthDelimited(10, encodeIntParam(k, v)));
        }
    }
    if (event.longParams) {
        for (const [k, v] of event.longParams) {
            parts.push(PB.encodeLengthDelimited(11, encodeLongParam(k, v)));
        }
    }
    if (event.boolParams) {
        for (const [k, v] of event.boolParams) {
            parts.push(PB.encodeLengthDelimited(12, encodeBoolParam(k, v)));
        }
    }

    parts.push(PB.encodeVarintField(13, event.createdTicksMs));

    return PB.concat(...parts);
}

/**
 * BatchEventRequestV2 proto fields:
 *   1: gamePublicTag (string)
 *   2: environment (string)
 *   3: sentTimestampMs (int64)
 *   4: events (repeated EventV2)
 *   5: sentTicksMs (int64)
 *   6: platformType (enum: Unknown=-1, WebGl=0, Android=1, iOS=2)
 *   7: buildNumber (int32)
 */
function encodeBatchRequest(batch) {
    const parts = [];

    parts.push(PB.encodeStringField(1, batch.gamePublicTag));
    parts.push(PB.encodeStringField(2, batch.environment));
    parts.push(PB.encodeVarintField(3, batch.sentTimestampMs));

    for (const event of batch.events) {
        const eventBytes = encodeEventV2(event);
        parts.push(PB.encodeLengthDelimited(4, eventBytes));
    }

    parts.push(PB.encodeVarintField(5, batch.sentTicksMs));
    // Proto3 omits enum default (0=WebGl), so only encode non-zero platform types
    if (batch.platformType !== 0) {
        parts.push(PB.encodeVarintField(6, batch.platformType));
    }
    parts.push(PB.encodeVarintField(7, batch.buildNumber));

    return PB.concat(...parts);
}


// ── NordeusAnalytics class ──────────────────────────────────────────────

function generateUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

const STORAGE_KEY_DEVICE_ID = 'nordeus_device_guid';
const STORAGE_KEY_ORDER = 'nordeus_event_order';

class NordeusAnalytics {
    constructor() {
        this.config = null;
        this.eventBuffer = [];
        this.flushTimer = null;
        this.startTime = performance.now();
        this.lastBackgroundTime = null;
        this.sessionPingTimer = null;
        this._initialized = false;
    }

    /**
     * Initialize the analytics system.
     * @param {Object} config
     * @param {string} config.gameTag - Game identifier (e.g. "PoolBattle")
     * @param {string} config.environment - "production", "dev", "editor"
     * @param {number} config.platformType - 0=WebGL, 1=Android, 2=iOS, -1=Unknown
     * @param {number} config.buildNumber - Build number
     * @param {string} [config.serverUrl] - Server base URL
     * @param {string} [config.servletPath] - API path
     */
    init(config) {
        this.config = {
            gameTag: config.gameTag || 'PoolBattle',
            environment: config.environment || 'dev',
            platformType: config.platformType ?? 0, // WebGL
            buildNumber: config.buildNumber || 1,
            serverUrl: config.serverUrl || 'https://events.nordeus.com',
            servletPath: config.servletPath || '/api/v1/client/track-events',
            flushIntervalMs: config.flushIntervalMs || 10000,
            maxBufferSize: config.maxBufferSize || 10,
            maxBackgroundMs: config.maxBackgroundMs || 5 * 60 * 1000, // 5 min for new session
            backoffMs: config.backoffMs || [1000, 3000, 5000, 20000, 60000],
        };

        // Device GUID - persistent across sessions
        this.deviceGuid = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
        if (!this.deviceGuid) {
            this.deviceGuid = generateUUID();
            localStorage.setItem(STORAGE_KEY_DEVICE_ID, this.deviceGuid);
        }

        // Tracking session ID - new each session
        this.trackingSessionId = generateUUID();

        // Event order counter - persistent, auto-increment
        this.order = parseInt(localStorage.getItem(STORAGE_KEY_ORDER) || '0', 10);

        // Flush timer
        this.flushTimer = setInterval(() => this._flush(), this.config.flushIntervalMs);

        // Background/foreground handling
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.lastBackgroundTime = Date.now();
                this._flush(); // flush before going to background
            } else {
                if (this.lastBackgroundTime) {
                    const elapsed = Date.now() - this.lastBackgroundTime;
                    if (elapsed > this.config.maxBackgroundMs) {
                        // New session after long background
                        this.trackingSessionId = generateUUID();
                    }
                }
                this.lastBackgroundTime = null;
            }
        });

        // Flush on page unload
        window.addEventListener('beforeunload', () => this._flush());

        // // Session ping every 60s
        // this.sessionPingTimer = setInterval(() => {
        //     this.track(10007, { time_since_start_ms: Math.round(performance.now() - this.startTime) });
        // }, 60000);

        this._initialized = true;
        console.log(`[NordeusAnalytics] Initialized: device=${this.deviceGuid}, session=${this.trackingSessionId}, env=${this.config.environment}`);
    }

    /**
     * Track an analytics event.
     * @param {number} eventId - Event type ID
     * @param {Object} params - Key-value parameters. Values are auto-typed:
     *   string → stringParams, number (float) → floatParams, number (int) → intParams, boolean → boolParams
     */
    track(eventId, params = {}) {
        if (!this._initialized) {
            console.warn('[NordeusAnalytics] Not initialized, dropping event', eventId);
            return;
        }

        // Cap buffer to prevent unbounded growth during prolonged outages
        if (this.eventBuffer.length >= 500) {
            this.eventBuffer.shift();
        }

        this.order++;

        const now = Date.now();
        const event = {
            eventId,
            loginId: 0,
            timestampMs: now,
            eventUniqueId: generateUUID(),
            trackingSessionId: this.trackingSessionId,
            trackingDeviceId: this.deviceGuid,
            order: this.order,
            stringParams: [],
            floatParams: [],
            intParams: [],
            longParams: [],
            boolParams: [],
            createdTicksMs: Math.round(performance.now()),
        };

        // Auto-type parameters
        for (const [key, value] of Object.entries(params)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'boolean') {
                event.boolParams.push([key, value]);
            } else if (typeof value === 'string') {
                event.stringParams.push([key, value]);
            } else if (typeof value === 'number') {
                if (Number.isInteger(value) && Math.abs(value) <= 2147483647) {
                    event.intParams.push([key, value]);
                } else if (Number.isInteger(value)) {
                    event.longParams.push([key, value]);
                } else {
                    event.floatParams.push([key, value]);
                }
            }
        }

        this.eventBuffer.push(event);

        // Auto-flush if buffer is full
        if (this.eventBuffer.length >= this.config.maxBufferSize) {
            this._flush();
        }
    }

    _flush() {
        if (this.eventBuffer.length === 0) return;

        // Persist order counter once per batch instead of per-event
        localStorage.setItem(STORAGE_KEY_ORDER, String(this.order));

        const events = this.eventBuffer.splice(0);
        const batch = {
            gamePublicTag: this.config.gameTag,
            environment: this.config.environment,
            sentTimestampMs: Date.now(),
            events,
            sentTicksMs: Math.round(performance.now()),
            platformType: this.config.platformType,
            buildNumber: this.config.buildNumber,
        };

        const encoded = encodeBatchRequest(batch);
        this._send(encoded, 0);
    }

    _send(data, retryIndex) {
        const url = this.config.serverUrl + this.config.servletPath;

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-protobuf' },
            body: data,
            keepalive: true, // survive page unload
        })
        .then(response => {
            if (response.status >= 500 && response.status < 600) {
                throw new Error(`Server error: ${response.status}`);
            }
            if (!response.ok) {
                console.warn(`[NordeusAnalytics] Non-OK response: ${response.status}`);
            }
        })
        .catch(err => {
            if (retryIndex < this.config.backoffMs.length) {
                const delay = this.config.backoffMs[retryIndex];
                console.warn(`[NordeusAnalytics] Send failed, retrying in ${delay}ms:`, err.message);
                setTimeout(() => this._send(data, retryIndex + 1), delay);
            } else {
                console.error('[NordeusAnalytics] Send failed after all retries:', err.message);
            }
        });
    }

    trackLogin() {
        this.track(10000, {
            platform_name: 'WebGL',
            application_version: '1.0.0',
            build_number: this.config.buildNumber,
            os_version: navigator.platform || 'unknown',
            device_locale: navigator.language || 'unknown',
            device_manufacturer: 'browser',
            device_model: navigator.userAgent.substring(0, 80),
            screen_width_px: screen.width,
            screen_height_px: screen.height,
            screen_dpi: Math.round(window.devicePixelRatio * 96),
        });
    }
}

const nanalytics = new NordeusAnalytics();
export default nanalytics;
