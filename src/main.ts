import {
  defineWorkflow,
  loadLaunchPayload,
} from "@challenge-relay/projection/workflow";
import {
  createChallengeInspector,
  hcaptchaAdapter,
} from "@challenge-relay/challenge";
import { DemoController } from "./demo-controller";
import { readySelector } from "./selectors";

const demo = new DemoController();

const workflowApp = defineWorkflow({
  loadLaunch: loadLaunchPayload,
  defaults: {},
  inspectState: createChallengeInspector({
    adapters: [hcaptchaAdapter()],
  }),
  browserReadySelector: readySelector,
  relay: {
    onRequired: (event) => demo.onRelayRequired(event),
    onAssigned: (event) => demo.onRelayAssigned(event),
    onProjecting: (event) => demo.onRelayProjecting(event),
    onCompleted: (event) => demo.onRelayCompleted(event),
    onCancelled: (event) => demo.onRelayCancelled(event),
    onFailed: (event) => demo.onRelayFailed(event),
  },
  actions: ({ runtime, targetService }) => ({
    driveSignupToHcaptcha: async (payload) => demo.driveSignupToHcaptcha({
      runtime,
      targetService,
      payload,
    }),
  }),
  capabilities: ["projection", "input"],
  bootstrap: {
    commandName: "driveSignupToHcaptcha",
    shouldRun: (payload) => Object.keys(payload).length > 0,
  },
});

workflowApp.start().catch((error) => {
  demo.fail("workflow start failed", error);
});
