const FOOTER_TAGLINE =
  'WOD Brains magically builds a smart timer from any workout. Paste text, drop a screenshot, share a URL, or type a web search.';
const CONTACT_EMAIL = 'jd@conleychaos.com';
export function appFooter() {
  const year = new Date().getFullYear();
  const footerCopyright = `WOD Brains&trade; · &copy; ${year} Conley Chaos LLC`;
  return `
    <footer class="PageFooter">
      <p class="FooterTagline">${FOOTER_TAGLINE}</p>
      <nav class="FooterLinks" aria-label="Footer">
        <a href="/about" class="FooterLink">About</a>
        <span class="FooterDivider" aria-hidden="true">·</span>
        <a href="/terms" class="FooterLink">Terms</a>
        <span class="FooterDivider" aria-hidden="true">·</span>
        <a href="/privacy" class="FooterLink">Privacy</a>
        <span class="FooterDivider" aria-hidden="true">·</span>
        <a href="mailto:${CONTACT_EMAIL}" class="FooterLink">Contact Us</a>
      </nav>
      <div class="FooterCopyright">${footerCopyright}</div>
    </footer>
  `;
}
