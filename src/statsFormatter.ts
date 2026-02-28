const SPARKLINE_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export interface StatsHistory {
    cpuHistory: number[];
    memoryHistory: number[];
    maxPoints: number;
}

export function createStatsHistory(maxPoints: number = 30): StatsHistory {
    return { cpuHistory: [], memoryHistory: [], maxPoints };
}

export function pushToHistory(history: StatsHistory, cpuPercent: number, memoryPercent: number): void {
    history.cpuHistory.push(cpuPercent);
    history.memoryHistory.push(memoryPercent);
    if (history.cpuHistory.length > history.maxPoints) {
        history.cpuHistory.shift();
    }
    if (history.memoryHistory.length > history.maxPoints) {
        history.memoryHistory.shift();
    }
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) { return '0 B'; }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const idx = Math.min(i, units.length - 1);
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function formatCpuPercent(percent: number): string {
    return `${percent.toFixed(1)}%`;
}

export function generateSparkline(values: number[], max: number = 100): string {
    if (values.length === 0) { return ''; }
    return values.map(v => {
        const normalized = Math.min(v / max, 1);
        const idx = Math.min(Math.floor(normalized * (SPARKLINE_CHARS.length - 1)), SPARKLINE_CHARS.length - 1);
        return SPARKLINE_CHARS[idx];
    }).join('');
}

export function getColorForUsage(percent: number): 'green' | 'yellow' | 'red' {
    if (percent < 50) { return 'green'; }
    if (percent < 80) { return 'yellow'; }
    return 'red';
}

export function getThemeColorForUsage(percent: number): string {
    const color = getColorForUsage(percent);
    switch (color) {
        case 'green': return 'charts.green';
        case 'yellow': return 'charts.yellow';
        case 'red': return 'charts.red';
    }
}

export function formatInlineStats(cpuPercent: number, memoryUsage: number, memoryLimit: number): string {
    const cpu = formatCpuPercent(cpuPercent);
    const mem = formatBytes(memoryUsage);
    return `CPU:${cpu} RAM:${mem}`;
}

export function formatDetailedStats(
    containerName: string,
    cpuPercent: number,
    memoryUsage: number,
    memoryLimit: number,
    memoryPercent: number,
    networkRx: number,
    networkTx: number,
    blockRead: number,
    blockWrite: number,
    cpuHistory: number[],
    memoryHistory: number[]
): string {
    const cpuSparkline = generateSparkline(cpuHistory);
    const memSparkline = generateSparkline(memoryHistory);
    const cpuColor = getColorForUsage(cpuPercent);
    const memColor = getColorForUsage(memoryPercent);

    const cpuIcon = cpuPercent > 80 ? '$(warning)' : '$(pulse)';
    const memIcon = memoryPercent > 80 ? '$(warning)' : '$(database)';

    return [
        `### ${containerName} - Resources`,
        '',
        `${cpuIcon} **CPU:** ${formatCpuPercent(cpuPercent)}`,
        `\`${cpuSparkline}\``,
        '',
        `${memIcon} **Memory:** ${formatBytes(memoryUsage)} / ${formatBytes(memoryLimit)} (${formatCpuPercent(memoryPercent)})`,
        `\`${memSparkline}\``,
        '',
        `$(cloud-download) **Net RX:** ${formatBytes(networkRx)}  $(cloud-upload) **Net TX:** ${formatBytes(networkTx)}`,
        '',
        `$(file) **Disk Read:** ${formatBytes(blockRead)}  $(file) **Disk Write:** ${formatBytes(blockWrite)}`,
    ].join('\n');
}

export function formatStatsForExport(stats: {
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
}[]): { csv: string; json: string } {
    const headers = ['Timestamp', 'Container', 'CPU%', 'MemoryUsage', 'MemoryLimit', 'Memory%', 'NetRX', 'NetTX', 'BlockRead', 'BlockWrite'];
    const csvRows = [headers.join(',')];

    for (const s of stats) {
        csvRows.push([
            new Date(s.timestamp).toISOString(),
            s.containerName,
            s.cpuPercent.toFixed(1),
            s.memoryUsage,
            s.memoryLimit,
            s.memoryPercent.toFixed(1),
            s.networkRx,
            s.networkTx,
            s.blockRead,
            s.blockWrite
        ].join(','));
    }

    return {
        csv: csvRows.join('\n'),
        json: JSON.stringify(stats, null, 2)
    };
}
