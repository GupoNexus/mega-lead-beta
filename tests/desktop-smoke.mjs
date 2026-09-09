import assert from "node:assert/strict";

const port = Number(process.argv[2] || 9223);
const deadline = Date.now() + 15_000;
let targets;
await new Promise((resolve) => setTimeout(resolve, 4000));
while (Date.now() < deadline) {
  try {
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
    if (targets?.length) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const target = targets?.find((item) => item.type === "page");
assert.ok(target?.webSocketDebuggerUrl, "Renderer do Mega Lead não apareceu no CDP");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let id = 0;
function evaluate(expression) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Tempo esgotado no renderer")), 20_000);
    const handler = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", handler);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result.result);
    };
    socket.addEventListener("message", handler);
    socket.send(JSON.stringify({ id: requestId, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

const status = await evaluate("window.megaLeadDesktop?.googlePlaces?.status()");
assert.equal(status.value?.configured, true, "Chave Google Places não chegou ao renderer");
const search = await evaluate("window.megaLeadDesktop.googlePlaces.search({segment:'móveis',state:'RJ',cities:['Rio de Janeiro'],neighborhoods:['Taquara'],maxResultsPerCity:1})");
assert.equal(search.value?.ok, true, "Busca local não retornou sucesso");
assert.ok(search.value?.leads?.length > 0, "Busca local não encontrou nenhum lead real");
console.log(JSON.stringify({ configured: true, results: search.value.leads.length, firstLeadHasPhone: Boolean(search.value.leads[0].phone) }));
socket.close();
