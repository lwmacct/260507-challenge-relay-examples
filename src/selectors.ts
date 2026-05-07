const hcaptchaResponseSelector =
  'textarea[name="h-captcha-response"], textarea[name="g-recaptcha-response"]';
const submitSelector =
  '#hcaptcha-demo-submit, input[type="submit"], button[type="submit"], button:has-text("Submit")';
const readySelector =
  'iframe[src*="hcaptcha"], iframe[title*="hCaptcha"], input[type="text"]';

export { hcaptchaResponseSelector, readySelector, submitSelector };
