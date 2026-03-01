import { LogEntry, LogLevel, StreamType } from './logTypes';

// ---------------------------------------------------------------------------
// Docker stream multiplexing header constants
// ---------------------------------------------------------------------------
const DOCKER_HEADER_SIZE = 8;
const DOCKER_STREAM_STDOUT = 1;
const DOCKER_STREAM_STDERR = 2;

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[mGKHF]/g;

// Docker log timestamp: 2024-01-15T10:30:00.000000000Z (nanosecond precision)
const ISO8601_PREFIX_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) /;

const LEVEL_PATTERNS: Array<{ level: LogLevel; pattern: RegExp }> = [
    { level: 'error', pattern: /\b(error|exception|fatal|critical|err|fail|failed|failure)\b/i },
    { level: 'warn',  pattern: /\b(warn|warning|caution|deprecated)\b/i },
    { level: 'info',  pattern: /\b(info|notice|started|ready|listening|connected)\b/i },
    { level: 'debug', pattern: /\b(debug|trace|verbose)\b/i },
];

// ---------------------------------------------------------------------------
// 1. demuxDockerStream
// ---------------------------------------------------------------------------

/**
 * Parses Docker's multiplexed stream format (stdout/stderr interleaved).
 *
 * Each frame has an 8-byte header:
 *   [0]    stream type: 1 = stdout, 2 = stderr
 *   [1-3]  padding (zeros)
 *   [4-7]  payload size (big-endian uint32)
 *   [8..]  payload bytes
 *
 * A single Buffer may contain multiple concatenated frames.
 * If the header cannot be parsed (e.g., raw TTY output without multiplexing),
 * the entire chunk is treated as stdout.
 */
export function demuxDockerStream(
    chunk: Buffer
): Array<{ stream: StreamType; payload: Buffer }> {
    const frames: Array<{ stream: StreamType; payload: Buffer }> = [];

    // Validate that the buffer looks like a multiplexed Docker stream.
    // A minimal valid frame is at least DOCKER_HEADER_SIZE bytes long and the
    // first byte must be 1 (stdout) or 2 (stderr).
    if (
        chunk.length < DOCKER_HEADER_SIZE ||
        (chunk[0] !== DOCKER_STREAM_STDOUT && chunk[0] !== DOCKER_STREAM_STDERR)
    ) {
        // Not a multiplexed stream – treat the whole chunk as stdout.
        return [{ stream: 'stdout', payload: chunk }];
    }

    let offset = 0;

    while (offset < chunk.length) {
        // Need at least 8 bytes to read the header.
        if (offset + DOCKER_HEADER_SIZE > chunk.length) {
            break;
        }

        const streamByte = chunk[offset];
        const payloadSize = chunk.readUInt32BE(offset + 4);

        let stream: StreamType;
        if (streamByte === DOCKER_STREAM_STDOUT) {
            stream = 'stdout';
        } else if (streamByte === DOCKER_STREAM_STDERR) {
            stream = 'stderr';
        } else {
            // Unknown stream type – fall back to treating the rest as stdout.
            frames.push({ stream: 'stdout', payload: chunk.subarray(offset + DOCKER_HEADER_SIZE) });
            break;
        }

        const payloadStart = offset + DOCKER_HEADER_SIZE;
        const payloadEnd = payloadStart + payloadSize;

        if (payloadEnd > chunk.length) {
            // Truncated frame – take whatever is available.
            frames.push({ stream, payload: chunk.subarray(payloadStart) });
            break;
        }

        frames.push({ stream, payload: chunk.subarray(payloadStart, payloadEnd) });
        offset = payloadEnd;
    }

    return frames;
}

// ---------------------------------------------------------------------------
// 2. detectLogLevel
// ---------------------------------------------------------------------------

/**
 * Scans the message text against ordered regex patterns and returns the first
 * matching log level.  Returns 'unknown' when no pattern matches.
 */
export function detectLogLevel(message: string): LogLevel {
    for (const { level, pattern } of LEVEL_PATTERNS) {
        if (pattern.test(message)) {
            return level;
        }
    }
    return 'unknown';
}

// ---------------------------------------------------------------------------
// 3. extractTimestamp
// ---------------------------------------------------------------------------

/**
 * Attempts to parse an ISO8601 timestamp at the very beginning of the message
 * (the format Docker prepends when the --timestamps flag is used).
 *
 * Example prefix: "2024-01-15T10:30:00.000000000Z "
 *
 * If found, returns the parsed Date and the message with the prefix stripped.
 * If not found, returns the current time and the original message unchanged.
 */
export function extractTimestamp(
    message: string
): { timestamp: Date; cleanMessage: string } {
    const match = ISO8601_PREFIX_RE.exec(message);
    if (match) {
        const timestamp = new Date(match[1]);
        // Validate that the parsed date is not NaN before accepting it.
        if (!isNaN(timestamp.getTime())) {
            const cleanMessage = message.slice(match[0].length);
            return { timestamp, cleanMessage };
        }
    }
    return { timestamp: new Date(), cleanMessage: message };
}

// ---------------------------------------------------------------------------
// 4. stripAnsi
// ---------------------------------------------------------------------------

/**
 * Removes ANSI terminal escape sequences from a string so that log messages
 * are stored as plain text.
 */
export function stripAnsi(text: string): string {
    return text.replace(ANSI_ESCAPE_RE, '');
}

// ---------------------------------------------------------------------------
// 5. parseLogChunk
// ---------------------------------------------------------------------------

/**
 * High-level entry point: converts a raw Docker log Buffer into an array of
 * strongly-typed LogEntry objects.
 *
 * Processing pipeline for each line:
 *   demuxDockerStream → split by newline → filter empty → stripAnsi
 *   → extractTimestamp → detectLogLevel → build LogEntry
 *
 * @param chunk         Raw buffer received from the Docker API stream.
 * @param containerId   Docker container ID (short or full).
 * @param containerName Human-readable container name.
 * @param nextId        Factory function that returns a monotonically increasing
 *                      unique integer ID for each entry.
 */
export function parseLogChunk(
    chunk: Buffer,
    containerId: string,
    containerName: string,
    nextId: () => number
): LogEntry[] {
    const entries: LogEntry[] = [];

    const frames = demuxDockerStream(chunk);

    for (const { stream, payload } of frames) {
        const raw = payload.toString('utf8');

        // Split on newlines (both LF and CRLF).
        const lines = raw.split(/\r?\n/);

        for (const line of lines) {
            if (line.trim() === '') {
                continue;
            }

            const cleaned = stripAnsi(line);
            const { timestamp, cleanMessage } = extractTimestamp(cleaned);
            const level = detectLogLevel(cleanMessage);

            entries.push({
                id: nextId(),
                containerId,
                containerName,
                timestamp,
                message: cleanMessage,
                stream,
                level,
                raw: line,
            });
        }
    }

    return entries;
}
