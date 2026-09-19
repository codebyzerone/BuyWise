import { buildRequirements } from './data/buildRequirements.js';
import { checkFeasibility, GPU_TIERS } from './engine/feasibility.js';
import { getRecommendations } from './engine/recommendations.js';
import { laptopInterviewQuestions } from './data/laptopInterview.js';
import { laptopCatalog } from './data/laptopCatalog.js';

const answers = {
  primaryUse: { optionIds: ['college_everyday', 'ai_ml', 'programming'], customText: '' },
  budget: { optionId: '120000', customText: '' },
  ram: { optionId: '16GB', customText: '' },
  storage: { optionId: '1TB', customText: '' },
  gpu: { optionId: 'high-performance', customText: '' },
  strictness: { optionId: 'preferences', customText: '' },
  os: { optionId: 'windows', customText: '' },
  mobility: { optionId: null, customText: '' },
  display: { optionId: null, customText: '' },
  programmingWorkload: { optionIds: [], customText: '' },
  gamingType: { optionId: null, customText: '' },
  localAi: { optionId: null, customText: '' },
  creativeWorkload: { optionIds: [], customText: '' },
  professionalWorkload: { optionIds: [], customText: '' },
  collegePriority: { optionId: null, customText: '' },
  mixedUseHeaviest: { optionId: null, customText: '' },
  software: { optionId: null, customText: '' },
};

const asked = laptopInterviewQuestions.filter(q => !q.isRelevant || q.isRelevant(answers));

console.log('=== QUESTIONS ASKED ===');
for (const q of asked) {
  const a = answers[q.id];
  const v = a?.optionIds?.length ? a.optionIds.join(',') : a?.optionId ?? '—';
  console.log('  ' + q.id + ': ' + v);
}
console.log('');

const p = buildRequirements(answers, asked);

console.log('=== buildRequirements() OUTPUT ===');
console.log('budget: ' + JSON.stringify(p.budget));
console.log('  budget.strict = ' + p.budget?.strict + ' (expected: true)');
console.log('ram: ' + JSON.stringify(p.ram));
console.log('  ram.strict = ' + p.ram?.strict);
console.log('gpu: ' + JSON.stringify(p.gpu));
console.log('  gpu.strict = ' + p.gpu?.strict + ' (expected: false)');
console.log('  gpu.minimumTier = ' + p.gpu?.minimumTier);
console.log('  gpu.required = ' + p.gpu?.required);
console.log('  gpu.specificModel = ' + p.gpu?.specificModel);
console.log('os: ' + JSON.stringify(p.os));
console.log('  os.strict = ' + p.os?.strict);
console.log('performance: ' + JSON.stringify(p.performance));
console.log('derived: ' + JSON.stringify(p.derived));
console.log('');

console.log('=== HARD_CONSTRAINTS isApplicable ===');
console.log('  budget applicable: ' + (p.budget?.strict === true && Number.isFinite(p.budget?.max)));
console.log('  ram applicable:    ' + (p.ram?.strict === true && Number.isFinite(p.ram?.minimumGb)));
console.log('  gpu applicable:    ' + (p.gpu != null && p.gpu.strict === true) + ' <-- KEY CHECK');
console.log('  os applicable:     ' + (p.os != null && p.os.strict === true && p.os.preferred != null));
console.log('');

const fr = checkFeasibility(p, laptopCatalog);
console.log('=== checkFeasibility(profile, laptopCatalog) ===');
console.log('feasible: ' + fr.feasible);
console.log('matchingProducts: ' + fr.matchingProducts.length);
console.log('conflicts: ' + fr.conflicts.length);
for (const c of fr.conflicts) console.log('  [' + c.field + '] ' + c.reason);
console.log('unmetPreferences: ' + fr.unmetPreferences.length);
for (const u of fr.unmetPreferences) console.log('  [' + u.field + '] expected=' + u.expected + ' actual=' + u.actual);
console.log('');

