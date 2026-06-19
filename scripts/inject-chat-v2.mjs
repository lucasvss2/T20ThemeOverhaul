const TAB = 'D873ACF83001B57342D2A0FACDBFD42A';
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + TAB);
let id = 1;
function send(method, params) {
    return new Promise(resolve => {
        const msgId = id++;
        ws.addEventListener('message', function h(ev) {
            const d = JSON.parse(ev.data);
            if (d.id === msgId) { ws.removeEventListener('message', h); resolve(d.result); }
        });
        ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
    });
}

const css = `
/* ── T20 Chat Card ──────────────────────────────────────────────────────── */

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
.chat-message:has(.tormenta20.chat-card.item-card) .message-delete:hover { color: #cc4444 !important; }

.tormenta20.chat-card.item-card {
    background: radial-gradient(ellipse at top, #1c1209 0%, #090604 100%) !important;
    border: 1px solid rgba(106,78,24,0.45) !important;
    border-radius: 4px !important;
    box-shadow: 0 0 0 1px #2a1e08, 0 4px 18px rgba(0,0,0,0.75) !important;
    font-family: "Modesto Condensed", "Palatino Linotype", serif !important;
    padding: 0 !important;
    overflow: hidden !important;
}

.tormenta20.chat-card.item-card .card-header {
    background: linear-gradient(to right, transparent, rgba(106,78,24,0.14), transparent) !important;
    border-bottom: 1px solid rgba(106,78,24,0.4) !important;
    padding: 8px 12px !important;
    gap: 8px !important;
    align-items: center !important;
}
.tormenta20.chat-card.item-card .card-header img {
    border: 1px solid rgba(106,78,24,0.4) !important;
    border-radius: 3px !important;
    width: 32px !important; height: 32px !important;
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
    text-shadow: 0 0 14px rgba(200,169,110,0.35) !important;
    margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important;
}

.tormenta20.chat-card.item-card > .row {
    color: #7a6e5a !important;
    font-size: 0.68rem !important;
    letter-spacing: 0.14em !important;
    text-transform: uppercase !important;
    padding: 5px 12px 1px !important;
    border-top: 1px solid rgba(106,78,24,0.18) !important;
    margin: 0 !important;
}

.tormenta20.chat-card.item-card .card-item-header {
    border-top: 1px solid rgba(106,78,24,0.2) !important;
    padding: 5px 12px !important;
}
.tormenta20.chat-card.item-card .card-item-header h4 {
    color: #9a8e7a !important;
    font-family: "Modesto Condensed","Palatino Linotype",serif !important;
    font-size: 0.72rem !important;
    font-weight: normal !important;
    letter-spacing: 0.1em !important;
    margin: 0 0 3px !important;
    text-transform: uppercase !important;
}
.tormenta20.chat-card.item-card .card-item-header p {
    color: #c0b49a !important;
    font-size: 0.74rem !important;
    line-height: 1.5 !important;
    margin: 0 !important;
}
.tormenta20.chat-card.item-card .card-item-header b {
    color: #c8a96e !important;
    font-weight: normal !important;
}
.tormenta20.chat-card.item-card .card-content {
    padding: 6px 12px !important;
    border-top: 1px solid rgba(106,78,24,0.15) !important;
}
.tormenta20.chat-card.item-card .card-content p {
    color: #b8ad9a !important;
    font-family: "Palatino Linotype","Book Antiqua",serif !important;
    font-size: 0.76rem !important;
    line-height: 1.55 !important;
    margin: 0 0 4px !important;
}
.tormenta20.chat-card.item-card .card-content em { color: #9a8e7a !important; }
.tormenta20.chat-card.item-card .card-content a { color: #c8a96e !important; }
.tormenta20.chat-card.item-card .card-item-effects {
    border-top: 1px solid rgba(106,78,24,0.2) !important;
    padding: 4px 8px !important;
}
.tormenta20.chat-card.item-card .chat-apply-ae {
    background: rgba(106,78,24,0.15) !important;
    border: 1px solid rgba(106,78,24,0.4) !important;
    color: #c8a96e !important;
    font-size: 0.74rem !important;
    border-radius: 3px !important;
    padding: 3px 8px !important;
    gap: 6px !important;
}
.tormenta20.chat-card.item-card .chat-apply-ae img { width: 16px !important; height: 16px !important; border: none !important; }
.tormenta20.chat-card.item-card .chat-apply-ae:hover { background: rgba(106,78,24,0.32) !important; }

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
    color: #c8b896 !important;
    font-family: monospace !important;
    font-size: 0.78rem !important;
    background: rgba(0,0,0,0.3) !important;
    border: 1px solid rgba(106,78,24,0.25) !important;
    border-radius: 3px !important;
    padding: 2px 10px !important;
    text-align: center !important;
}

/* Total — normal */
.tormenta20.chat-card.item-card .dice-total {
    color: #f0ebe0 !important;
    background: transparent !important;
    font-family: "Modesto Condensed", "Palatino Linotype", serif !important;
    font-size: 2.6rem !important;
    font-weight: 900 !important;
    line-height: 1 !important;
    text-shadow: 0 0 20px rgba(255,255,255,0.08) !important;
    border: none !important;
    padding: 4px 8px 2px !important;
    margin: 0 !important;
}
/* Crítico — número verde */
.tormenta20.chat-card.item-card .dice-total.critical {
    color: #6ecf7a !important;
    background: transparent !important;
    text-shadow: 0 0 24px rgba(110,207,122,0.6) !important;
}
/* Fumble — número vermelho */
.tormenta20.chat-card.item-card .dice-total.fumble {
    color: #cc4444 !important;
    background: transparent !important;
    text-shadow: 0 0 24px rgba(204,68,68,0.6) !important;
}

/* ── Área expansível (dice-tooltip) ─────────────────────────────────────── */
.tormenta20.chat-card.item-card .dice-tooltip {
    background: rgba(10,6,2,0.85) !important;
    border-top: 1px solid rgba(106,78,24,0.25) !important;
    margin-top: 4px !important;
    padding: 6px 0 4px !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .part-header {
    background: rgba(106,78,24,0.12) !important;
    border-bottom: 1px solid rgba(106,78,24,0.2) !important;
    padding: 3px 8px !important;
    margin-bottom: 4px !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .part-formula {
    color: #a89880 !important;
    font-family: monospace !important;
    font-size: 0.72rem !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .part-flavor {
    color: #7a6e5a !important;
    font-style: italic !important;
    font-size: 0.7rem !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .part-total {
    color: #e8e0d0 !important;
    background: rgba(0,0,0,0.3) !important;
    font-weight: 700 !important;
    font-size: 0.78rem !important;
    padding: 0 6px !important;
    border-radius: 2px !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .dice-rolls {
    list-style: none !important;
    padding: 2px 8px 4px !important;
    margin: 0 !important;
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 4px !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .roll.die {
    color: #e8e0d0 !important;
    background: rgba(30,20,8,0.9) !important;
    border: 1px solid rgba(106,78,24,0.4) !important;
    border-radius: 3px !important;
    padding: 2px 6px !important;
    font-size: 0.78rem !important;
    min-width: 22px !important;
    text-align: center !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .roll.die.max {
    color: #6ecf7a !important;
    border-color: rgba(110,207,122,0.5) !important;
}
.tormenta20.chat-card.item-card .dice-tooltip .roll.die.min {
    color: #cc4444 !important;
    border-color: rgba(204,68,68,0.5) !important;
}

/* Upgrades */
.tormenta20.chat-card.item-card .card-upgrades {
    border-top: 1px solid rgba(106,78,24,0.2) !important;
    padding: 4px 10px !important;
}
.tormenta20.chat-card.item-card .card-upgrades ul { list-style: none !important; margin: 0 !important; padding: 0 !important; }
.tormenta20.chat-card.item-card .card-upgrades .row { color: #7a6e5a !important; font-size: 0.74rem !important; padding: 1px 4px !important; border: none !important; letter-spacing: 0.06em !important; }
.tormenta20.chat-card.item-card .card-upgrades b { color: #a89880 !important; }

.tormenta20.chat-card.item-card .chat-spend-mana {
    background: rgba(106,78,24,0.18) !important;
    border: 1px solid rgba(106,78,24,0.45) !important;
    color: #c8a96e !important;
    font-size: 0.72rem !important;
    border-radius: 3px !important;
    padding: 2px 8px !important;
}
.tormenta20.chat-card.item-card .chat-spend-mana:hover { background: rgba(106,78,24,0.4) !important; }

.tormenta20.chat-card.item-card .dice-btn button {
    background: rgba(106,78,24,0.15) !important;
    border: 1px solid rgba(106,78,24,0.35) !important;
    color: #9a8e7a !important;
    border-radius: 3px !important;
}
.tormenta20.chat-card.item-card .dice-btn button:hover { background: rgba(106,78,24,0.35) !important; color: #c8a96e !important; }
`;

ws.addEventListener('open', async () => {
    const r = await send('Runtime.evaluate', {
        expression: `(function(){
            const existing = document.getElementById('t20-chat-debug-css');
            if (existing) existing.remove();
            const style = document.createElement('style');
            style.id = 't20-chat-debug-css';
            style.textContent = ${JSON.stringify(css)};
            document.head.appendChild(style);
            const crit = document.querySelector('.dice-total.critical');
            const fumble = document.querySelector('.dice-total.fumble');
            return 'injected | crit: ' + !!crit + ' | fumble: ' + !!fumble;
        })()`,
        returnByValue: true
    });
    console.log(r?.result?.value);
    ws.close();
});
