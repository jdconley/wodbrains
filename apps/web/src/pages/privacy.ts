import { appHeader, setAppHeaderTitle, setupAppHeader } from '../components/header';
import { appFooter } from '../components/footer';
import { updateMeta } from '../meta';

export function renderPrivacyPage(root: HTMLElement) {
  updateMeta({
    title: 'Privacy Policy - WOD Brains',
    description: 'Privacy Policy for WOD Brains.',
    url: new URL('/privacy', window.location.origin).toString(),
  });

  root.innerHTML = `
    <div class="PageShell">
      ${appHeader({ backTarget: '/', centerSlot: 'title' })}
      <main class="PageContent LegalContent" id="main-content">
        <h1 class="PageTitle">Privacy Policy</h1>
        <div class="LegalMeta">Effective date: February 2, 2026</div>

        <p class="LegalBody">
          This Privacy Policy explains how WOD Brains ("we", "us") collects, uses, and shares information when you use
          the WOD Brains website and timer app (the "Service").
        </p>

        <section class="LegalSection" aria-labelledby="privacy-collect">
          <h2 class="LegalSectionTitle" id="privacy-collect">Information we collect</h2>
          <ul class="LegalList">
            <li>
              <strong>Workout inputs.</strong> The workout text you paste, links you share, or images you upload so we
              can generate a timer.
            </li>
            <li>
              <strong>Workout outputs.</strong> Timer definitions, run state, and events needed to save and sync a run
              (including shared runs).
            </li>
            <li>
              <strong>Usage + device data.</strong> Basic log data like IP address, user agent, approximate timestamps,
              and request/response metadata.
            </li>
            <li>
              <strong>Cookies + local storage.</strong> We use cookies for an anonymous session and local storage for
              preferences (like sound) and to remember your acceptance of these legal terms.
            </li>
            <li>
              <strong>Communications.</strong> If you contact us (for example by email), we receive the information you
              send us.
            </li>
          </ul>
        </section>

        <section class="LegalSection" aria-labelledby="privacy-use">
          <h2 class="LegalSectionTitle" id="privacy-use">How we use information</h2>
          <ul class="LegalList">
            <li>Provide, operate, and maintain the Service (including generating timers and syncing runs).</li>
            <li>Improve reliability, debug issues, and prevent abuse.</li>
            <li>Respond to support requests and feedback.</li>
          </ul>
        </section>

        <section class="LegalSection" aria-labelledby="privacy-share">
          <h2 class="LegalSectionTitle" id="privacy-share">How we share information</h2>
          <p class="LegalBody">
            We share information with service providers that help us run the Service, such as our hosting and
            infrastructure providers.
          </p>
          <ul class="LegalList">
            <li>
              <strong>Cloudflare.</strong> We use Cloudflare to host and deliver the Service.
            </li>
            <li>
              <strong>AI processing providers.</strong> When you ask us to generate a timer, we may send your workout
              inputs to an AI model provider to generate the timer structure.
            </li>
          </ul>
          <p class="LegalBody">
            We may also share information if required by law, or to protect the rights, safety, and security of the
            Service and its users.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="privacy-retention">
          <h2 class="LegalSectionTitle" id="privacy-retention">Retention</h2>
          <p class="LegalBody">
            We keep information for as long as needed to provide the Service, comply with legal obligations, resolve
            disputes, and enforce our agreements. You can request deletion by contacting us.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="privacy-security">
          <h2 class="LegalSectionTitle" id="privacy-security">Security</h2>
          <p class="LegalBody">
            We take reasonable measures to protect information, but no method of transmission or storage is 100%
            secure.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="privacy-children">
          <h2 class="LegalSectionTitle" id="privacy-children">Children</h2>
          <p class="LegalBody">
            The Service is not directed to children under 13, and we do not knowingly collect personal information from
            children under 13.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="privacy-changes">
          <h2 class="LegalSectionTitle" id="privacy-changes">Changes</h2>
          <p class="LegalBody">
            We may update this Privacy Policy from time to time. If we make changes, we will update the effective date
            above. Continued use of the Service after changes means you accept the updated policy.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="privacy-contact">
          <h2 class="LegalSectionTitle" id="privacy-contact">Contact</h2>
          <p class="LegalBody">
            Questions about this Privacy Policy? Contact us at
            <a class="LegalLink" href="mailto:jd@conleychaos.com">jd@conleychaos.com</a>.
          </p>
        </section>
      </main>

      ${appFooter()}
    </div>
  `;

  setupAppHeader(root, { backTarget: '/' });
  setAppHeaderTitle(root, 'Privacy Policy');
}
