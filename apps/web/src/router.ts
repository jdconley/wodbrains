export type Route =
  | { name: 'import' }
  | { name: 'about' }
  | { name: 'privacy' }
  | { name: 'terms' }
  | { name: 'workouts' }
  | { name: 'definition'; definitionId: string }
  | { name: 'definition-edit'; definitionId: string }
  | { name: 'run'; runId: string };

export function getRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path === '/') return { name: 'import' };
  if (path === '/about') return { name: 'about' };
  if (path === '/privacy') return { name: 'privacy' };
  if (path === '/terms') return { name: 'terms' };
  if (path === '/workouts') return { name: 'workouts' };

  const runMatch = path.match(/^\/r\/([^/]+)$/);
  if (runMatch) return { name: 'run', runId: decodeURIComponent(runMatch[1]) };

  const defEditMatch = path.match(/^\/w\/([^/]+)\/edit$/);
  if (defEditMatch)
    return { name: 'definition-edit', definitionId: decodeURIComponent(defEditMatch[1]) };

  const defMatch = path.match(/^\/w\/([^/]+)$/);
  if (defMatch) return { name: 'definition', definitionId: decodeURIComponent(defMatch[1]) };

  // Fallback to import.
  return { name: 'import' };
}

export function navigate(path: string) {
  if (path === window.location.pathname) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
