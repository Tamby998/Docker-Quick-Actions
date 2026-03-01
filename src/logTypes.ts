export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';
export type StreamType = 'stdout' | 'stderr';

export interface LogEntry {
    id: number;
    containerId: string;
    containerName: string;
    timestamp: Date;
    message: string;
    stream: StreamType;
    level: LogLevel;
    raw: string;
}

export interface LogStream {
    containerId: string;
    containerName: string;
    stream: NodeJS.ReadableStream;
    color: string;
    active: boolean;
    paused: boolean;
}

export interface LogFilter {
    containerIds?: string[];
    levels?: LogLevel[];
    streams?: StreamType[];
    timeRange?: { start: Date; end: Date };
    searchText?: string;
    searchRegex?: RegExp;
    excludePatterns?: string[];
}

export enum ExportFormat {
    TXT = 'txt',
    JSON = 'json',
    CSV = 'csv',
    HTML = 'html'
}

export interface ExportOptions {
    format: ExportFormat;
    filters?: LogFilter;
    includeMetadata?: boolean;
}

// 10-color palette for container differentiation
export const CONTAINER_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#84cc16', // lime
    '#6366f1', // indigo
];

export const LEVEL_COLORS: Record<LogLevel, string> = {
    error: '#ef4444',
    warn: '#f59e0b',
    info: '#3b82f6',
    debug: '#6b7280',
    unknown: '#9ca3af',
};
