const params = new URLSearchParams(location.search);
const role = params.get("role");
const room = params.get("room");
const policy = params.get("policy") === "relay" ? "relay" : "all";
const apiKey = window.CRAZY_RUMMY_METERED_KEY;
const statusElement = document.querySelector("#status");
const reportElement = document.querySelector("#report");
const codeElement = document.querySelector("#test-code");
const testCode = room?.match(/-manual-([2-9A-HJ-NP-Z]{6})$/)?.[1] || "LEGACY";
let peerTimeout;
let connectionTimeout;

const report = {
  role,
  room,
  testCode,
  provider: "Metered",
  startedAt: new Date().toISOString(),
  pageInstanceId: crypto.randomUUID(),
  signallingState: "starting",
  peerJoined: false,
  iceTransportPolicy: policy,
  expectedPath: policy === "relay" ? "relay" : "direct",
  configuredTurn: false,
  connectionState: "new",
  channelState: "connecting",
  payloadRoundTrip: false,
  passed: false,
};
window.__probeReport = report;
codeElement.textContent = testCode;

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
  let sentHello = false;

  peer.on("error", ({ err }) => fail(err));
  peer.on("peer-joined", ({ peer: remote }) => {
    clearTimeout(peerTimeout);
    report.peerJoined = true;
    report.peerJoinedAt = new Date().toISOString();
    report.signallingState = "peer-joined";
    remotePeer = remote;
    connectionTimeout = setTimeout(() => {
      fail(new Error("Matching peer joined, but the WebRTC data channel did not complete."));
    }, 45_000);
    remote.on("negotiation-error", ({ err }) => fail(err));
    remote.on("state-change", ({ to }) => {
      report.connectionState = to;
      render("Connecting...");
    });
    remote.on("data-channel", ({ channel }) => wireChannel(channel));
    if (!remote.polite) {
      wireChannel(remote.pc.createDataChannel("crazy-rummy-probe", { ordered: true }));
    }
  });

  await peer.join(room);
  report.signallingState = "joined";
  report.joinedAt = new Date().toISOString();
  if (!report.peerJoined) {
    peerTimeout = setTimeout(() => {
      fail(new Error(
        `No matching peer joined code ${testCode}. Confirm both devices show the same code and opposite sides.`,
      ));
    }, 45_000);
  }
  render(`Waiting for matching code ${testCode}...`);

  function wireChannel(channel) {
    if (dataChannel === channel) return;
    dataChannel = channel;
    report.channelState = channel.readyState;
    render("Opening data channel...");

    channel.addEventListener("open", () => {
      report.channelState = channel.readyState;
      render("Data channel open.");
      if (!sentHello) {
        sentHello = true;
        channel.send(JSON.stringify({ type: "hello", role }));
      }
    });

    channel.addEventListener("message", async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "hello") {
        report.remoteRole = message.role;
        if (message.role === role) {
          fail(new Error(`Both devices opened the ${role} side. Open one desktop and one phone side.`));
          return;
        }
        if (role === "host" && !sentProbe) {
          sentProbe = true;
          channel.send(JSON.stringify({
            type: "probe",
            nonce: crypto.randomUUID(),
            sentAt: Date.now(),
          }));
        }
        return;
      }
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
    clearTimeout(peerTimeout);
    clearTimeout(connectionTimeout);
    if (!remotePeer) throw new Error("Remote peer disappeared before result collection.");
    Object.assign(report, await collectSelectedPair(remotePeer.pc));
    const relaySelected =
      report.localCandidateType === "relay" && report.remoteCandidateType === "relay";
    report.selectedPath = relaySelected ? "relay" : "direct";
    report.finishedAt = new Date().toISOString();
    report.passed =
      report.configuredTurn &&
      report.payloadRoundTrip &&
      (policy === "relay" ? relaySelected : !relaySelected);
    if (!report.passed) {
      report.failure = policy === "relay"
        ? "Forced relay did not select TURN candidates on both ends."
        : "The automatic path used TURN, so this run did not prove a direct path.";
    }
    statusElement.dataset.status = report.passed ? "passed" : "failed";
    render(report.passed ? "Passed" : "Failed");
  }
} catch (error) {
  fail(error);
}

function validateInput() {
  if (!["host", "guest"].includes(role)) throw new Error("Invalid role.");
  if (!/^crazy-rummy-(direct|relay)-[a-zA-Z0-9_-]{12,72}$/.test(room || "")) {
    throw new Error("Invalid Crazy Rummy test room.");
  }
  if (!/^pk_live_[a-zA-Z0-9]+$/.test(apiKey || "")) {
    throw new Error("Metered publishable configuration is missing.");
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
  if (!selectedPair) throw new Error("No selected ICE candidate pair was reported.");
  const localCandidate = stats.get(selectedPair.localCandidateId);
  const remoteCandidate = stats.get(selectedPair.remoteCandidateId);
  return {
    localCandidateType: localCandidate?.candidateType || null,
    remoteCandidateType: remoteCandidate?.candidateType || null,
    protocol: localCandidate?.protocol || null,
    relayProtocol: localCandidate?.relayProtocol || null,
  };
}

function fail(error) {
  clearTimeout(peerTimeout);
  clearTimeout(connectionTimeout);
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
