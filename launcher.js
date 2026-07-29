const storageKey = "crazy-rummy-network-test-code";
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
let testCode = normalizeCode(sessionStorage.getItem(storageKey));
if (!testCode) testCode = createCode();

const codeInput = document.querySelector("#test-code");
const applyButton = document.querySelector("#apply-code");
codeInput.value = testCode;
applyCode(testCode);

codeInput.addEventListener("input", () => {
  codeInput.value = normalizeCode(codeInput.value, true);
});

applyButton.addEventListener("click", () => {
  const nextCode = normalizeCode(codeInput.value);
  const status = document.querySelector("#copy-status");
  if (!nextCode) {
    status.textContent = "Enter the complete six-character code shown on the other device.";
    return;
  }
  applyCode(nextCode);
  status.textContent = `Using test code ${nextCode}. Confirm both devices show this code.`;
});

for (const button of document.querySelectorAll("[data-copy-link]")) {
  button.addEventListener("click", async () => {
    const link = document.querySelector(`#${button.dataset.copyLink}`);
    const status = document.querySelector("#copy-status");
    try {
      await navigator.clipboard.writeText(link.href);
      status.textContent = "Phone link copied. Send or paste it to the cellular phone.";
    } catch {
      status.textContent = `Copy this address to the phone: ${link.href}`;
    }
  });
}

function setLink(id, room, role, policy) {
  const link = document.querySelector(`#${id}`);
  link.href = `./probe.html?room=${encodeURIComponent(room)}&role=${role}&policy=${policy}`;
  if (role === "host") {
    link.target = "_blank";
    link.rel = "noopener";
  }
}

function applyCode(code) {
  testCode = code;
  sessionStorage.setItem(storageKey, testCode);
  codeInput.value = testCode;
  document.querySelector("#active-code").textContent = testCode;
  const suffix = `manual-${testCode}`;
  setLink("direct-host", `crazy-rummy-direct-${suffix}`, "host", "all");
  setLink("direct-guest", `crazy-rummy-direct-${suffix}`, "guest", "all");
  setLink("relay-host", `crazy-rummy-relay-${suffix}`, "host", "relay");
  setLink("relay-guest", `crazy-rummy-relay-${suffix}`, "guest", "relay");
}

function normalizeCode(value, partial = false) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[^2-9A-HJ-NP-Z]/g, "")
    .slice(0, 6);
  return partial || normalized.length === 6 ? normalized : "";
}

function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
}
