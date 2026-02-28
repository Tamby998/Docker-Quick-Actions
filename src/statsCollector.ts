import Dockerode from 'dockerode';
import { EventEmitter } from 'events';

export interface ContainerStats {
    containerId: string;
    containerName: string;
    cpuPercent: number;
    memoryUsage: number;
    memoryLimit: number;
    memoryPercent: number;
    networkRx: number;
    networkTx: number;
    blockRead: number;
    blockWrite: number;
    timestamp: number;
}

export class StatsCollector extends EventEmitter {
    private docker: Dockerode;
    private statsCache: Map<string, ContainerStats> = new Map();
    private streams: Map<string, NodeJS.ReadableStream> = new Map();
    private pollingTimer: NodeJS.Timeout | null = null;
    private running: boolean = false;
    private pollInterval: number;

    constructor(pollInterval: number = 2000) {
        super();
        this.docker = new Dockerode();
        this.pollInterval = pollInterval;
        // Prevent unhandled 'error' event from crashing the EventEmitter
        this.on('error', (err) => console.error('[StatsCollector]', err));
    }

    async start(): Promise<void> {
        if (this.running) { return; }
        this.running = true;
        await this.poll();
        this.pollingTimer = setInterval(() => this.poll(), this.pollInterval);
    }

    stop(): void {
        this.running = false;
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        this.destroyAllStreams();
        this.statsCache.clear();
    }

    getStats(containerId: string): ContainerStats | undefined {
        return this.statsCache.get(containerId);
    }

    getAllStats(): Map<string, ContainerStats> {
        return new Map(this.statsCache);
    }

    private async poll(): Promise<void> {
        if (!this.running) { return; }

        try {
            const containers = await this.docker.listContainers({ filters: { status: ['running'] } });
            const runningIds = new Set(containers.map(c => c.Id));

            // Remove streams for stopped containers
            for (const [id, stream] of this.streams) {
                if (!runningIds.has(id)) {
                    (stream as any).destroy?.();
                    this.streams.delete(id);
                    this.statsCache.delete(id);
                }
            }

            // Start streams for new running containers
            for (const containerInfo of containers) {
                if (!this.streams.has(containerInfo.Id)) {
                    this.startStream(
                        containerInfo.Id,
                        containerInfo.Names[0]?.replace(/^\//, '') || 'unknown'
                    );
                }
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    private async startStream(containerId: string, containerName: string): Promise<void> {
        try {
            const container = this.docker.getContainer(containerId);
            const stream = await container.stats({ stream: true }) as unknown as NodeJS.ReadableStream;
            this.streams.set(containerId, stream);

            let previousCpu = 0;
            let previousSystem = 0;
            let isFirst = true;
            let buffer = '';

            stream.on('data', (chunk: Buffer) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) { continue; }
                    try {
                        const data = JSON.parse(line);
                        const stats = this.parseStats(data, containerId, containerName, previousCpu, previousSystem, isFirst);

                        if (stats) {
                            previousCpu = data.cpu_stats?.cpu_usage?.total_usage || 0;
                            previousSystem = data.cpu_stats?.system_cpu_usage || 0;
                            isFirst = false;

                            this.statsCache.set(containerId, stats);
                            this.emit('stats', stats);
                        }
                    } catch {
                        // Ignore parse errors from partial chunks
                    }
                }
            });

            stream.on('error', () => {
                this.streams.delete(containerId);
                this.statsCache.delete(containerId);
            });

            stream.on('end', () => {
                this.streams.delete(containerId);
            });
        } catch {
            // Container may have stopped, ignore
        }
    }

    private parseStats(
        data: any,
        containerId: string,
        containerName: string,
        previousCpu: number,
        previousSystem: number,
        isFirst: boolean
    ): ContainerStats | null {
        if (!data.cpu_stats || !data.memory_stats) { return null; }

        // CPU calculation
        let cpuPercent = 0;
        if (!isFirst) {
            const cpuDelta = (data.cpu_stats.cpu_usage?.total_usage || 0) - previousCpu;
            const systemDelta = (data.cpu_stats.system_cpu_usage || 0) - previousSystem;
            const numCpus = data.cpu_stats.online_cpus || data.cpu_stats.cpu_usage?.percpu_usage?.length || 1;

            if (systemDelta > 0 && cpuDelta >= 0) {
                cpuPercent = (cpuDelta / systemDelta) * numCpus * 100;
            }
        }

        // Memory
        const memoryUsage = data.memory_stats.usage || 0;
        const memoryLimit = data.memory_stats.limit || 1;
        const memoryCache = data.memory_stats.stats?.cache || data.memory_stats.stats?.inactive_file || 0;
        const actualMemory = memoryUsage - memoryCache;
        const memoryPercent = (actualMemory / memoryLimit) * 100;

        // Network I/O
        let networkRx = 0;
        let networkTx = 0;
        if (data.networks) {
            for (const iface of Object.values(data.networks) as any[]) {
                networkRx += iface.rx_bytes || 0;
                networkTx += iface.tx_bytes || 0;
            }
        }

        // Block I/O
        let blockRead = 0;
        let blockWrite = 0;
        if (data.blkio_stats?.io_service_bytes_recursive) {
            for (const entry of data.blkio_stats.io_service_bytes_recursive) {
                if (entry.op === 'read' || entry.op === 'Read') { blockRead += entry.value || 0; }
                if (entry.op === 'write' || entry.op === 'Write') { blockWrite += entry.value || 0; }
            }
        }

        return {
            containerId,
            containerName,
            cpuPercent: Math.round(cpuPercent * 10) / 10,
            memoryUsage: actualMemory > 0 ? actualMemory : memoryUsage,
            memoryLimit,
            memoryPercent: Math.round(memoryPercent * 10) / 10,
            networkRx,
            networkTx,
            blockRead,
            blockWrite,
            timestamp: Date.now()
        };
    }

    private destroyAllStreams(): void {
        for (const [, stream] of this.streams) {
            (stream as any).destroy?.();
        }
        this.streams.clear();
    }

    dispose(): void {
        this.stop();
        this.removeAllListeners();
    }
}
