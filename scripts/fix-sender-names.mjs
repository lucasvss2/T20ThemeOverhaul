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

const senderCss = `
.chat-message:has(.tormenta20.chat-card.item-card) .message-sender {
    color: #d4c4a0 !important;
    text-shadow:
        -1px -1px 0 rgba(0,0,0,0.85),
         1px -1px 0 rgba(0,0,0,0.85),
        -1px  1px 0 rgba(0,0,0,0.85),
         1px  1px 0 rgba(0,0,0,0.85),
        0 0 6px rgba(0,0,0,0.9) !important;
}
`;

const LABELS = { attack: 'Ataque', damage: 'Dano', initiative: 'Iniciativa', skill: 'Perícia', save: 'Resistência' };

ws.addEventListener('open', async () => {
    const r = await send('Runtime.evaluate', {
        expression: `(function(){
            // Fix sender CSS
            const ex = document.getElementById('t20-sender-fix');
            if (ex) ex.remove();
            const style = document.createElement('style');
            style.id = 't20-sender-fix';
            style.textContent = ${JSON.stringify(senderCss)};
            document.head.appendChild(style);

            // Fix empty item names
            const LABELS = ${JSON.stringify(LABELS)};
            let fixed = 0;
            const empties = [...document.querySelectorAll('.tormenta20.chat-card.item-card')].filter(c =>
                !c.querySelector('.item-name div')?.textContent?.trim()
            );
            for (const card of empties) {
                const li = card.closest('[data-message-id]');
                const msg = game.messages?.get(li?.dataset?.messageId);
                const type = msg?.rolls?.[0]?.options?.type ?? '';
                const nameDiv = card.querySelector('.item-name div');
                if (nameDiv && LABELS[type]) { nameDiv.textContent = LABELS[type]; fixed++; }
            }
            return 'sender fix injected | names fixed: ' + fixed;
        })()`,
        returnByValue: true
    });
    console.log(r?.result?.value);
    ws.close();
});
