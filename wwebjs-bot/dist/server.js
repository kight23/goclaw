/**
 * WebSocket server for Python-Node.js bridge communication.
 * Security: binds to 127.0.0.1 only; optional BRIDGE_TOKEN auth.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { WhatsAppClient } from './whatsapp.js';
export class BridgeServer {
    port;
    authDir;
    token;
    wss = null;
    wa = null;
    clients = new Set();
    constructor(port, authDir, token) {
        this.port = port;
        this.authDir = authDir;
        this.token = token;
    }
    async start() {
        // Bind to localhost only — never expose to external network
        this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.port });
        console.log(`🌉 Bridge server listening on ws://127.0.0.1:${this.port}`);
        if (this.token)
            console.log('🔒 Token authentication enabled');
        // Initialize WhatsApp client
        this.wa = new WhatsAppClient({
            authDir: this.authDir,
            onMessage: (msg) => {
                // Normalize for GoClaw @whatsapp channel expectations.
                // 'from' and 'chat' must be the WhatsApp JID (e.g. 8490XXXXX@s.whatsapp.net).
                // 'id' is the message ID (unique per message), not chat identifier.
                this.broadcast({
                    type: 'message',
                    from: msg.sender,
                    chat: msg.sender,
                    id: msg.id,
                    from_name: msg.pushName,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    is_group: msg.isGroup,
                    media: msg.media || [],
                });
            },
            onQR: (qr) => this.broadcast({ type: 'qr', qr }),
            onStatus: (status) => this.broadcast({ type: 'status', status }),
        });
        // Handle WebSocket connections
        this.wss.on('connection', (ws) => {
            if (this.token) {
                // Require auth handshake as first message
                const timeout = setTimeout(() => ws.close(4001, 'Auth timeout'), 5000);
                ws.once('message', (data) => {
                    clearTimeout(timeout);
                    try {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === 'auth' && msg.token === this.token) {
                            console.log('🔗 Python client authenticated');
                            this.setupClient(ws);
                        }
                        else {
                            ws.close(4003, 'Invalid token');
                        }
                    }
                    catch {
                        ws.close(4003, 'Invalid auth message');
                    }
                });
            }
            else {
                console.log('🔗 Python client connected');
                this.setupClient(ws);
            }
        });
        // Connect to WhatsApp
        await this.wa.connect();
    }
    setupClient(ws) {
        this.clients.add(ws);
        ws.on('message', async (data) => {
            try {
                const cmd = JSON.parse(data.toString());
                await this.handleCommand(cmd);
                ws.send(JSON.stringify({ type: 'sent', to: cmd.to }));
            }
            catch (error) {
                console.error('Error handling command:', error);
                ws.send(JSON.stringify({ type: 'error', error: String(error) }));
            }
        });
        ws.on('close', () => {
            console.log('🔌 Python client disconnected');
            this.clients.delete(ws);
        });
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.clients.delete(ws);
        });
    }
    normalizeTo(to) {
        if (!to)
            return to;
        if (to.includes('@'))
            return to;
        // Rough group detection: long ID or contains common group patterns
        if (to.length > 15 || to.includes('-')) {
            return `${to}@g.us`;
        }
        return `${to}@s.whatsapp.net`;
    }
    async handleCommand(cmd) {
        if (!this.wa)
            return;
        const normalizedTo = this.normalizeTo(cmd.to);
        if (cmd.type === 'send') {
            await this.wa.sendMessage(normalizedTo, cmd.text);
        }
        else if (cmd.type === 'message') {
            await this.wa.sendMessage(normalizedTo, cmd.content);
        }
        else if (cmd.type === 'send_media') {
            await this.wa.sendMedia(normalizedTo, cmd.filePath, cmd.mimetype, cmd.caption, cmd.fileName);
        }
        else if (cmd.type === 'send_outbound') {
            console.log(`📤 [Outbound] Sending to ${normalizedTo}: "${cmd.content.substring(0, 50)}..." ${cmd.media?.length ? `+ ${cmd.media.length} media` : ''}`);
            await this.wa.sendOutboundMessage(normalizedTo, cmd.content, cmd.media, cmd.metadata);
            console.log(`✅ [Outbound] Sent successfully to ${normalizedTo}`);
        }
    }
    broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        }
    }
    async stop() {
        // Close all client connections
        for (const client of this.clients) {
            client.close();
        }
        this.clients.clear();
        // Close WebSocket server
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
        // Disconnect WhatsApp
        if (this.wa) {
            await this.wa.disconnect();
            this.wa = null;
        }
    }
}
