import { EventEmitter } from 'events';
import { LogEntry, LogStream, LogFilter, CONTAINER_COLORS } from './logTypes';
import { parseLogChunk } from './logParser';
import { applyFilter } from './logFilter';
import { DockerManager } from './dockerManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONTAINERS = 10;
const BUFFER_SIZE = 10000;
const BATCH_INTERVAL_MS = 100;

// ---------------------------------------------------------------------------
// MultiLogsManager
// ---------------------------------------------------------------------------

/**
 * Manages simultaneous log streaming from multiple Docker containers.
 *
 * Events emitted:
 *   'containerAdded'       { containerId, containerName, color }
 *   'containerRemoved'     containerId
 *   'containerDisconnected' containerId
 *   'containerError'       { containerId, error }
 *   'newEntries'           LogEntry[]
 */
export class MultiLogsManager extends EventEmitter {
    // Active streams keyed by containerId
    private logStreams: Map<string, LogStream> = new Map();

    // Circular buffer of persisted log entries
    private entries: LogEntry[] = [];

    // Monotonically increasing ID counter for LogEntry objects
    private nextIdCounter: number = 0;

    // Debounce timer for batch flushing
    private batchTimer: NodeJS.Timeout | null = null;

    // Accumulator for entries that have not yet been flushed
    private pendingEntries: LogEntry[] = [];

    // Round-robin index into CONTAINER_COLORS
    private colorIndex: number = 0;

    constructor(private dockerManager: DockerManager) {
        super();
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Starts streaming logs from the given container.
     *
     * Throws if:
     *  - the container has already been added, or
     *  - MAX_CONTAINERS would be exceeded.
     */
    async addContainer(containerId: string, containerName: string): Promise<void> {
        if (this.logStreams.has(containerId)) {
            throw new Error(`Container "${containerId}" is already being tracked.`);
        }

        if (this.logStreams.size >= MAX_CONTAINERS) {
            throw new Error(
                `Cannot add container "${containerId}": maximum of ${MAX_CONTAINERS} containers already reached.`
            );
        }

        const rawStream = await this.dockerManager.getContainerLogs(containerId, true);

        const color = CONTAINER_COLORS[this.colorIndex % CONTAINER_COLORS.length];
        this.colorIndex += 1;

        const logStream: LogStream = {
            containerId,
            containerName,
            stream: rawStream,
            color,
            active: true,
            paused: false,
        };

        this.logStreams.set(containerId, logStream);

        // Wire up stream events
        rawStream.on('data', (chunk: Buffer) => {
            const parsed = parseLogChunk(
                chunk,
                containerId,
                containerName,
                () => this.nextIdCounter++
            );

            if (parsed.length > 0) {
                this.pendingEntries.push(...parsed);
                this.scheduleBatch();
            }
        });

        rawStream.on('error', (error: Error) => {
            this.emit('containerError', { containerId, error });
        });

        rawStream.on('end', () => {
            const stream = this.logStreams.get(containerId);
            if (stream) {
                stream.active = false;
            }
            this.emit('containerDisconnected', containerId);
        });

        this.emit('containerAdded', { containerId, containerName, color });
    }

    /**
     * Stops streaming logs from the given container and removes it from
     * the tracked set.  Does nothing if the container is not tracked.
     */
    removeContainer(containerId: string): void {
        const logStream = this.logStreams.get(containerId);
        if (!logStream) {
            return;
        }

        // Destroy the underlying readable stream to stop data flow
        const readable = logStream.stream as NodeJS.ReadableStream & { destroy?: () => void };
        if (typeof readable.destroy === 'function') {
            readable.destroy();
        }

        this.logStreams.delete(containerId);
        this.emit('containerRemoved', containerId);
    }

    /**
     * Returns a snapshot of all currently tracked containers with their
     * streaming state.
     */
    getActiveContainers(): Array<{
        containerId: string;
        containerName: string;
        color: string;
        active: boolean;
        paused: boolean;
    }> {
        return Array.from(this.logStreams.values()).map(({ containerId, containerName, color, active, paused }) => ({
            containerId,
            containerName,
            color,
            active,
            paused,
        }));
    }

    /**
     * Pauses the readable stream for the given container.
     * Buffered data on the stream will not be delivered until resumed.
     */
    pauseStream(containerId: string): void {
        const logStream = this.logStreams.get(containerId);
        if (!logStream) {
            return;
        }
        logStream.stream.pause();
        logStream.paused = true;
    }

    /**
     * Resumes a previously paused stream for the given container.
     */
    resumeStream(containerId: string): void {
        const logStream = this.logStreams.get(containerId);
        if (!logStream) {
            return;
        }
        logStream.stream.resume();
        logStream.paused = false;
    }

    /**
     * Returns entries from the circular buffer, optionally filtered.
     * The returned array is a copy; mutations do not affect internal state.
     */
    getEntries(filter?: LogFilter): LogEntry[] {
        if (!filter) {
            return [...this.entries];
        }
        return applyFilter(this.entries, filter);
    }

    /**
     * Clears log entries.
     *
     * @param containerId When provided only entries for that container are
     *                    removed; otherwise the entire buffer is cleared.
     */
    clearLogs(containerId?: string): void {
        if (containerId !== undefined) {
            this.entries = this.entries.filter(e => e.containerId !== containerId);
        } else {
            this.entries = [];
        }
    }

    /**
     * Returns the display color assigned to the given container, or an empty
     * string if the container is not tracked.
     */
    getContainerColor(containerId: string): string {
        const logStream = this.logStreams.get(containerId);
        return logStream ? logStream.color : '';
    }

    /**
     * Disposes all resources: removes every tracked container and cancels any
     * pending batch timer.
     */
    dispose(): void {
        for (const containerId of Array.from(this.logStreams.keys())) {
            this.removeContainer(containerId);
        }

        if (this.batchTimer !== null) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        this.pendingEntries = [];
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Schedules a batch flush after BATCH_INTERVAL_MS milliseconds.
     * If a flush is already scheduled the existing timer is left in place so
     * that the first scheduled flush runs on time (debounce-leading-edge
     * semantics are not required here; a simple trailing debounce is fine).
     */
    private scheduleBatch(): void {
        if (this.batchTimer !== null) {
            return;
        }

        this.batchTimer = setTimeout(() => {
            this.flushBatch();
        }, BATCH_INTERVAL_MS);
    }

    /**
     * Moves all pending entries into the circular buffer and emits 'newEntries'.
     */
    private flushBatch(): void {
        this.batchTimer = null;

        if (this.pendingEntries.length === 0) {
            return;
        }

        const batch = this.pendingEntries.slice();
        this.pendingEntries = [];

        // Append to circular buffer, then trim from the front if over capacity
        this.entries.push(...batch);

        if (this.entries.length > BUFFER_SIZE) {
            this.entries = this.entries.slice(this.entries.length - BUFFER_SIZE);
        }

        this.emit('newEntries', batch);
    }
}
