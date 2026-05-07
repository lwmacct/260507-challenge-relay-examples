import type {
  RelayAssignedEvent,
  RelayCancelledEvent,
  RelayCompletedEvent,
  RelayFailedEvent,
  RelayProjectingEvent,
  RelayRequiredEvent,
  WorkflowPage,
  WorkflowRuntime,
  WorkflowTargetService,
} from "@challenge-relay/projection/workflow";
import {
  logWorkflowEvent,
  summarizeSubmitResult,
} from "./relay-summary";
import type {
  CaptchaResponseLengths,
  DemoSubmitResult,
  SubmitPageSummary,
} from "./relay-summary";
import {
  hcaptchaResponseSelector,
  submitSelector,
} from "./selectors";

type WorkflowServices = {
  runtime: WorkflowRuntime;
  targetService: WorkflowTargetService;
};

type DriveSignupContext = WorkflowServices & {
  payload: Record<string, unknown>;
};

type DemoState =
  | "bootstrapping"
  | "relayRequired"
  | "relayAssigned"
  | "projecting"
  | "relayCompleted"
  | "submitting"
  | "done"
  | "cancelled"
  | "failed";

const completedReasonsToSubmit = new Set<RelayCompletedEvent["reason"]>([
  "verified",
  "region_gone",
  "workflow_completed",
]);

class DemoController {
  private services: WorkflowServices | null = null;
  private state: DemoState = "bootstrapping";
  private finishing = false;

  async driveSignupToHcaptcha({
    runtime,
    targetService,
    payload,
  }: DriveSignupContext) {
    this.services = { runtime, targetService };

    const page = await runtime.openSignupPage();
    const text = typeof payload.text === "string" ? payload.text : "";

    if (text) {
      await page.locator('input[type="text"]').fill(text);
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForFunction(
      () => Boolean(document.querySelector("iframe")),
      { timeout: 20000 }
    );

    return {
      ok: true,
      url: page.url(),
      filled: {
        text,
      },
      hcaptcha: await targetService.inspectRegionState(page),
    };
  }

  onRelayRequired(event: RelayRequiredEvent) {
    this.state = "relayRequired";
    logWorkflowEvent(event);
  }

  onRelayAssigned(event: RelayAssignedEvent) {
    this.state = "relayAssigned";
    logWorkflowEvent(event);
  }

  onRelayProjecting(event: RelayProjectingEvent) {
    this.state = "projecting";
    logWorkflowEvent(event);
  }

  async onRelayCompleted(event: RelayCompletedEvent) {
    if (this.finishing) {
      return;
    }

    this.state = "relayCompleted";
    logWorkflowEvent(event);

    if (!completedReasonsToSubmit.has(event.reason)) {
      this.finish(0);
      return;
    }

    this.finishing = true;
    this.state = "submitting";

    try {
      const result = await this.collectSubmitResult(event);
      console.log(
        "[workflow] demo submit result",
        JSON.stringify(summarizeSubmitResult(result))
      );
      this.state = "done";
      this.finish(0);
    } catch (error) {
      this.fail("demo submit failed", error);
    }
  }

  onRelayCancelled(event: RelayCancelledEvent) {
    if (this.finishing) {
      return;
    }

    this.state = "cancelled";
    logWorkflowEvent(event);
    this.finish(0);
  }

  onRelayFailed(event: RelayFailedEvent) {
    this.state = "failed";
    logWorkflowEvent(event);
    this.fail("relay failed", event.error);
  }

  fail(message: string, error: unknown) {
    if (this.finishing && this.state !== "submitting") {
      return;
    }

    this.finishing = true;
    this.state = "failed";
    console.error(`[workflow] ${message}`, error);
    this.finish(1);
  }

  private async collectSubmitResult(
    relayEvent: RelayCompletedEvent
  ): Promise<DemoSubmitResult> {
    if (!this.services) {
      throw new Error("Workflow services are not ready.");
    }

    const { runtime, targetService } = this.services;
    const page = await runtime.getOrCreateTargetPage();

    await page.bringToFront().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.waitForCaptchaResponse(page);

    const beforeSubmit = await this.getCaptchaResponseLengths(page);
    const submit = page.locator(submitSelector);

    await submit.first().click({ timeout: 10000 });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.waitForSubmitResult(page);

    const afterSubmit = await this.getSubmitPageSummary(page);
    let hcaptcha = null;

    try {
      hcaptcha = await targetService.inspectRegionState(page);
    } catch {
      hcaptcha = null;
    }

    return {
      ok: true,
      relay: {
        sessionId: relayEvent.session.id,
        reason: relayEvent.reason,
        lastProjectionId: relayEvent.projection?.id ?? null,
        activePartBefore: relayEvent.activePartBefore,
      },
      beforeSubmit,
      afterSubmit,
      hcaptcha,
    };
  }

  private async waitForCaptchaResponse(page: WorkflowPage) {
    await page
      .waitForFunction(
        (selector) =>
          Array.from(document.querySelectorAll<HTMLTextAreaElement>(selector)).some(
            (element) => element.value.length > 0
          ),
        hcaptchaResponseSelector,
        { timeout: 5000 }
      )
      .catch(() => {});
  }

  private async waitForSubmitResult(page: WorkflowPage) {
    await page
      .waitForFunction(
        () => {
          const text = document.body?.innerText ?? "";

          return (
            text.includes("验证成功") ||
            text.includes("siteverify") ||
            Boolean(document.querySelector("pre"))
          );
        },
        { timeout: 5000 }
      )
      .catch(() => {});
  }

  private async getCaptchaResponseLengths(
    page: WorkflowPage
  ): Promise<CaptchaResponseLengths> {
    return page.evaluate((selector) => {
      const hcaptcha = document.querySelector<HTMLTextAreaElement>(
        'textarea[name="h-captcha-response"]'
      );
      const recaptcha = document.querySelector<HTMLTextAreaElement>(
        'textarea[name="g-recaptcha-response"]'
      );

      return {
        url: location.href,
        title: document.title,
        hcaptchaResponseLength: hcaptcha?.value.length ?? 0,
        recaptchaResponseLength: recaptcha?.value.length ?? 0,
      };
    }, hcaptchaResponseSelector);
  }

  private async getSubmitPageSummary(
    page: WorkflowPage
  ): Promise<SubmitPageSummary> {
    return page.evaluate((selector) => {
      const text = document.body?.innerText?.trim() ?? "";
      const token = text.includes("Token:")
        ? text.split("Token:").slice(1).join("Token:").trim()
        : "";
      let siteverify: unknown = null;

      for (const pre of document.querySelectorAll("pre")) {
        try {
          siteverify = JSON.parse(pre.textContent ?? "");
          break;
        } catch {}
      }

      return {
        url: location.href,
        title: document.title,
        successText: text.split("\n")[0] ?? "",
        siteverify,
        tokenLength: token.length,
        tokenPrefix: token.slice(0, 32),
        ...Array.from(
          document.querySelectorAll<HTMLTextAreaElement>(selector)
        ).reduce(
          (acc, element) => {
            if (element.name === "h-captcha-response") {
              acc.hcaptchaResponseLength = element.value.length;
            }

            if (element.name === "g-recaptcha-response") {
              acc.recaptchaResponseLength = element.value.length;
            }

            return acc;
          },
          {
            hcaptchaResponseLength: 0,
            recaptchaResponseLength: 0,
          }
        ),
      };
    }, hcaptchaResponseSelector);
  }

  private finish(code: 0 | 1) {
    setTimeout(() => process.exit(code), 20);
  }
}

export { DemoController };
