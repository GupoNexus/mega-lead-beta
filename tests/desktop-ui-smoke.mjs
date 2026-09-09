import assert from "node:assert/strict";

const port = Number(process.argv[2] || 9226);
await new Promise((resolve) => setTimeout(resolve, 5000));
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === "page");
assert.ok(target?.webSocketDebuggerUrl, "Janela do aplicativo não encontrada");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Tempo esgotado no teste de interface")), 30_000);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timeout);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result.result.value);
  });
  const expression = `(async () => {
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const leadsLink = [...document.querySelectorAll('a')].find((item) => item.textContent.includes('Leads'));
    if (leadsLink && !location.pathname.includes('leads')) { leadsLink.click(); await pause(1800); }
    const segment = [...document.querySelectorAll('input')].find((item) => item.value === '' || item.value === 'moveis');
    if (!segment) return { error: 'Campo de segmento não encontrado', path: location.pathname, body: document.body.innerText.slice(0, 500) };
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    inputSetter.call(segment, 'móveis');
    segment.dispatchEvent(new Event('input', { bubbles: true }));
    segment.dispatchEvent(new Event('change', { bubbles: true }));
    await pause(100);
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Iniciar Prospecção'));
    if (!button) return { error: 'Botão não encontrado', path: location.pathname };
    const disabledBeforeClick = button.disabled;
    button.click();
    await pause(15000);
    const body = document.body.innerText;
    return { path: location.pathname, disabledBeforeClick, started: body.includes('Busca enviada') || body.includes('Prospectando'), completed: body.includes('leads capturados') || body.includes('lead capturado') || body.includes('Nenhum lead novo'), warning: body.includes('chave Google Places local não foi encontrada'), bodyTail: body.slice(-600) };
  })()`;
  socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});

console.log(JSON.stringify(result));
assert.equal(result.error, undefined, result.error);
assert.equal(result.disabledBeforeClick, false, "Botão de prospecção permaneceu desativado");
assert.equal(result.warning, false, "Aviso incorreto da chave ainda apareceu");
assert.ok(result.started || result.completed, `Clique não iniciou a prospecção: ${JSON.stringify(result)}`);
socket.close();
