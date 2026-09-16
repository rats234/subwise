// Local, zero-cost fallback so the "draft cancellation email" feature works
// even if no ANTHROPIC_API_KEY is configured. When a key IS present,
// routes/ai.js asks Claude to personalize this instead.
function templateCancelEmail({ name, costDisplay, billingCycle }) {
  return [
    `Subject: Please cancel my ${name} subscription`,
    "",
    "Hi there,",
    "",
    `I'd like to cancel my ${billingCycle} subscription to ${name} (currently billed at ${costDisplay}), effective at the end of my current billing period.`,
    "",
    "Please confirm the cancellation and let me know if any further action is needed on my end. If there's a way to pause or downgrade the plan instead of a full cancellation, I'm open to hearing about it.",
    "",
    "Thanks for your help.",
  ].join("\n");
}

module.exports = { templateCancelEmail };
