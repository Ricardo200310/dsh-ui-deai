import { audit, renderMarkdown } from '../lib/engine/audit.js';
console.log(renderMarkdown(audit(process.argv[2]??'test/fixtures/review-needed.html')));
