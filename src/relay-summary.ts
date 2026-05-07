import type {
  RelayCompletedEvent,
  RelayLifecycleEvent,
  RelayProjection,
  WorkflowRegionSnapshot,
  WorkflowTargetSnapshot,
} from "@challenge-relay/projection/workflow";

type SubmitPageSummary = {
  url: string;
  title: string;
  successText: string;
  siteverify: unknown;
  tokenLength: number;
  tokenPrefix: string;
  hcaptchaResponseLength: number;
  recaptchaResponseLength: number;
};

type CaptchaResponseLengths = {
  url: string;
  title: string;
  hcaptchaResponseLength: number;
  recaptchaResponseLength: number;
};

type DemoSubmitResult = {
  ok: true;
  relay: {
    sessionId: string;
    reason: RelayCompletedEvent["reason"];
    lastProjectionId: string | null;
    activePartBefore: string | null;
  };
  beforeSubmit: CaptchaResponseLengths;
  afterSubmit: SubmitPageSummary;
  hcaptcha: WorkflowRegionSnapshot | null;
};

function summarizeProjection(projection: RelayProjection | null | undefined) {
  if (!projection) {
    return null;
  }

  return {
    id: projection.id,
    part: projection.part,
    region: projection.region,
    imageSize: projection.imageSize,
  };
}

function summarizeSnapshot(snapshot: WorkflowTargetSnapshot | null | undefined) {
  if (!snapshot) {
    return null;
  }

  const region = snapshot.region;

  return {
    page: snapshot.matchedPage?.url ?? null,
    verified: region?.verified === true,
    responseLength: region?.verification?.responseLength ?? 0,
    activePart: region?.activePart?.part ?? null,
    activeRegion: region?.activeRegion ?? null,
  };
}

function summarizeRelayEvent(event: RelayLifecycleEvent) {
  return {
    type: event.type,
    state: event.state,
    sessionId: event.session?.id ?? null,
    reason: "reason" in event ? event.reason : undefined,
    captcha: summarizeSnapshot(event.snapshot),
    projection: summarizeProjection("projection" in event ? event.projection : null),
    activePartBefore:
      "activePartBefore" in event ? event.activePartBefore : undefined,
    scope: "scope" in event ? event.scope : undefined,
  };
}

function summarizeSiteverify(siteverify: unknown) {
  if (!siteverify || typeof siteverify !== "object") {
    return null;
  }

  const result = siteverify as {
    success?: unknown;
    hostname?: unknown;
    challenge_ts?: unknown;
  };

  return {
    success: result.success === true,
    hostname: typeof result.hostname === "string" ? result.hostname : null,
    challengeTs:
      typeof result.challenge_ts === "string" ? result.challenge_ts : null,
  };
}

function summarizeSubmitResult(result: DemoSubmitResult) {
  return {
    ok: result.ok,
    sessionId: result.relay.sessionId,
    reason: result.relay.reason,
    beforeSubmit: {
      hcaptchaResponseLength: result.beforeSubmit.hcaptchaResponseLength,
      recaptchaResponseLength: result.beforeSubmit.recaptchaResponseLength,
    },
    afterSubmit: {
      successText: result.afterSubmit.successText,
      siteverify: summarizeSiteverify(result.afterSubmit.siteverify),
      tokenLength: result.afterSubmit.tokenLength,
      hcaptchaResponseLength: result.afterSubmit.hcaptchaResponseLength,
      recaptchaResponseLength: result.afterSubmit.recaptchaResponseLength,
    },
    hcaptcha: result.hcaptcha
      ? {
          verified: result.hcaptcha.verified === true,
          activePart: result.hcaptcha.activePart?.part ?? null,
          activeRegion: result.hcaptcha.activeRegion ?? null,
        }
      : null,
  };
}

function logWorkflowEvent(event: RelayLifecycleEvent) {
  console.log(`[workflow] ${event.type}`, JSON.stringify(summarizeRelayEvent(event)));
}

export type {
  CaptchaResponseLengths,
  DemoSubmitResult,
  SubmitPageSummary,
};
export {
  logWorkflowEvent,
  summarizeSubmitResult,
};
