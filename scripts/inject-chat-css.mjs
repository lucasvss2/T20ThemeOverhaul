import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const http = require('http');
const net = require('net');

function getTabId() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                const tabs = JSON.parse(data);
                const tab = tabs.find(t => t.title === 'Foundry Virtual Tabletop');
                resolve(tab?.id);
            });
        }).on('error', reject);
    });
}

const css = `
/* ── T20 Chat Card Styling ────────────────────────────────────────────────── */

.chat-message:has(.tormenta20.chat-card.item-card) {
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    padding: 2px 0 !important;
}

.chat-message:has(.tormenta20.chat-card.item-card) .message-header {
    background: transparent !important;
    border: none !important;
    padding: 1px 6px !important;
}

.chat-message:has(.tormenta20.chat-card.item-card) .message-sender {
    color: #9a8e7a !important;
    font-family: "Modesto Condensed", "Palatino Linotype", serif !important;
    font-size: 0.68rem !important;
    letter-spacing: 0.12em !important;
    text-transform: uppercase !important;
}

.chat-message:has(.tormenta20.chat-card.item-card) .message-metadata,
.chat-message:has(.tormenta20.chat-card.item-card) .message-timestamp,
.chat-message:has(.tormenta20.chat-card.item-card) .message-delete {
    color: #3a2e22 !important;
    font-size: 0.62rem !important;
}
.chat-message:has(.tormenta20.chat-card.item-card) .message-delete:hover {
    color: #cc4444 !important;
}

/* Main card */
.tormenta20.chat-card.item-card {
    background: radial-gradient(ellipse at top, #1c1209 0%, #090604 100%) !important;
    border: 1px solid rgba(106, 78, 24, 0.45) !important;
    border-radius: 4px !important;
    box-shadow:
        0 0 0 1px #2a1e08,
        0 4px 18px rgba(0, 0, 0, 0.75) !important;
    font-family: "Modesto Condensed", "Palatino Linotype", serif !important;
    padding: 0 !important;
    overflow: hidden !important;
}

/* Card header */
.tormenta20.chat-card.item-card .card-header {
    background: linear-gradient(to right, transparent, rgba(106, 78, 24, 0.14), transparent) !important;
    border-bottom: 1px solid rgba(106, 78, 24, 0.4) !important;
    padding: 8px 12px !important;
    gap: 8px !important;
    align-items: center !important;
}

.tormenta20.chat-card.item-card .card-header img {
    border: 1px solid rgba(106, 78, 24, 0.4) !important;
    border-radius: 3px !important;
    width: 32px !important;
    height: 32px !important;
    flex-shrink: 0 !important;
}

.tormenta20.chat-card.item-card .item-name,
.tormenta20.chat-card.item-card .item-name div {
    color: #c8a96e !important;
    font-family: "Modesto Condensed", "Palatino Linotype", serif !important;
    font-size: 1.05rem !important;
    font-weight: 700 !important;
    letter-spacing: 0.1em !important;
    text-transform: uppercase !important;
    text-shadow: 0 0 14px rgba(200, 169, 110, 0.35) !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    line-height: 1.2 !important;
}

/* Roll type label (Ataque, Dano) */
.tormenta20.chat-card.item-card > .row {
    color: #7a6e5a !important;
    font-size: 0.68rem !important;
    letter-spacing: 0.14em !important;
    text-transform: uppercase !important;
    padding: 5px 12px 1px !important;
    border-top: 1px solid rgba(106, 78, 24, 0.18) !important;
    margin: 0 !important;
}
.tormenta20.chat-card.item-card > .row:first-of-type {
    border-top: none !important;
}

/* Dice roll wrapper */
.tormenta20.chat-card.item-card .dice-roll {
    padding: 4px 12px 10px !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}

.tormenta20.chat-card.item-card .dice-result {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 2px !important;
}

/* Formula */
.tormenta20.chat-card.item-card .dice-formula {
    color: #a89880 !important;
    font-family: monospace !important;
    font-size: 0.78rem !important;
    background: rgba(0, 0, 0, 0.25) !important;
    border: 1px solid rgba(106, 78, 24, 0.22) !important;
    border-radius: 3px !important;
    padding: 2px 10px !important;
    cursor: default !important;
    width: auto !important;
}

/* Total */
.tormenta20.chat-card.item-card .dice-total {
    color: #f0ebe0 !important;
    font-family: "Modesto Condensed", "Palatino Linotype", serif !important;
    font-size: 2.6rem !important;
    font-weight: 900 !important;
    line-height: 1 !important;
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.08) !important;
    border: none !important;
    padding: 4px 0 2px !important;
    margin: 0 !important;
}

/* Upgrades / enhancements */
.tormenta20.chat-card.item-card .card-upgrades {
    border-top: 1px solid rgba(106, 78, 24, 0.2) !important;
    padding: 4px 10px !important;
}

.tormenta20.chat-card.item-card .card-upgrades ul {
    list-style: none !important;
    margin: 0 !important;
    padding: 0 !important;
}

.tormenta20.chat-card.item-card .card-upgrades li {
    padding: 1px 0 !important;
}

.tormenta20.chat-card.item-card .card-upgrades .row {
    color: #7a6e5a !important;
    font-size: 0.74rem !important;
    padding: 1px 4px !important;
    border: none !important;
    letter-spacing: 0.06em !important;
}

.tormenta20.chat-card.item-card .card-upgrades b {
    color: #a89880 !important;
}

/* Mana button */
.tormenta20.chat-card.item-card .chat-spend-mana {
    background: rgba(106, 78, 24, 0.18) !important;
    border: 1px solid rgba(106, 78, 24, 0.45) !important;
    color: #c8a96e !important;
    font-family: "Modesto Condensed", "Palatino Linotype", serif !important;
    font-size: 0.72rem !important;
    border-radius: 3px !important;
    padding: 2px 8px !important;
    cursor: pointer !important;
    transition: background 0.15s !important;
}
.tormenta20.chat-card.item-card .chat-spend-mana:hover {
    background: rgba(106, 78, 24, 0.4) !important;
}

/* Damage apply buttons */
.tormenta20.chat-card.item-card .dice-btn button {
    background: rgba(106, 78, 24, 0.15) !important;
    border: 1px solid rgba(106, 78, 24, 0.35) !important;
    color: #9a8e7a !important;
    border-radius: 3px !important;
}
.tormenta20.chat-card.item-card .dice-btn button:hover {
    background: rgba(106, 78, 24, 0.35) !important;
    color: #c8a96e !important;
}
`;

