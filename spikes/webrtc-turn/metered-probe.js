const params = new URLSearchParams(location.search);
const role = params.get("role");
const room = params.get("room");
const policy = params.get("policy") === "relay" ? "relay" : "all";
const apiKey = window.__METERED_PUBLISHABLE_KEY;
const statusElement = document.querySelector("#status");
const reportElement = document.querySelector("#report");

const report = {
  role,
  room,
  provider: "Metered",
  startedAt: new Date().toISOString(),
  iceTransportPolicy: policy,
  configuredTurn: false,
  connectionState: "new",
  channelState: "connecting",
  payloadRoundTrip: false,
  passed: false,
};

window.__probeReport = report;

try {
  validateInput();
  const sdk = window.MeteredPeer;
  if (!sdk?.MeteredPeer) {
    throw new Error("Metered browser SDK did not load.");
  }

  const peer = new sdk.MeteredPeer({
    apiKey,
    rtcPeerConnectionFactory(configuration) {
      report.configuredTurn = configuration.iceServers?.some((entry) =>
        listUrls(entry.urls).some((url) => /^turns?:/i.test(url)),
      );
      return new RTCPeerConnection({
        ...configuration,
        iceTransportPolicy: policy,
      });
    },
  });

  let remotePeer;
  let dataChannel;
  let sentProbe = false;

  peer.on("error", ({ err }) => fail(err));
  peer.on("peer-joined", ({ peer: remote }) => {
    remotePeer = remote;
    remote.on("negotiation-error", ({ err }) => fail(err));
    remote.on("state-change", ({ to }) => {
      report.connectionState = to;
      render("Connecting through Metered…");
    });
    remote.on("data-channel", ({ channel }) => wireChannel(channel));

    if (!remote.polite) {
      wireChannel(remote.pc.createDataChannel("crazy-rummy-probe", { ordered: true }));
    }
  });

  await peer.join(room);
  render("Joined Metered signalling. Waiting for peer…");

  function wireChannel(channel) {
    if (dataChannel === channel) {
      return;
    }
    dataChannel = channel;
    report.channelState = channel.readyState;
    render("Opening forced-relay data channel…");

    channel.addEventListener("open", () => {
      report.channelState = channel.readyState;
      render("Data channel open.");
      if (role === "host" && !sentProbe) {
        sentProbe = true;
        channel.send(JSON.stringify({
          type: "probe",
          nonce: crypto.randomUUID(),
          sentAt: Date.now(),
        }));
      }
    });

    channel.addEventListener("message", async ({ data }) => {
      const message = JSON.parse(data);
      if (role === "guest" && message.type === "probe") {
        report.payloadReceived = true;
        channel.send(JSON.stringify({
          type: "ack",
          nonce: message.nonce,
          receivedAt: Date.now(),
        }));
        report.payloadRoundTrip = true;
        await finish();
        return;
      }
      if (role === "host" && message.type === "ack") {
        report.payloadRoundTrip = true;
        await finish();
      }
    });

    channel.addEventListener("close", () => {
      report.channelState = channel.readyState;
      render("Data channel closed.");
    });
    channel.addEventListener("error", () => fail(new Error("RTC data channel error.")));
  }

  async function finish() {
    if (!remotePeer) {
      throw new Error("Remote peer disappeared before result collection.");
    }
    Object.assign(report, await collectSelectedPair(remotePeer.pc));
    report.finishedAt = new Date().toISOString();
    report.passed =
      report.configuredTurn &&
      report.payloadRoundTrip &&
      report.localCandidateType === "relay" &&
      report.remoteCandidateType === "relay";
    render(report.passed ? "Passed" : "Failed");
    statusElement.dataset.status = report.passed ? "passed" : "failed";
    if (!report.passed) {
      report.failure = "A forced-relay run must select relay candidates on both ends.";
    }
  }
} catch (error) {
  fail(error);
}

function validateInput() {
  if (!["host", "guest"].includes(role)) {
    throw new Error("role must be host or guest.");
  }
  if (!/^crazy-rummy-[a-zA-Z0-9_-]{6,64}$/.test(room || "")) {
    throw new Error("Invalid Crazy Rummy probe room.");
  }
  if (!/^pk_live_[a-zA-Z0-9]+$/.test(apiKey || "")) {
    throw new Error("A Metered publishable key is required.");
  }
}

function listUrls(urls) {
  return Array.isArray(urls) ? urls : [urls];
}

async function collectSelectedPair(connection) {
  const stats = await connection.getStats();
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

function fail(error) {
  report.failure = error instanceof Error ? error.message : String(error);
  report.finishedAt = new Date().toISOString();
  report.passed = false;
  statusElement.dataset.status = "failed";
  render("Failed");
}

function render(label) {
  statusElement.textContent = label;
  reportElement.textContent = JSON.stringify(report, null, 2);
}
