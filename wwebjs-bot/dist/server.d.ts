/**
 * WebSocket server for Python-Node.js bridge communication.
 * Security: binds to 127.0.0.1 only; optional BRIDGE_TOKEN auth.
 */
interface SendCommand {
    type: 'send';
    to: string;
    text: string;
}
interface SendMediaCommand {
    type: 'send_media';
    to: string;
    filePath: string;
    mimetype: string;
    caption?: string;
    fileName?: string;
}
interface WriteMessageCommand {
    type: 'message';
    to: string;
    content: string;
}
interface SendOutboundCommand {
    type: 'send_outbound';
    to: string;
    content: string;
    media?: string[];
    metadata?: Record<string, string>;
}
type BridgeCommand = SendCommand | SendMediaCommand | WriteMessageCommand | SendOutboundCommand;
export declare class BridgeServer {
    private port;
    private authDir;
    private token?;
    private wss;
    private wa;
    private clients;
    constructor(port: number, authDir: string, token?: string | undefined);
    start(): Promise<void>;
    private setupClient;
    private normalizeTo;
    handleCommand(cmd: BridgeCommand): Promise<void>;
    private broadcast;
    stop(): Promise<void>;
}
export {};
