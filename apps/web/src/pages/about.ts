import { appHeader, setAppHeaderTitle, setupAppHeader } from '../components/header';
import { navigate } from '../router';
import { updateMeta } from '../meta';

export function renderAboutPage(root: HTMLElement) {
  updateMeta({
    title: 'About - WOD Brains',
    description:
      'WOD Brains magically builds a smart timer from any workout. Paste a workout, drop a screenshot, or share a URL.',
    url: new URL('/about', window.location.origin).toString(),
  });

  root.innerHTML = `
    <div class="PageShell">
      ${appHeader({ backTarget: '/', centerSlot: 'title' })}
      <main class="PageContent AboutContent" id="main-content">
        <div class="AboutHero">
          <img src="/logo.svg" alt="WOD Brains mascot" class="AboutLogo" />
          <div class="AboutHeroText">
            <p class="AboutIntro">
              WOD Brains magically builds a smart timer from any workout - built for athletes, coaches, and classes.
            </p>
          </div>
        </div>

        <section class="AboutSection">
          <h2 class="AboutSectionTitle">How it works</h2>
          <ol class="AboutList">
            <li>Paste workout text, drop a screenshot, or share a URL.</li>
            <li>WOD Brains maps the workout into rounds, intervals, and steps.</li>
            <li>Run the timer with live reps, splits, and cues.</li>
          </ol>
        </section>

        <section class="AboutSection">
          <h2 class="AboutSectionTitle">Built for sharing</h2>
          <p class="AboutBody">
            Share a workout or live run with your class, teammates, or coach. Your timer stays synced across devices.
          </p>
        </section>

        <div class="AboutActions">
          <a href="/" class="PrimaryBtn CtaBtn" id="aboutHome">Create a timer</a>
        </div>
      </main>

      <footer class="PageFooter">
        <p class="FooterTagline">
          WOD Brains magically builds a smart timer from any workout. Paste text, drop a screenshot, or share a URL.
        </p>
        <div class="FooterLinks">
          <a href="/about" class="FooterLink">About</a>
          <span class="FooterDivider" aria-hidden="true">·</span>
          <a href="mailto:jd@conleychaos.com" class="FooterLink">Contact Us</a>
        </div>
        <div class="FooterCopyright">WOD Brains™ · © 2026 Conley Chaos LLC</div>
      </footer>
    </div>
  `;

  setupAppHeader(root, { backTarget: '/' });
  setAppHeaderTitle(root, 'About WOD Brains');

  const homeLink = root.querySelector<HTMLAnchorElement>('#aboutHome');
  homeLink?.addEventListener('click', (event) => {
    event.preventDefault();
    navigate('/');
  });
}
