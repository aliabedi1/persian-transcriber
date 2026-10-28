import { test } from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,estimateRemaining} from '../src/lib/timing.ts';
test('elapsed formatting supports seconds, minutes and long recordings',()=>{assert.equal(formatDuration(999),'00:00');assert.equal(formatDuration(61500),'01:01');assert.equal(formatDuration(3661000),'01:01:01')});
test('ETA waits for usable progress, estimates remaining work and completes',()=>{assert.equal(estimateRemaining(1000,0),null);assert.equal(estimateRemaining(10000,25),30000);assert.equal(estimateRemaining(10000,100),0);assert.equal(estimateRemaining(1000,NaN),null)});
