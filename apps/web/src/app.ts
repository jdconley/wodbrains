import { getRoute } from './router';
import { renderImportPage } from './pages/import';
import { renderRunPage } from './pages/run';
import { renderWorkoutsPage } from './pages/workouts';
import { renderTimerEditPage } from './pages/timer-edit';
import { renderAboutPage } from './pages/about';
import { renderPrivacyPage } from './pages/privacy';
import { renderTermsPage } from './pages/terms';

export function startApp(root: HTMLElement) {
  const render = async () => {
    const route = getRoute();
    if (route.name === 'import') {
      renderImportPage(root);
      return;
    }
    if (route.name === 'about') {
      renderAboutPage(root);
      return;
    }
    if (route.name === 'privacy') {
      renderPrivacyPage(root);
      return;
    }
    if (route.name === 'terms') {
      renderTermsPage(root);
      return;
    }
    if (route.name === 'definition') {
      await renderTimerEditPage(root, route.definitionId);
      return;
    }
    if (route.name === 'definition-edit') {
      await renderTimerEditPage(root, route.definitionId);
      return;
    }
    if (route.name === 'workouts') {
      await renderWorkoutsPage(root);
      return;
    }
    if (route.name === 'run') {
      await renderRunPage(root, route.runId);
      return;
    }
  };

  window.addEventListener('popstate', () => {
    void render();
  });

  void render();
}
