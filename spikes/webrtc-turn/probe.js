const parameters = new URLSearchParams(window.location.search);
const role = parameters.get("role");
const room = parameters.get("room");
const localId = role;
const remoteId = role === "host" ? "guest" : "host";
const statusElement = document.querySelector("#status");
const reportElement = document.querySelector("#report");

const state = {
  afterSequence: 0,
  channel: null,
  complete: false,
  connection: null,
  iceConfig: null,
  pendingCandidates: [],
  pollTimer: null,
  probeToken: null,
  report: {
    role,
    room,
    startedAt: new Date().toISOString(),
  },
};

window.__probeReport = state.report;

start().catch(fail);

async function start() {
  if (!["host", "guest"].includes(role) || !/^[a-zA-Z0-9_-]{6,80}$/.test(room || "")) {
    throw new Error("Use a valid room and role=host or role=guest.");
  }

  updateStatus("starting", `Starting ${role}…`);
  const response = await fetch("/api/ice", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ICE configuration failed with ${response.status}.`);
  }

  state.iceConfig = await response.json();
  state.report.iceTransportPolicy = state.iceConfig.iceTransportPolicy;
  state.report.configuredTurn = state.iceConfig.configuredTurn;

  const connection = new RTCPeerConnection({
    iceServers: state.iceConfig.iceServers,
    iceTransportPolicy: state.iceConfig.iceTransportPolicy,
  });
  state.connection = connection;

  connection.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) {
      sendSignal("candidate", candidate.toJSON()).catch(fail);
    }
  });

  connection.addEventListener("connectionstatechange", () => {
    state.report.connectionState = connection.connectionState;
    renderReport();
    if (["failed", "closed"].includes(connection.connectionState) && !state.complete) {
      fail(new Error(`Peer connection entered ${connection.connectionState}.`));
    }
  });

  if (role === "guest") {
    connection.addEventListener("datachannel", ({ channel }) => configureChannel(channel));
  } else {
    configureChannel(connection.createDataChannel("crazy-rummy-probe", { ordered: true }));
  }

  pollSignals();

  if (role === "host") {
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await sendSignal("offer", connection.localDescription);
    updateStatus("connecting", "Offer sent. Waiting for guest…");
  } else {
    updateStatus("connecting", "Waiting for host offer…");
  }
}

function configureChannel(channel) {
  state.channel = channel;
  channel.addEventListener("open", () => {
    state.report.channelState = channel.readyState;
    renderReport();
    if (role === "host") {
      state.probeToken = crypto.randomUUID();
      channel.send(JSON.stringify({
        type: "probe",
        token: state.probeToken,
        sentAt: new Date().toISOString(),
      }));
      updateStatus("testing", "Connected. Testing acknowledged payload…");
    } else {
      updateStatus("testing", "Connected. Waiting for probe payload…");
    }
  });

  channel.addEventListener("close", () => {
    state.report.channelState = channel.readyState;
    renderReport();
  });

  channel.addEventListener("message", async ({ data }) => {
    const message = JSON.parse(data);

    if (role === "guest" && message.type === "probe") {
      state.report.payloadReceived = true;
      channel.send(JSON.stringify({
        type: "ack",
        token: message.token,
        receivedAt: new Date().toISOString(),
      }));
      renderReport();
      return;
    }

    if (role === "host" && message.type === "ack" && message.token === state.probeToken) {
      state.report.payloadRoundTrip = true;
      Object.assign(state.report, await collectSelectedPair());
      const relayRequirementMet = relayRequirementIsMet(state.report);
      channel.send(JSON.stringify({
        type: "complete",
        relayRequirementMet,
      }));
      finish(relayRequirementMet);
      return;
    }

    if (role === "guest" && message.type === "complete") {
      state.report.payloadRoundTrip = true;
      Object.assign(state.report, await collectSelectedPair());
      finish(message.relayRequirementMet && relayRequirementIsMet(state.report));
    }
  });
}

async function pollSignals() {
  if (state.complete) {
    return;
  }

  try {
    const response = await fetch(
      `/api/signal?room=${encodeURIComponent(room)}&peer=${localId}&after=${state.afterSequence}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Signalling poll failed with ${response.status}.`);
    }

    const messages = await response.json();
    for (const message of messages) {
      state.afterSequence = Math.max(state.afterSequence, message.sequence);
      await applySignal(message);
    }
  } catch (error) {
    fail(error);
    return;
  }

  state.pollTimer = window.setTimeout(pollSignals, 100);
}

async function applySignal(message) {
  const connection = state.connection;

  if (message.type === "offer" && role === "guest") {
    await connection.setRemoteDescription(message.payload);
    await flushPendingCandidates();
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await sendSignal("answer", connection.localDescription);
    updateStatus("connecting", "Answer sent. Establishing data channel…");
    return;
  }

  if (message.type === "answer" && role === "host") {
    await connection.setRemoteDescription(message.payload);
    await flushPendingCandidates();
    updateStatus("connecting", "Answer received. Establishing data channel…");
    return;
  }

  if (message.type === "candidate") {
    if (connection.remoteDescription) {
      await connection.addIceCandidate(message.payload);
    } else {
      state.pendingCandidates.push(message.payload);
    }
  }
}

async function flushPendingCandidates() {
  const candidates = state.pendingCandidates.splice(0);
  for (const candidate of candidates) {
    await state.connection.addIceCandidate(candidate);
  }
}

async function sendSignal(type, payload) {
  const response = await fetch("/api/signal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      room,
      from: localId,
      to: remoteId,
      type,
      payload,
    }),
  });
  if (!response.ok) {
    throw new Error(`Signalling send failed with ${response.status}.`);
  }
}

async function collectSelectedPair() {
  const stats = await state.connection.getStats();
  let selectedPair;

  for (const item of stats.values()) {
    if (item.type === "transport" && item.selectedCandidatePairId) {
      selectedPair = stats.get(item.selectedCandidatePairId);
      break;
    }
  }

  if (!selectedPair) {
    selectedPair = [...stats.values()].find(
      (item) => item.type === "candidate-pair" && item.nominated && item.state === "succeeded",
    );
  }

  if (!selectedPair) {
    throw new Error("No selected ICE candidate pair was reported.");
  }

  const localCandidate = stats.get(selectedPair.localCandidateId);
  const remoteCandidate = stats.get(selectedPair.remoteCandidateId);
  return {
    candidatePairId: selectedPair.id,
    localCandidateType: localCandidate?.candidateType || null,
    remoteCandidateType: remoteCandidate?.candidateType || null,
    protocol: localCandidate?.protocol || null,
    relayProtocol: localCandidate?.relayProtocol || null,
    bytesSent: selectedPair.bytesSent || 0,
    bytesReceived: selectedPair.bytesReceived || 0,
  };
}

function relayRequirementIsMet(report) {
  if (state.iceConfig.iceTransportPolicy !== "relay") {
    return true;
  }
  return report.localCandidateType === "relay" && report.remoteCandidateType === "relay";
}

function finish(passed) {
  state.complete = true;
  window.clearTimeout(state.pollTimer);
  state.report.finishedAt = new Date().toISOString();
  state.report.passed = Boolean(passed);
  renderReport();
  updateStatus(
    passed ? "passed" : "failed",
    passed ? "Passed — acknowledged data channel established." : "Failed — relay requirement not met.",
  );
}

function fail(error) {
  if (state.complete) {
    return;
  }
  state.complete = true;
  window.clearTimeout(state.pollTimer);
  state.report.finishedAt = new Date().toISOString();
  state.report.passed = false;
  state.report.error = error instanceof Error ? error.message : String(error);
  renderReport();
  updateStatus("failed", `Failed — ${state.report.error}`);
}

function updateStatus(status, text) {
  statusElement.dataset.status = status;
  statusElement.textContent = text;
}

function renderReport() {
  window.__probeReport = structuredClone(state.report);
  reportElement.textContent = JSON.stringify(window.__probeReport, null, 2);
}

