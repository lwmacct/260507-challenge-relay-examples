import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { defineWorkflow } from "@challenge-relay/projection/workflow";
import type {
  WorkflowLaunch,
  WorkflowRuntime,
} from "@challenge-relay/projection/workflow";
import {
  createChallengeInspector,
  hcaptchaAdapter,
} from "@challenge-relay/challenge";

type JsonObject = Record<string, unknown>;

function object(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }

  return value as JsonObject;
}

function loadLaunchPayload(): WorkflowLaunch {
  const { values } = parseArgs({
    options: {
      config: {
        type: "string",
        short: "c",
      },
    },
  });

  if (!values.config) {
    throw new Error("Missing required --config <path>.");
  }

  const configFilePath = resolve(values.config);
  const raw = object(
    JSON.parse(readFileSync(configFilePath, "utf8")),
    "Workflow launch payload"
  );

  return {
    raw,
    configFilePath,
    config: object(raw.config, "Workflow launch payload config"),
    data: raw.data === undefined ? {} : object(raw.data, "Workflow launch payload data"),
    number: (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
  };
}

async function fillDemoForm(
  runtime: WorkflowRuntime,
  payload: Record<string, unknown>
) {
  const page = await runtime.openSignupPage();
  const text = typeof payload.text === "string" ? payload.text : "";

  if (text) {
    await page.locator('input[type="text"]').fill(text);
  }

  if (payload.submit === true) {
    await page.getByRole("button", { name: "Submit" }).click();
  }

  return {
    page,
    filled: {
      text,
      submitted: payload.submit === true,
    },
  };
}

const workflowApp = defineWorkflow({
  loadLaunch: loadLaunchPayload,
  defaults: {
    workflow: {
      id: "wf_demo_01",
      kind: "demo",
    },
    platform: {
      url: "http://127.0.0.1:3000",
    },
    browser: {
      endpoint: "http://localhost:9222",
    },
    target: {
      url: "https://accounts.hcaptcha.com/demo",
      pageMatch: "accounts.hcaptcha.com/demo",
    },
    stream: {
      intervalMs: 66,
      jpegQuality: 70,
      tileSize: 10,
      keyframeIntervalMs: 2000,
    },
  },
  inspectState: createChallengeInspector({
    adapters: [hcaptchaAdapter()],
  }),
  browserReadySelector:
    'iframe[src*="hcaptcha"], iframe[title*="hCaptcha"], input[type="text"]',
  projectionOptions: {
    logPrefix: "Demo screencast",
  },
  actions: ({ runtime, targetService }) => ({
    driveSignupToHcaptcha: async (payload) => {
      const result = await fillDemoForm(runtime, payload);

      await result.page.waitForLoadState("domcontentloaded").catch(() => {});
      await result.page.waitForFunction(
        'Boolean(document.querySelector("iframe"))',
        { timeout: 20000 }
      );

      return {
        ok: true,
        url: result.page.url(),
        filled: result.filled,
        hcaptcha: await targetService.inspectRegionState(result.page),
      };
    },
  }),
  capabilities: ["projection", "input"],
  bootstrap: {
    commandName: "driveSignupToHcaptcha",
    shouldRun: (payload) => Object.keys(payload).length > 0,
  },
});

workflowApp.start().catch((error) => {
  console.error(error);
  process.exit(1);
});
