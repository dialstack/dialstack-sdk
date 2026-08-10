/**
 * Stylesheets are imported as strings, not injected into the document.
 *
 * The dial-plan editor renders into a shadow root and adopts its CSS there — a
 * document-level stylesheet would not cross that boundary — so the rollup build's
 * `cssRawPlugin` turns each `.css` import into an exported string. This tells
 * TypeScript the same thing.
 *
 * Declared here as well as in the browser package because these compile as
 * separate programs: an ambient declaration does not cross that boundary.
 */
declare module '*.css' {
  const content: string;
  export default content;
}
