chrome.runtime.sendMessage({ type: "lm-command", action: "status" }, (res) => {
  const el = document.getElementById("status");
  if (!res || !res.ok) {
    el.textContent = "Erro ao verificar status";
    el.className = "status off";
    return;
  }
  if (res.data.connected) {
    el.textContent = "WhatsApp Web conectado ✓";
    el.className = "status ok";
  } else {
    el.textContent = "Abra o WhatsApp Web e escaneie o QR";
    el.className = "status off";
  }
});
