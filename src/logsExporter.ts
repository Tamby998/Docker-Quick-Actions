import { LogEntry, LogLevel, ExportFormat, ExportOptions, LEVEL_COLORS } from './logTypes';
import { applyFilter } from './logFilter';

export class LogsExporter {

    export(entries: LogEntry[], options: ExportOptions): string {
        const filtered = options.filters
            ? applyFilter(entries, options.filters)
            : entries;

        switch (options.format) {
            case ExportFormat.TXT:
                return this.formatTxt(filtered);
            case ExportFormat.JSON:
                return this.formatJson(filtered, options.includeMetadata !== false);
            case ExportFormat.CSV:
                return this.formatCsv(filtered);
            case ExportFormat.HTML:
                return this.formatHtml(filtered);
            default:
                return this.formatTxt(filtered);
        }
    }

    private formatTxt(entries: LogEntry[]): string {
        return entries
            .map((entry) => {
                const ts = this.formatTimestamp(entry.timestamp);
                const level = this.padLevel(entry.level);
                return `[${ts}] [${entry.containerName}] [${level}] ${entry.message}`;
            })
            .join('\n');
    }

    private formatJson(entries: LogEntry[], includeMetadata: boolean): string {
        const entryObjects = entries.map((entry) => ({
            id: entry.id,
            containerId: entry.containerId,
            containerName: entry.containerName,
            timestamp: entry.timestamp.toISOString(),
            message: entry.message,
            stream: entry.stream,
            level: entry.level,
        }));

        if (!includeMetadata) {
            return JSON.stringify(entryObjects, null, 2);
        }

        const containers = Array.from(new Set(entries.map((e) => e.containerName)));

        const wrapper = {
            exportedAt: new Date().toISOString(),
            totalEntries: entries.length,
            containers,
            entries: entryObjects,
        };

        return JSON.stringify(wrapper, null, 2);
    }

    private formatCsv(entries: LogEntry[]): string {
        const header = 'id,timestamp,containerName,stream,level,message';
        const rows = entries.map((entry) => {
            const cols = [
                String(entry.id),
                entry.timestamp.toISOString(),
                entry.containerName,
                entry.stream,
                entry.level,
                entry.message,
            ];
            return cols.map((col) => this.escapeCsv(col)).join(',');
        });

        return [header, ...rows].join('\n');
    }

    private formatHtml(entries: LogEntry[]): string {
        const date = new Date().toISOString().slice(0, 10);

        const lines = entries
            .map((entry) => {
                const ts = this.formatTimestamp(entry.timestamp);
                const color = LEVEL_COLORS[entry.level];
                const levelLabel = this.padLevel(entry.level);
                const message = this.escapeHtml(entry.message);
                const containerName = this.escapeHtml(entry.containerName);

                return (
                    `    <div class="log-entry level-${entry.level}">` +
                    `<span class="ts">${this.escapeHtml(ts)}</span> ` +
                    `<span class="container">${containerName}</span> ` +
                    `<span class="badge" style="color:${color};">${levelLabel}</span> ` +
                    `<span class="message">${message}</span>` +
                    `</div>`
                );
            })
            .join('\n');

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Docker Logs Export - ${date}</title>
  <style>
    body {
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      margin: 0;
      padding: 16px;
    }
    h1 {
      font-size: 16px;
      color: #9cdcfe;
      margin-bottom: 16px;
    }
    .log-entry {
      padding: 2px 4px;
      border-radius: 2px;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.6;
    }
    .log-entry:hover {
      background: #2a2a2a;
    }
    .ts {
      color: #6b7280;
    }
    .container {
      color: #9cdcfe;
    }
    .badge {
      font-weight: bold;
    }
    .message {
      color: #d4d4d4;
    }
    .level-error { border-left: 3px solid #ef4444; padding-left: 6px; }
    .level-warn  { border-left: 3px solid #f59e0b; padding-left: 6px; }
    .level-info  { border-left: 3px solid #3b82f6; padding-left: 6px; }
    .level-debug { border-left: 3px solid #6b7280; padding-left: 6px; }
    .level-unknown { border-left: 3px solid #9ca3af; padding-left: 6px; }
  </style>
</head>
<body>
  <h1>Docker Logs Export - ${date}</h1>
  <div class="log-entries">
${lines}
  </div>
</body>
</html>`;
    }

    private formatTimestamp(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private escapeCsv(value: string): string {
        return `"${value.replace(/"/g, '""')}"`;
    }

    private padLevel(level: LogLevel): string {
        return level.toUpperCase().padEnd(5, ' ');
    }
}
