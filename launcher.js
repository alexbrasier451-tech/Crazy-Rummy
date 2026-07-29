const seed = crypto.randomUUID().replaceAll("-", "");
setLink("direct-host", `crazy-rummy-direct-${seed}`, "host", "all");
setLink("direct-guest", `crazy-rummy-direct-${seed}`, "guest", "all");
setLink("relay-host", `crazy-rummy-relay-${seed}`, "host", "relay");
setLink("relay-guest", `crazy-rummy-relay-${seed}`, "guest", "relay");

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
}
