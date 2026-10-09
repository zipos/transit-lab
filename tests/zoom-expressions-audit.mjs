/* MapLibre drops a layer with an invalid style expression and only emits an error event, so the route lines and
   flow bands silently vanished once. Zoom may only be the input of one top-level interpolate/step expression. */
import assert from 'node:assert/strict';
import {
  routeWidthExpression, routeOpacityExpression, routeHaloOpacityExpression,
  flowWidthExpression, flowBandOpacityExpression,
} from '../src/layers.js';

function zoomUses(node) {
  if (!Array.isArray(node)) return 0;
  const self = node[0] === 'zoom' ? 1 : 0;
  return self + node.reduce((sum, child) => sum + zoomUses(child), 0);
}

function assertZoomValid(name, expression) {
  assert.ok(['interpolate', 'step'].includes(expression[0]), `${name}: top level must be interpolate or step`);
  const input = expression[0] === 'interpolate' ? expression[2] : expression[1];
  assert.deepEqual(input, ['zoom'], `${name}: top level must be driven by zoom`);
  assert.equal(zoomUses(expression), 1, `${name}: zoom may appear only once, as the top-level input`);
  const outputs = expression.slice(expression[0] === 'interpolate' ? 3 : 2).filter((_, i) => i % 2 === (expression[0] === 'interpolate' ? 1 : 0));
  assert.ok(outputs.length >= 2, `${name}: needs at least two zoom stops`);
}

const expressions = {
  routeWidth: routeWidthExpression(),
  routeOpacity: routeOpacityExpression(),
  routeHaloOpacity: routeHaloOpacityExpression(),
  flowWidth: flowWidthExpression(),
  flowBandOpacity: flowBandOpacityExpression(0.88),
  flowBandHaloOpacity: flowBandOpacityExpression(0.55),
};
for (const [name, expression] of Object.entries(expressions)) assertZoomValid(name, expression);

const stops = expression => expression.slice(3).filter((_, i) => i % 2 === 0);
assert.deepEqual(stops(expressions.routeWidth), [9, 11, 13, 17]);
assert.ok(stops(expressions.routeOpacity).every((z, i, all) => i === 0 || z > all[i - 1]), 'zoom stops must ascend');
assert.ok(stops(expressions.flowWidth).every((z, i, all) => i === 0 || z > all[i - 1]), 'zoom stops must ascend');
console.log('zoom-expressions-audit: ok');