const r = getRecommendations(p, laptopCatalog);
console.log('=== getRecommendations(profile, laptopCatalog) ===');
console.log('feasible: ' + r.feasible);
console.log('recommendations: ' + r.recommendations.length);
for (const rec of r.recommendations) {
  console.log('  ' + rec.product.id + ' | ' + rec.product.brand + ' ' + rec.product.model + ' | Rs.' + rec.product.pricing.currentPrice + ' | score=' + rec.score + ' | ' + rec.matchLabel);
}
console.log('conflicts: ' + r.conflicts.length);
for (const c of r.conflicts) console.log('  [' + c.field + '] ' + c.reason);
console.log('');

console.log('=== CASE ANALYSIS ===');
console.log('CASE A (the bug):');
console.log('  gpu.strict===false: ' + (p.gpu?.strict === false) + ' (actual: ' + p.gpu?.strict + ')');
console.log('  feasible: ' + r.feasible);
console.log('  conflicts.length===0: ' + (r.conflicts.length === 0));
console.log('  recs.length>0: ' + (r.recommendations.length > 0));
console.log('  => ' + (p.gpu?.strict === false && r.feasible && r.conflicts.length===0 && r.recommendations.length>0 ? 'PASS' : 'FAIL - BUG REPRODUCED'));

const a2 = JSON.parse(JSON.stringify(answers));
a2.strictness = { optionId:'must-have', customText:'' };
const asked2 = laptopInterviewQuestions.filter(q => !q.isRelevant || q.isRelevant(a2));
const p2 = buildRequirements(a2, asked2);
const r2 = getRecommendations(p2, laptopCatalog);
console.log('');
console.log('CASE B (explicit must-have GPU):');
console.log('  gpu.strict===true: ' + (p2.gpu?.strict === true) + ' (actual: ' + p2.gpu?.strict + ')');
console.log('  feasible: ' + r2.feasible);
console.log('  => ' + (p2.gpu?.strict === true ? 'PASS' : 'FAIL'));

const a3 = JSON.parse(JSON.stringify(answers));
a3.gpu = { optionId:null, customText:'' };
a3.gamingType = { optionId:'aaa', customText:'' };
const asked3 = laptopInterviewQuestions.filter(q => !q.isRelevant || q.isRelevant(a3));
const p3 = buildRequirements(a3, asked3);
const r3 = getRecommendations(p3, laptopCatalog);
console.log('');
console.log('CASE C (inferred GPU from gaming):');
console.log('  gpu.strict===false: ' + (p3.gpu?.strict === false) + ' (actual: ' + p3.gpu?.strict + ')');
console.log('  gpu.minimumTier: ' + p3.gpu?.minimumTier);
console.log('  feasible: ' + r3.feasible);
console.log('  => ' + (p3.gpu?.strict === false ? 'PASS' : 'FAIL'));

const a4 = JSON.parse(JSON.stringify(answers));
a4.budget = { optionId:'50000', customText:'' };
const asked4 = laptopInterviewQuestions.filter(q => !q.isRelevant || q.isRelevant(a4));
const p4 = buildRequirements(a4, asked4);
const r4 = getRecommendations(p4, laptopCatalog);
console.log('');
console.log('CASE D (budget below all prices):');
console.log('  budget.max: ' + p4.budget?.max);
console.log('  feasible===false: ' + (r4.feasible === false));
console.log('  budget conflict: ' + r4.conflicts.some(c => c.field==='budget'));
console.log('  => ' + (r4.feasible===false && r4.conflicts.some(c=>c.field==='budget') ? 'PASS' : 'FAIL'));

const rE2 = getRecommendations(p, laptopCatalog);
const same = JSON.stringify(r.recommendations) === JSON.stringify(rE2.recommendations) && r.conflicts.length === rE2.conflicts.length;
console.log('');
console.log('CASE E (determinism):');
console.log('  identical outputs: ' + same);
console.log('  => ' + (same ? 'PASS' : 'FAIL'));

console.log('');
console.log('=== TRACE COMPLETE ===');
