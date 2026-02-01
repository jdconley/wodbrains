const DEFAULT_SITE_URL = 'https://wodbrains.com';
const DEFAULT_TITLE = 'WOD Brains magically builds a smart timer from any workout';
const DEFAULT_DESCRIPTION =
  'WOD Brains magically builds a smart timer from any workout. Paste a workout, drop a screenshot, or share a URL.';
const DEFAULT_OG_IMAGE = `${DEFAULT_SITE_URL}/og-image.jpg`;

type MetaOptions = {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
};

const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const setCanonical = (url: string) => {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
};

export const getDefaultMeta = () => ({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  url: `${DEFAULT_SITE_URL}/`,
  image: DEFAULT_OG_IMAGE,
});

export const updateMeta = (opts: MetaOptions = {}) => {
  const defaults = getDefaultMeta();
  const title = opts.title ?? defaults.title;
  const description = opts.description ?? defaults.description;
  const url = opts.url ?? defaults.url;
  const image = opts.image ?? defaults.image;

  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', image);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image);
  setCanonical(url);
};
