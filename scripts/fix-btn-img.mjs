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
.tormenta20.chat-card.item-card .chat-apply-ae {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    overflow: hidden !important;
    position: relative !important;
}
.tormenta20.chat-card.item-card .chat-apply-ae img {
    position: static !important;
    display: inline-block !important;
    width: 18px !important;
    height: 18px !important;
    margin: 0 !important;
    flex-shrink: 0 !important;
    border: none !important;
    border-radius: 2px !important;
    object-fit: contain !important;
}
`;

ws.addEventListener('open', async () => {
    const r = await send('Runtime.evaluate', {
        expression: `(function(){
            const existing = document.getElementById('t20-chat-btn-fix');
            if (existing) existing.remove();
            const style = document.createElement('style');
            style.id = 't20-chat-btn-fix';
            style.textContent = ${JSON.stringify(css)};
            document.head.appendChild(style);
            const btns = document.querySelectorAll('.tormenta20.chat-card.item-card .chat-apply-ae');
            return 'injected — ' + btns.length + ' buttons found';
        })()`,
        returnByValue: true
    });
    console.log(r?.result?.value);
    ws.close();
});
