/**
 * The extension does all of its work in the content script. This background
 * script only exists so browsers register the extension's runtime, which the
 * end-to-end tests use to find the extension id and open the options page.
 */
const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
if (runtime && runtime.onInstalled) {
  runtime.onInstalled.addListener(() => {});
}
