const {transcribe}=require('../electron/engine.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const input=process.env.AVA_REPRO_AUDIO;
 if(!input)throw new Error('Set AVA_REPRO_AUDIO to the local reproduction clip.');
 const result=await transcribe({input,root:process.cwd(),device:process.env.AVA_REPRO_DEVICE || 'gpu'});
 assert.ok(!result.text.includes('PYM JBZ'), 'Repeated PYM JBZ failure reproduced');
 assert.ok(/[\u0600-\u06ff]/.test(result.text), 'Expected Persian speech output');
 console.log('Quiet-intro regression passed');
})().catch(e=>{console.error(e.message);process.exitCode=1});
