const TAB = '4438ACAC6AFFEB9B66D477FDB510CC22';
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + TAB);
let id = 1;

function send(method, params = {}) {
    return new Promise(resolve => {
        const msgId = id++;
        ws.addEventListener('message', function handler(ev) {
            const data = JSON.parse(ev.data);
            if (data.id === msgId) { ws.removeEventListener('message', handler); resolve(data.result); }
        });
        ws.send(JSON.stringify({ id: msgId, method, params }));
    });
}

const css = `
.window-app.t20-dialog .aprimoramentos-list { list-style: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
.window-app.t20-dialog .aprimoramentos-list .items-header { background: transparent !important; border: none !important; border-bottom: 1px solid rgba(106,78,24,0.4) !important; margin: 0 !important; padding: 4px 8px !important; }
.window-app.t20-dialog .aprimoramentos-list .items-header h3 { color: #8a7450 !important; font-family: 'Modesto Condensed','Palatino Linotype',serif !important; font-size: 0.75rem !important; font-weight: normal !important; letter-spacing: 0.1em !important; margin: 0 !important; text-transform: uppercase !important; }
.window-app.t20-dialog .aprimoramentos-list li.item { align-items: flex-start !important; border-bottom: 1px solid rgba(106,78,24,0.12) !important; min-height: 28px !important; padding: 5px 8px !important; }
.window-app.t20-dialog .aprimoramentos-list li.item:last-child { border-bottom: none !important; }
.window-app.t20-dialog .aprimoramentos-list .item-cost { align-items: center !important; flex-shrink: 0 !important; flex-wrap: nowrap !important; gap: 4px !important; min-height: 20px !important; }
.window-app.t20-dialog .aprimoramentos-list h4.item-name { font-size: 0.82rem !important; font-weight: normal !important; line-height: 1.4 !important; margin: 0 !important; padding: 0 !important; }
`;

ws.addEventListener('open', async () => {
    const code = `(function() {
    const existing = document.getElementById('t20-list-debug-css');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = 't20-list-debug-css';
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);
    return 'CSS injected — ' + document.querySelectorAll('.aprimoramentos-list').length + ' lists found';
})()`;
    const r = await send('Runtime.evaluate', { expression: code });
    console.log(r?.result?.value || JSON.stringify(r?.result));
    ws.close();
});
