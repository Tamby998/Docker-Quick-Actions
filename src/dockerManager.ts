import Dockerode from 'dockerode';
import { EventEmitter } from 'events';

export interface ContainerInfo {
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    ports: string;
}

export class DockerManager extends EventEmitter {
    private docker: Dockerode;

    constructor() {
        super();
        this.docker = new Dockerode();
    }

    async listContainers(): Promise<ContainerInfo[]> {
        try {
            const containers = await this.docker.listContainers({ all: true });
            return containers.map(c => ({
                id: c.Id,
                name: c.Names[0]?.replace(/^\//, '') || 'unknown',
                image: c.Image,
                state: c.State,
                status: c.Status,
                ports: c.Ports?.map(p =>
                    p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : `${p.PrivatePort}`
                ).filter(Boolean).join(', ') || ''
            }));
        } catch (error: any) {
            throw new Error(`Failed to list containers: ${error.message}`);
        }
    }

    async startContainer(id: string): Promise<void> {
        try {
            const container = this.docker.getContainer(id);
            await container.start();
        } catch (error: any) {
            throw new Error(`Failed to start container: ${error.message}`);
        }
    }

    async stopContainer(id: string): Promise<void> {
        try {
            const container = this.docker.getContainer(id);
            await container.stop();
        } catch (error: any) {
            throw new Error(`Failed to stop container: ${error.message}`);
        }
    }

    async restartContainer(id: string): Promise<void> {
        try {
            const container = this.docker.getContainer(id);
            await container.restart();
        } catch (error: any) {
            throw new Error(`Failed to restart container: ${error.message}`);
        }
    }

    async removeContainer(id: string, force: boolean = false): Promise<void> {
        try {
            const container = this.docker.getContainer(id);
            await container.remove({ force });
        } catch (error: any) {
            throw new Error(`Failed to remove container: ${error.message}`);
        }
    }

    async getContainerLogs(id: string, follow: boolean = false): Promise<NodeJS.ReadableStream> {
        try {
            const container = this.docker.getContainer(id);
            if (follow) {
                const stream = await container.logs({
                    follow: true,
                    stdout: true,
                    stderr: true,
                    tail: 200,
                    timestamps: true
                });
                return stream;
            } else {
                const buffer = await container.logs({
                    follow: false,
                    stdout: true,
                    stderr: true,
                    tail: 200,
                    timestamps: true
                });
                const { Readable } = require('stream');
                const stream = new Readable();
                stream.push(buffer);
                stream.push(null);
                return stream;
            }
        } catch (error: any) {
            throw new Error(`Failed to get logs: ${error.message}`);
        }
    }

    async isDockerRunning(): Promise<boolean> {
        try {
            await this.docker.ping();
            return true;
        } catch {
            return false;
        }
    }
}
