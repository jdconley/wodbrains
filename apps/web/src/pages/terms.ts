import { appHeader, setAppHeaderTitle, setupAppHeader } from '../components/header';
import { appFooter } from '../components/footer';
import { updateMeta } from '../meta';

export function renderTermsPage(root: HTMLElement) {
  updateMeta({
    title: 'Terms and Conditions - WOD Brains',
    description: 'Terms and Conditions for WOD Brains.',
    url: new URL('/terms', window.location.origin).toString(),
  });

  root.innerHTML = `
    <div class="PageShell">
      ${appHeader({ backTarget: '/', centerSlot: 'title' })}
      <main class="PageContent LegalContent" id="main-content">
        <h1 class="PageTitle">Terms and Conditions</h1>
        <div class="LegalMeta">Effective date: February 2, 2026</div>

        <p class="LegalBody">
          These Terms and Conditions ("Terms") govern your access to and use of WOD Brains (the "Service"). By using the
          Service, you agree to these Terms and our
          <a class="LegalLink" href="/privacy">Privacy Policy</a>.
        </p>

        <section class="LegalSection" aria-labelledby="terms-use">
          <h2 class="LegalSectionTitle" id="terms-use">Use of the Service</h2>
          <ul class="LegalList">
            <li>You may use the Service for personal and internal training purposes.</li>
            <li>You agree not to misuse the Service, interfere with its operation, or attempt to access it unlawfully.</li>
            <li>
              You are responsible for the accuracy of any workout content you enter and for how you use the generated
              timer.
            </li>
          </ul>
        </section>

        <section class="LegalSection" aria-labelledby="terms-fitness">
          <h2 class="LegalSectionTitle" id="terms-fitness">Fitness disclaimer</h2>
          <p class="LegalBody">
            The Service is provided for informational and entertainment purposes only and is not medical advice. Always
            consult a qualified professional before beginning any fitness program. You assume all risks associated with
            workouts and using the Service.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-ai">
          <h2 class="LegalSectionTitle" id="terms-ai">AI-generated output</h2>
          <p class="LegalBody">
            The Service may use automated systems to interpret workout inputs. Output may be inaccurate or incomplete.
            You are responsible for reviewing the timer before relying on it.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-content">
          <h2 class="LegalSectionTitle" id="terms-content">Your content</h2>
          <p class="LegalBody">
            You retain ownership of the workout content you submit. You grant us a license to use that content to
            operate, provide, and improve the Service (including generating timers, saving workouts, and syncing shared
            runs).
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-availability">
          <h2 class="LegalSectionTitle" id="terms-availability">Availability</h2>
          <p class="LegalBody">
            We may modify, suspend, or discontinue the Service at any time. We are not liable for any unavailability or
            loss of data resulting from these changes.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-warranty">
          <h2 class="LegalSectionTitle" id="terms-warranty">Disclaimers</h2>
          <p class="LegalBody">
            The Service is provided "as is" and "as available" without warranties of any kind, whether express or
            implied, including merchantability, fitness for a particular purpose, and non-infringement.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-liability">
          <h2 class="LegalSectionTitle" id="terms-liability">Limitation of liability</h2>
          <p class="LegalBody">
            To the maximum extent permitted by law, we are not liable for any indirect, incidental, special,
            consequential, or punitive damages, or any loss of profits or revenues, arising from or related to your use
            of the Service.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-indemnity">
          <h2 class="LegalSectionTitle" id="terms-indemnity">Indemnification</h2>
          <p class="LegalBody">
            You agree to indemnify and hold harmless WOD Brains and its owners from any claims, liabilities, damages,
            and expenses arising out of your use of the Service or violation of these Terms.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-changes">
          <h2 class="LegalSectionTitle" id="terms-changes">Changes</h2>
          <p class="LegalBody">
            We may update these Terms from time to time. If we make changes, we will update the effective date above.
            Continued use of the Service after changes means you accept the updated Terms.
          </p>
        </section>

        <section class="LegalSection" aria-labelledby="terms-contact">
          <h2 class="LegalSectionTitle" id="terms-contact">Contact</h2>
          <p class="LegalBody">
            Questions about these Terms? Contact us at
            <a class="LegalLink" href="mailto:jd@conleychaos.com">jd@conleychaos.com</a>.
          </p>
        </section>
      </main>

      ${appFooter()}
    </div>
  `;

  setupAppHeader(root, { backTarget: '/' });
  setAppHeaderTitle(root, 'Terms and Conditions');
}
