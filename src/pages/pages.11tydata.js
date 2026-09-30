import { buildJsonLd } from '../_lib/schema.js';

export default {
  eleventyComputed: {
    jsonLd: (data) => buildJsonLd(data),
  },
};