(async () => {
    const tabId = await getTabId();
    console.log('Tab ID:', tabId);

    // Use Node built-in WebSocket (Node 22 with --experimental-websocket)
    // Actually, let's use raw TCP since we don't have ws module
    const socket = net.connect(9222, '127.0.0.1', () => {
        const wsKey = Buffer.from('t20chat' + Date.now()).toString('base64');
        socket.write([
            `GET /devtools/page/${tabId} HTTP/1.1`,
            'Host: 127.0.0.1:9222',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${wsKey}`,
            'Sec-WebSocket-Version: 13',
            '', ''
        ].join('\r\n'));

        let upgraded = false;
        let buf = Buffer.alloc(0);
        let msgId = 1;

        function sendFrame(obj) {
            const payload = Buffer.from(JSON.stringify(obj));
            const len = payload.length;
            let header;
            if (len < 126) {
                header = Buffer.alloc(2);
                header[0] = 0x81;
                header[1] = len;
            } else {
                header = Buffer.alloc(4);
                header[0] = 0x81;
                header[1] = 126;
                header.writeUInt16BE(len, 2);
            }
            socket.write(Buffer.concat([header, payload]));
        }

        function parseFrame(buf) {
            if (buf.length < 2) return null;
            const payloadLen = buf[1] & 0x7f;
            if (payloadLen < 126) {
                if (buf.length < 2 + payloadLen) return null;
                return { data: buf.slice(2, 2 + payloadLen), rest: buf.slice(2 + payloadLen) };
            } else if (payloadLen === 126) {
                if (buf.length < 4) return null;
                const len = buf.readUInt16BE(2);
                if (buf.length < 4 + len) return null;
                return { data: buf.slice(4, 4 + len), rest: buf.slice(4 + len) };
            }
            return null;
        }

        socket.on('data', chunk => {
            buf = Buffer.concat([buf, chunk]);
            if (!upgraded) {
                const str = buf.toString();
                if (str.includes('\r\n\r\n')) {
                    upgraded = true;
                    const idx = buf.indexOf(Buffer.from('\r\n\r\n'));
                    buf = buf.slice(idx + 4);

                    // Send inject CSS command
                    const code = `(function() {
                        const existing = document.getElementById('t20-chat-debug-css');
                        if (existing) existing.remove();
                        const style = document.createElement('style');
                        style.id = 't20-chat-debug-css';
                        style.textContent = ${JSON.stringify(css)};
                        document.head.appendChild(style);
                        const count = document.querySelectorAll('.tormenta20.chat-card.item-card').length;
                        return 'CSS injected — ' + count + ' T20 item-cards found';
                    })()`;

                    sendFrame({ id: msgId++, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true } });
                }
            } else {
                const frame = parseFrame(buf);
                if (frame) {
                    buf = frame.rest;
                    const data = JSON.parse(frame.data.toString());
                    console.log(data?.result?.result?.value || JSON.stringify(data?.result));
                    socket.destroy();
                }
            }
        });

        socket.on('error', e => console.error('socket error:', e.message));
    });
})();
