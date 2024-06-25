const CACHE_SPACE = 'rise-cache';
const cachedFetch = (...params) => {
  const [url, options] = params;
  if (!('caches' in window)) return window.fetch;
  const cacheKey = btoa(url + (options ? options.body : ''));
  return caches.open(CACHE_SPACE).then((cache) => {
    return cache
      .match(cacheKey)
      .then((response) => {
        if (response) {
          const date = new Date(response.headers.get('date'));
          // Cache in 1 day
          if (Date.now() < date.getTime() + 1000 * 60 * 60 * 24) {
            return response;
          }
        }

        return fetch(url, options).then((response) => {
          if (response.status < 400 && url.includes('graphql.json')) {
            cache.put(cacheKey, response.clone());
          }

          return response;
        });
      })
      .catch((error) => {
        console.error('  Error in fetch handler:', error);
        throw error;
      });
  });
};
window.Rise = {
  shopifyClient: window.ShopifyStorefrontAPIClient.createStorefrontApiClient({
    storeDomain: 'https://ecomrise-liem.myshopify.com',
    apiVersion: '2024-01',
    clientName: 'storefront-api-client-js',
    publicAccessToken: 'ed6c5bc4f915fb403c306bf0b9445de8',
    customFetchApi: cachedFetch,
  }),
  locale: 'vi',
  currency: 'VND',
  country: 'VN',
  TemplateEngine: undefined,
};
document.addEventListener('rise-template-engine:init', () => {
  window.Rise.TemplateEngine = window.RiseTemplateEngine;
  window.Rise.TemplateEngine.store('global', {
    locale: window.Rise.locale,
    currency: window.Rise.currency,
    country: window.Rise.country,
    formatMoney: function (data) {
      return new Intl.NumberFormat(this.locale, {
        style: 'currency',
        currency: data.currencyCode,
      }).format(parseFloat(data.amount));
    },
  });
});
class RiseXLDRZNVFZPQNDBEGBTAN extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      `.rise-layouts{box-sizing:border-box;overflow:hidden;display:grid;display:-ms-grid;display:-moz-grid;}.rise-grid-group{box-sizing:border-box;overflow:hidden;display:grid;display:-ms-grid;display:-moz-grid;}@media (min-width:0px){.rise-grid-group{grid-template-columns:0px repeat(48,1fr) 0px;grid-template-rows:auto;}}@media (min-width:768px){.rise-grid-group{grid-template-columns:0px repeat(81,1fr) 0px;grid-template-rows:auto;}}@media (min-width:1200px){.rise-grid-group{grid-template-columns:0px repeat(98,1fr) 0px;grid-template-rows:auto;}}.rise-grid-item{box-sizing:border-box;}.rise-block{display:flex;flex-wrap:wrap;overflow:hidden;box-sizing:border-box;width:100%;height:100%;}.rise-grid-group{height:100%;}@media (min-width:0px){.rise-layouts{display:grid;grid-template-columns:12px repeat(48,1fr) 12px;grid-template-rows:6px repeat(15,10px) 6px;grid-template-columns:12px repeat(48,1fr) 12px;grid-template-rows:6px repeat(15,10px) 6px;grid-gap:0px;position:relative;}}@media (min-width:768px){.rise-layouts{display:grid;grid-template-columns:25px repeat(81,1fr) 25px;grid-template-rows:12px repeat(15,10px) 12px;grid-template-columns:25px repeat(81,1fr) 25px;grid-template-rows:12px repeat(15,10px) 12px;grid-gap:0px;position:relative;}}@media (min-width:1200px){.rise-layouts{display:grid;grid-template-columns:50px repeat(98,1fr) 50px;grid-template-rows:25px repeat(15,10px) 25px;grid-template-columns:50px repeat(98,1fr) 50px;grid-template-rows:25px repeat(15,10px) 25px;grid-gap:0px;position:relative;}}@media (min-width:0px){.rise-grid-item-yzhotiiuutgohtqnwcgz{grid-area:6 / 16 /16 / 34;}}@media (min-width:768px){.rise-grid-item-yzhotiiuutgohtqnwcgz{grid-area:6 / 16 /16 / 34;}}@media (min-width:1200px){.rise-grid-item-yzhotiiuutgohtqnwcgz{grid-area:6 / 16 /16 / 34;}}.rise-grid-item-yzhotiiuutgohtqnwcgz{z-index:100;}.rise-block-yzhotiiuutgohtqnwcgz{box-sizing:border-box;}@media (min-width:1200px){.rise-block-yzhotiiuutgohtqnwcgz{;}.rise-block-yzhotiiuutgohtqnwcgz .rise-text{font-style:oblique;text-decoration:underline;;}}`
    );
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.innerHTML = `<div class="rise-layouts"><div class=" rise-grid-item rise-grid-item-yzhotiiuutgohtqnwcgz"><div class="rise-block rise-block-yzhotiiuutgohtqnwcgz rise-block-is-text" data-block-name="text" data-block-id="yzhotiiuutgohtqnwcgz"><div class="rise-text"><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p></div></div></div></div>`;
  }
  connectedCallback() {
    (function () {
      const JS = {
        /* Define javascript of elements */
        text: function () {},
      };
      /* Execute script for each element */
      JS['text'].call({
        id: 'yzhotiiuutgohtqnwcgz',
        name: 'text',
        $node: this.$root.querySelector('.rise-block-yzhotiiuutgohtqnwcgz'),
        env: 'live',
      });
    }).call({ $root: this.shadowRoot });
  }
}
customElements.define('rise-xldrznvfzpqndbegbtan', RiseXLDRZNVFZPQNDBEGBTAN);

let dom = document.createElement('rise-xldrznvfzpqndbegbtan');
document.body.appendChild(dom);
